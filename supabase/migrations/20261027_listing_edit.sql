-- Listing edits from the map: an abuse guard and log, and a narrow mirror writer. Monday stays the source of
-- truth; the route writes Monday first, then calls listing_edit_mirror so the map shows the edit at once (the
-- Monday webhook re-reads the item seconds later and confirms it).
-- Every statement stands on its own so it can be applied one at a time (the connector cancels at ~60 s).

-- 1. listing_edit_log: one row per edit that passed the guard. The guard is the only writer; finish sets the outcome.
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
                   check (status in ('pending', 'applied', 'conflict', 'failed', 'dry_run', 'noop'))
);

create index if not exists listing_edit_log_property_at_idx on public.listing_edit_log (property_item_id, at);

create index if not exists listing_edit_log_ip_at_idx on public.listing_edit_log (ip, at);

create index if not exists listing_edit_log_at_idx on public.listing_edit_log (at);

alter table public.listing_edit_log enable row level security;

revoke all on table public.listing_edit_log from anon, authenticated;

revoke all on sequence public.listing_edit_log_id_seq from anon, authenticated;

-- 2. The guard. Granted to anon because the app only holds the publishable key; it enforces every limit itself:
--    30 edits per IP per 10 min, 20 per property per hour, 500 per day overall. Returns 'ok:<log id>'.
create or replace function public.listing_edit_guard(p_property_item_id text, p_ip text, p_editor text, p_fields text[], p_changes jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.properties where monday_item_id = p_property_item_id) then
    return 'not_found';
  end if;
  if p_ip is not null and (select count(*) from public.listing_edit_log where ip = p_ip and at > now() - interval '10 minutes') >= 30 then
    return 'ip_limit';
  end if;
  if (select count(*) from public.listing_edit_log where property_item_id = p_property_item_id and at > now() - interval '1 hour') >= 20 then
    return 'property_limit';
  end if;
  if (select count(*) from public.listing_edit_log where at > now() - interval '24 hours') >= 500 then
    return 'daily_cap';
  end if;
  insert into public.listing_edit_log (property_item_id, ip, editor, fields, changes)
  values (p_property_item_id, p_ip, left(p_editor, 80), coalesce(p_fields, '{}'), coalesce(p_changes, '{}'::jsonb))
  returning id into v_id;
  return 'ok:' || v_id;
end;
$$;

revoke all on function public.listing_edit_guard(text, text, text, text[], jsonb) from public;

grant execute on function public.listing_edit_guard(text, text, text, text[], jsonb) to anon, authenticated, service_role;

-- 3. Records how an edit ended, and what Monday held before it when it was applied.
create or replace function public.listing_edit_finish(p_log_id bigint, p_status text, p_before jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.listing_edit_log
  set status = p_status, before = coalesce(p_before, before)
  where id = p_log_id;
end;
$$;

revoke all on function public.listing_edit_finish(bigint, text, jsonb) from public;

grant execute on function public.listing_edit_finish(bigint, text, jsonb) to anon, authenticated, service_role;

-- 4. The mirror writer. Touches only the 18 editable listing columns, each only when its key is in p_patch
--    (a JSON null clears it); any other key is ignored. move_in_total is generated, so it follows the costs.
--    Like flag_link_undo, the anon grant is narrowed: it only applies the fields of this property's newest
--    edit that passed the guard in the last 5 minutes and has not finished, so it cannot be called on its own
--    to rewrite the map without going through the guard's limits.
create or replace function public.listing_edit_mirror(p_property_item_id text, p_patch jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fields text[];
begin
  select fields into v_fields from public.listing_edit_log
  where property_item_id = p_property_item_id and status = 'pending' and at > now() - interval '5 minutes'
  order by id desc limit 1;
  if not found then return false; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into p_patch
  from jsonb_each(coalesce(p_patch, '{}'::jsonb)) where key = any(v_fields);
  update public.properties set
    next_availability = case when p_patch ? 'next_availability' then (p_patch->>'next_availability')::date else next_availability end,
    bedrooms          = case when p_patch ? 'bedrooms'          then (p_patch->>'bedrooms')::numeric          else bedrooms end,
    bathrooms         = case when p_patch ? 'bathrooms'         then (p_patch->>'bathrooms')::numeric         else bathrooms end,
    sqft              = case when p_patch ? 'sqft'              then (p_patch->>'sqft')::numeric              else sqft end,
    monthly_rate      = case when p_patch ? 'monthly_rate'      then (p_patch->>'monthly_rate')::numeric      else monthly_rate end,
    security_deposit  = case when p_patch ? 'security_deposit'  then (p_patch->>'security_deposit')::numeric  else security_deposit end,
    cleaning_fee      = case when p_patch ? 'cleaning_fee'      then (p_patch->>'cleaning_fee')::numeric      else cleaning_fee end,
    admin_fee         = case when p_patch ? 'admin_fee'         then (p_patch->>'admin_fee')::numeric         else admin_fee end,
    application_fee   = case when p_patch ? 'application_fee'   then (p_patch->>'application_fee')::numeric   else application_fee end,
    move_in_fee       = case when p_patch ? 'move_in_fee'       then (p_patch->>'move_in_fee')::numeric       else move_in_fee end,
    pet_deposit       = case when p_patch ? 'pet_deposit'       then (p_patch->>'pet_deposit')::numeric       else pet_deposit end,
    pet_fee           = case when p_patch ? 'pet_fee'           then (p_patch->>'pet_fee')::numeric           else pet_fee end,
    pet_rent          = case when p_patch ? 'pet_rent'          then (p_patch->>'pet_rent')::numeric          else pet_rent end,
    pet_status        = case when p_patch ? 'pet_status'        then p_patch->>'pet_status'                   else pet_status end,
    furnished         = case when p_patch ? 'furnished'         then p_patch->>'furnished'                    else furnished end,
    fenced_yard       = case when p_patch ? 'fenced_yard'       then p_patch->>'fenced_yard'                  else fenced_yard end,
    property_link     = case when p_patch ? 'property_link'     then p_patch->>'property_link'                else property_link end,
    notes             = case when p_patch ? 'notes'             then p_patch->>'notes'                        else notes end,
    updated_at        = now()
  where monday_item_id = p_property_item_id;
  return found;
end;
$$;

revoke all on function public.listing_edit_mirror(text, jsonb) from public;

grant execute on function public.listing_edit_mirror(text, jsonb) to anon, authenticated, service_role;
