-- Geocode backfill support for public.properties rows that have no location
-- in Monday. Driven the same way as the full resync: a pg_cron tick calls the
-- geocode-backfill edge function through pg_net with the shared sync secret.

create table if not exists public.geocode_attempts (
  monday_item_id text primary key references public.properties(monday_item_id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null,
  input text,
  matched_address text,
  lat double precision,
  lng double precision,
  detail text
);
comment on table public.geocode_attempts is
  'One row per property the geocode backfill has decided on. written = location pushed to Monday; no_match / rejected / unparsable need a human to fix the address on the board.';
alter table public.geocode_attempts enable row level security;

create or replace view public.geocode_candidates
with (security_invoker = true) as
  select p.monday_item_id, p.name, p.city, p.state, p.zipcode
  from public.properties p
  left join public.geocode_attempts a on a.monday_item_id = p.monday_item_id
  where p.geocode_status <> 'ok'
    and a.monday_item_id is null
    and p.name ~ '^\s*\d'
    and (nullif(trim(p.zipcode), '') is not null
         or (nullif(trim(p.city), '') is not null and nullif(trim(p.state), '') is not null));
comment on view public.geocode_candidates is
  'Unmapped properties whose item name starts with a street number and that carry a zip or a city+state, minus anything already attempted.';

create table if not exists public.geocode_log (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  request_id bigint,
  dry boolean not null default false,
  status_code integer,
  candidates integer,
  written integer,
  no_match integer,
  rejected integer,
  unparsable integer,
  monday_errors integer,
  done boolean,
  error text
);
alter table public.geocode_log enable row level security;

create or replace function public.geocode_step(p_batch integer default 200, p_dry boolean default false)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_secret text;
  v_url text;
  v_id bigint;
begin
  select value into v_secret from public.sync_config where key = 'SYNC_SECRET';
  if v_secret is null then raise exception 'SYNC_SECRET not set in sync_config'; end if;
  v_url := 'https://nmandvqfuwvqxeabptjd.supabase.co/functions/v1/geocode-backfill?batch=' || p_batch
           || case when p_dry then '&dry=1' else '' end;
  select net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    timeout_milliseconds := 150000
  ) into v_id;
  insert into public.geocode_log (request_id, dry) values (v_id, p_dry);
  return v_id;
end;
$$;

-- Each minute: settle the previous step from its pg_net response, stop when the
-- queue is empty or a step errored, otherwise fire the next step.
create or replace function public.geocode_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  last public.geocode_log%rowtype;
  resp record;
  body jsonb;
begin
  select * into last from public.geocode_log order by id desc limit 1;

  if last.id is not null and last.status_code is null then
    select r.status_code, r.content, r.error_msg into resp
      from net._http_response r where r.id = last.request_id;
    if resp.status_code is null and resp.error_msg is null then
      return; -- still running
    end if;
    begin body := resp.content::jsonb; exception when others then body := null; end;
    update public.geocode_log set
      status_code = coalesce(resp.status_code, 0),
      candidates = (body->>'candidates')::int,
      written = (body->>'written')::int,
      no_match = (body->>'no_match')::int,
      rejected = (body->>'rejected')::int,
      unparsable = (body->>'unparsable')::int,
      monday_errors = (body->>'monday_errors')::int,
      done = coalesce((body->>'done')::boolean, false),
      error = coalesce(resp.error_msg, body->>'error', case when resp.status_code <> 200 then resp.content end)
    where id = last.id;
    select * into last from public.geocode_log where id = last.id;
  end if;

  if last.id is not null and (last.done or last.error is not null) then
    perform cron.unschedule('property-geocode') where exists (select 1 from cron.job where jobname = 'property-geocode');
    return;
  end if;

  perform public.geocode_step(200, false);
end;
$$;

revoke all on function public.geocode_step(integer, boolean) from public, anon, authenticated;
revoke all on function public.geocode_tick() from public, anon, authenticated;
