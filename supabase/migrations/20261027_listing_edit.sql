-- Listing edits from the map: an abuse guard and log, and a narrow mirror writer. Monday stays the source of
-- truth; the route writes Monday first, then calls listing_edit_mirror so the map shows the edit at once (the
-- Monday webhook re-reads the item seconds later and confirms it).
--
-- The three functions are granted to anon (the app holds only the publishable key), so each one is gated on a
-- server-only secret: p_secret must equal sync_config 'MAP_EDIT_KEY' (RLS-locked), which the route reads from
-- env MAP_EDIT_SECRET. Without the row nothing can be logged or mirrored. Values are validated here as well as
-- in lib/listing-edit.ts, so the log only ever holds valid values and the mirror only writes logged ones.
--
-- Clearing a Monday column is done by the route with a JSON null for every kind (numbers, text, long_text,
-- date, dropdown), per monday.com's API reference "Changing column values" / per-column "Clear" sections
-- (developer.monday.com/api-reference): in change_multiple_column_values "" sets a numbers column to 0.
--
-- Every statement stands on its own so it can be applied one at a time (the connector cancels at ~60 s),
-- and the whole file can be re-run.

-- 1. listing_edit_log: one row per edit that passed the guard. The guard is the only inserter.
--    Lifecycle: pending → monday_ok (Monday written) → applied (mirrored, or finished without the mirror);
--    pending → conflict | noop | failed | dry_run.
create table if not exists public.listing_edit_log (
  id               bigserial primary key,
  at               timestamptz not null default now(),
  property_item_id text not null,
  ip               text,
  editor           text,
  fields           text[] not null,
  changes          jsonb not null,
  before           jsonb,
  status           text not null default 'pending'
);

alter table public.listing_edit_log drop constraint if exists listing_edit_log_status_check;

alter table public.listing_edit_log add constraint listing_edit_log_status_check
  check (status in ('pending', 'monday_ok', 'applied', 'conflict', 'failed', 'dry_run', 'noop'));

create index if not exists listing_edit_log_property_at_idx on public.listing_edit_log (property_item_id, at);

create index if not exists listing_edit_log_ip_at_idx on public.listing_edit_log (ip, at);

create index if not exists listing_edit_log_at_idx on public.listing_edit_log (at);

alter table public.listing_edit_log enable row level security;

revoke all on table public.listing_edit_log from anon, authenticated;

revoke all on sequence public.listing_edit_log_id_seq from anon, authenticated;

-- 2. Drop the earlier, ungated signatures of this migration's functions so none can linger callable by anon.
drop function if exists public.listing_edit_guard(text, text, text, text[], jsonb);

drop function if exists public.listing_edit_finish(bigint, text, jsonb);

drop function if exists public.listing_edit_mirror(text, jsonb);

-- 3. The secret check. Not callable by API roles; the definer functions below call it as owner.
create or replace function public.listing_edit_key_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(p_secret is not null and p_secret <> ''
                  and p_secret = (select value from public.sync_config where key = 'MAP_EDIT_KEY'), false);
$$;

revoke all on function public.listing_edit_key_ok(text) from public, anon, authenticated;

-- 4. Value rules, the same as lib/listing-edit.ts: only the 18 editable keys; a JSON null clears; numbers
--    0–100000 (bedrooms and bathrooms 0–20, bedrooms and sqft whole, bathrooms in halves); Yes/No; an http(s)
--    link ≤ 500 chars; notes ≤ 2000 chars; a real date 2020-01-01..2035-12-31. Not callable by API roles.
create or replace function public.listing_edit_valid(p_changes jsonb)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
declare k text; v jsonb; t text; n numeric; d date;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then return false; end if;
  for k, v in select key, value from jsonb_each(p_changes) loop
    if k not in ('next_availability', 'bedrooms', 'bathrooms', 'sqft', 'monthly_rate', 'security_deposit', 'cleaning_fee',
                 'admin_fee', 'application_fee', 'move_in_fee', 'pet_deposit', 'pet_fee', 'pet_rent', 'pet_status',
                 'furnished', 'fenced_yard', 'property_link', 'notes') then
      return false;
    end if;
    continue when jsonb_typeof(v) = 'null';
    t := v #>> '{}';
    if k in ('pet_status', 'furnished', 'fenced_yard') then
      if jsonb_typeof(v) <> 'string' or t not in ('Yes', 'No') then return false; end if;
    elsif k = 'property_link' then
      if jsonb_typeof(v) <> 'string' or t !~ '^https?://' or length(t) > 500 then return false; end if;
    elsif k = 'notes' then
      if jsonb_typeof(v) <> 'string' or length(t) > 2000 then return false; end if;
    elsif k = 'next_availability' then
      if jsonb_typeof(v) <> 'string' or t !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      begin
        d := t::date;
      exception when others then
        return false;
      end;
      if d < date '2020-01-01' or d > date '2035-12-31' then return false; end if;
    else
      if jsonb_typeof(v) <> 'number' then return false; end if;
      n := t::numeric;
      if n < 0 or n > (case when k in ('bedrooms', 'bathrooms') then 20 else 100000 end) then return false; end if;
      if k in ('bedrooms', 'sqft') and n <> trunc(n) then return false; end if;
      if k = 'bathrooms' and n * 2 <> trunc(n * 2) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.listing_edit_valid(jsonb) from public, anon, authenticated;

-- 5. The guard. Answers forbidden | invalid | not_found | ip_limit | busy | property_limit | daily_cap, or logs
--    the edit as pending and answers 'ok:<log id>'. Limits: 30 attempts per IP per 10 min (every logged row; a
--    missing IP is its own 'unknown' bucket); 20 edits per property per hour and 500 per day overall, counting
--    only edits that reached Monday (monday_ok, applied). 'busy' while another edit of the same property is
--    in flight (pending or monday_ok, last 30 s). The properties row lock serialises edits of one property.
create or replace function public.listing_edit_guard(p_secret text, p_property_item_id text, p_ip text, p_editor text,
                                                     p_fields text[], p_changes jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id bigint; v_ip text := coalesce(nullif(p_ip, ''), 'unknown');
begin
  if not public.listing_edit_key_ok(p_secret) then return 'forbidden'; end if;
  if not public.listing_edit_valid(p_changes) then return 'invalid'; end if;
  if p_fields is null or (select array_agg(f order by f) from unnest(p_fields) f)
                         is distinct from (select array_agg(k order by k) from jsonb_object_keys(p_changes) k) then
    return 'invalid';
  end if;
  perform 1 from public.properties where monday_item_id = p_property_item_id for update;
  if not found then return 'not_found'; end if;
  if (select count(*) from public.listing_edit_log where ip = v_ip and at > now() - interval '10 minutes') >= 30 then
    return 'ip_limit';
  end if;
  if exists (select 1 from public.listing_edit_log where property_item_id = p_property_item_id
             and status in ('pending', 'monday_ok') and at > now() - interval '30 seconds') then
    return 'busy';
  end if;
  if (select count(*) from public.listing_edit_log where property_item_id = p_property_item_id
      and status in ('monday_ok', 'applied') and at > now() - interval '1 hour') >= 20 then
    return 'property_limit';
  end if;
  if (select count(*) from public.listing_edit_log where status in ('monday_ok', 'applied') and at > now() - interval '24 hours') >= 500 then
    return 'daily_cap';
  end if;
  insert into public.listing_edit_log (property_item_id, ip, editor, fields, changes)
  values (p_property_item_id, v_ip, left(p_editor, 80), p_fields, p_changes)
  returning id into v_id;
  return 'ok:' || v_id;
end;
$$;

revoke all on function public.listing_edit_guard(text, text, text, text, text[], jsonb) from public;

grant execute on function public.listing_edit_guard(text, text, text, text, text[], jsonb) to anon, authenticated, service_role;

-- 6. Records how an edit ended (and what Monday held before it, when given). Only forward moves:
--    pending → any outcome; monday_ok → applied. A finished row never changes again. Wrong secret: no-op.
create or replace function public.listing_edit_finish(p_secret text, p_log_id bigint, p_status text, p_before jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.listing_edit_key_ok(p_secret) then return; end if;
  update public.listing_edit_log
  set status = p_status, before = coalesce(p_before, before)
  where id = p_log_id
    and ((status = 'pending' and p_status in ('monday_ok', 'applied', 'conflict', 'failed', 'dry_run', 'noop'))
      or (status = 'monday_ok' and p_status = 'applied'));
end;
$$;

revoke all on function public.listing_edit_finish(text, bigint, text, jsonb) from public;

grant execute on function public.listing_edit_finish(text, bigint, text, jsonb) to anon, authenticated, service_role;

-- 7. The mirror writer. Applies ONLY the changes stored on log row p_log_id, and only when that row belongs to
--    this property, is from the last 5 minutes and is monday_ok (Monday was written); then marks it applied.
--    Touches only the 18 editable columns, each only when its key is in the logged changes (a JSON null
--    clears it). move_in_total is generated, so it follows the costs. Returns whether the property row was
--    updated; false for a wrong secret or a row that doesn't qualify.
create or replace function public.listing_edit_mirror(p_secret text, p_property_item_id text, p_log_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare p jsonb; v_found boolean;
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  select changes into p from public.listing_edit_log
  where id = p_log_id and property_item_id = p_property_item_id and status = 'monday_ok' and at > now() - interval '5 minutes'
  for update;
  if not found or not public.listing_edit_valid(p) then return false; end if;
  update public.properties set
    next_availability = case when p ? 'next_availability' then (p->>'next_availability')::date else next_availability end,
    bedrooms          = case when p ? 'bedrooms'          then (p->>'bedrooms')::numeric          else bedrooms end,
    bathrooms         = case when p ? 'bathrooms'         then (p->>'bathrooms')::numeric         else bathrooms end,
    sqft              = case when p ? 'sqft'              then (p->>'sqft')::numeric              else sqft end,
    monthly_rate      = case when p ? 'monthly_rate'      then (p->>'monthly_rate')::numeric      else monthly_rate end,
    security_deposit  = case when p ? 'security_deposit'  then (p->>'security_deposit')::numeric  else security_deposit end,
    cleaning_fee      = case when p ? 'cleaning_fee'      then (p->>'cleaning_fee')::numeric      else cleaning_fee end,
    admin_fee         = case when p ? 'admin_fee'         then (p->>'admin_fee')::numeric         else admin_fee end,
    application_fee   = case when p ? 'application_fee'   then (p->>'application_fee')::numeric   else application_fee end,
    move_in_fee       = case when p ? 'move_in_fee'       then (p->>'move_in_fee')::numeric       else move_in_fee end,
    pet_deposit       = case when p ? 'pet_deposit'       then (p->>'pet_deposit')::numeric       else pet_deposit end,
    pet_fee           = case when p ? 'pet_fee'           then (p->>'pet_fee')::numeric           else pet_fee end,
    pet_rent          = case when p ? 'pet_rent'          then (p->>'pet_rent')::numeric          else pet_rent end,
    pet_status        = case when p ? 'pet_status'        then p->>'pet_status'                   else pet_status end,
    furnished         = case when p ? 'furnished'         then p->>'furnished'                    else furnished end,
    fenced_yard       = case when p ? 'fenced_yard'       then p->>'fenced_yard'                  else fenced_yard end,
    property_link     = case when p ? 'property_link'     then p->>'property_link'                else property_link end,
    notes             = case when p ? 'notes'             then p->>'notes'                        else notes end,
    updated_at        = now()
  where monday_item_id = p_property_item_id;
  v_found := found;
  update public.listing_edit_log set status = 'applied' where id = p_log_id;
  return v_found;
end;
$$;

revoke all on function public.listing_edit_mirror(text, text, bigint) from public;

grant execute on function public.listing_edit_mirror(text, text, bigint) to anon, authenticated, service_role;
