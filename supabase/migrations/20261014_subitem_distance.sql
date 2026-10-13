-- Fill "Distance to Loss (mi)" (numeric_mm7np0z7) on every claim option, including
-- the ones added by hand in Monday, which is most of them. The map's "+" button
-- already writes it at creation; this covers everything else, and options whose
-- property did not have coordinates yet when they were added.
--
-- Flow: monday webhook (claim board: create_subitem, change_subitem_column_value)
--   -> subitem-distance edge function queues the sub-item here (no Monday call)
--   -> subitem_distance_sweep() every 30 s calls the function when a row is ready
--   -> the function re-reads the option and its claim, measures with
--      property_distance_miles and writes the column.
-- Monday's API allows 10,000 calls a day on this account, so nothing here polls
-- Monday: an option waiting for its property to be located is re-checked in SQL.

create table if not exists public.subitem_distance (
  subitem_id     text primary key,
  claim_id       text,
  property_id    text,
  mode           text not null default 'fill' check (mode in ('fill', 'recompute')),
  state          text not null default 'queued' check (state in ('queued', 'waiting', 'done')),
  outcome        text,
  distance_miles double precision,
  detail         text,
  attempts       integer not null default 0,
  queued_at      timestamptz not null default now(),
  next_at        timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.subitem_distance enable row level security; -- service role only
comment on table public.subitem_distance is
  'Claim options (sub-items of 9030696652) waiting for, or given, a Distance to Loss. mode fill = only into a blank column; recompute = the option''s property changed.';
create index if not exists subitem_distance_pending on public.subitem_distance (next_at) where state <> 'done';

-- New option -> fill. Property changed -> recompute (the old figure belonged to the
-- old property). A pending recompute is never downgraded by a duplicate create event.
create or replace function public.subitem_distance_enqueue(p_subitem text, p_claim text, p_mode text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.subitem_distance as s (subitem_id, claim_id, mode)
  values (p_subitem, p_claim, case when p_mode = 'recompute' then 'recompute' else 'fill' end)
  on conflict (subitem_id) do update set
    claim_id   = coalesce(excluded.claim_id, s.claim_id),
    mode       = case when excluded.mode = 'recompute' or (s.state <> 'done' and s.mode = 'recompute')
                      then 'recompute' else 'fill' end,
    state      = 'queued',
    outcome    = null,
    queued_at  = now(),
    next_at    = now(),
    updated_at = now();
$$;
revoke all on function public.subitem_distance_enqueue(text, text, text) from public, anon, authenticated;

-- Ready now. An option waiting on its property's coordinates is ready the moment
-- the property has them, whatever its retry time says.
create or replace view public.subitem_distance_due as
select s.*
from public.subitem_distance s
where s.state <> 'done'
  and (
    (s.outcome = 'no_property_location'
       and exists (select 1 from public.properties p where p.monday_item_id = s.property_id and p.geom is not null))
    or (s.outcome is distinct from 'no_property_location' and s.next_at <= now())
  )
order by s.next_at;
revoke all on public.subitem_distance_due from anon, authenticated;

-- One request in flight at a time.
create table if not exists public.subitem_distance_log (
  id          bigserial primary key,
  request_id  bigint,
  started_at  timestamptz not null default now(),
  status_code integer,
  body        jsonb
);
alter table public.subitem_distance_log enable row level security;

create or replace function public.subitem_distance_sweep()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  last   public.subitem_distance_log%rowtype;
  resp   record;
  secret text;
begin
  if not pg_try_advisory_xact_lock(hashtext('subitem-distance')) then return; end if;

  -- Settle the previous request, or wait for it (up to 3 minutes).
  select * into last from public.subitem_distance_log order by id desc limit 1;
  if last.id is not null and last.status_code is null then
    select r.status_code, r.content, r.error_msg into resp from net._http_response r where r.id = last.request_id;
    if resp.status_code is null and resp.error_msg is null and last.started_at > now() - interval '3 minutes' then
      return;
    end if;
    update public.subitem_distance_log
       set status_code = coalesce(resp.status_code, 0),
           body = case when resp.content is not null and left(resp.content, 1) = '{' then resp.content::jsonb
                       else jsonb_build_object('error', coalesce(resp.error_msg, 'no response')) end
     where id = last.id;
  end if;

  -- A wait that outlived its week stops here, without a Monday call.
  update public.subitem_distance
     set state = 'done', detail = 'gave up after 7 days', updated_at = now()
   where state <> 'done' and queued_at < now() - interval '7 days';

  if not exists (select 1 from public.subitem_distance_due) then return; end if;

  select value into secret from public.sync_config where key = 'SYNC_SECRET';
  if secret is null then raise exception 'SYNC_SECRET not set in sync_config'; end if;
  insert into public.subitem_distance_log (request_id)
  select net.http_post(
    url := 'https://nmandvqfuwvqxeabptjd.supabase.co/functions/v1/subitem-distance',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', secret),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.subitem_distance_sweep() from public, anon, authenticated;

-- The webhook URL carries this key; anything posting without it is refused.
insert into public.sync_config (key, value)
values ('SUBITEM_HOOK_KEY', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

select cron.schedule('subitem-distance', '30 seconds', 'select public.subitem_distance_sweep()')
where not exists (select 1 from cron.job where jobname = 'subitem-distance');

-- Webhooks (registered once with the API, not by this migration):
--   create_webhook(board_id: 9030696652, event: create_subitem, url: .../subitem-distance?key=<SUBITEM_HOOK_KEY>)
--   create_webhook(board_id: 9030696652, event: change_subitem_column_value, url: same)
