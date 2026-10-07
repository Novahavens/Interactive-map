-- Keep the map's coverage from drifting back: an hourly sweep geocodes any
-- property that arrives (or is edited) without a location in Monday, using the
-- same edge function the one-off backfill used.

-- A row that failed before but was edited on the board since (synced_at moved
-- past the attempt) becomes a candidate again; the edge function's upsert then
-- overwrites the old attempt with the new outcome.
create or replace view public.geocode_candidates
with (security_invoker = true) as
  select p.monday_item_id, p.name, p.city, p.state, p.zipcode
  from public.properties p
  left join public.geocode_attempts a on a.monday_item_id = p.monday_item_id
  where p.geocode_status <> 'ok'
    and (a.monday_item_id is null
         or (a.outcome in ('no_match', 'rejected', 'unparsable')
             and p.synced_at > a.attempted_at + interval '2 minutes'))
    and p.name ~ '^\s*\d'
    and (nullif(trim(p.zipcode), '') is not null
         or (nullif(trim(p.city), '') is not null and nullif(trim(p.state), '') is not null));

-- Settle the most recent step from its pg_net response. Returns false while
-- that step is still running, so a caller knows not to fire another one.
create or replace function public.geocode_settle()
returns boolean
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
  if last.id is null or last.status_code is not null then return true; end if;

  select r.status_code, r.content, r.error_msg into resp
    from net._http_response r where r.id = last.request_id;
  if resp.status_code is null and resp.error_msg is null then return false; end if;

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
  return true;
end;
$$;

create or replace function public.geocode_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  last public.geocode_log%rowtype;
begin
  if not public.geocode_settle() then return; end if;
  select * into last from public.geocode_log order by id desc limit 1;
  if last.id is not null and (last.done or last.error is not null) then
    perform cron.unschedule('property-geocode') where exists (select 1 from cron.job where jobname = 'property-geocode');
    return;
  end if;
  perform public.geocode_step(200, false);
end;
$$;

-- Hourly: geocode whatever is waiting. Never unschedules itself.
create or replace function public.geocode_sweep()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if not public.geocode_settle() then return; end if;
  if exists (select 1 from public.geocode_candidates) then
    perform public.geocode_step(200, false);
  end if;
end;
$$;

revoke all on function public.geocode_settle() from public, anon, authenticated;
revoke all on function public.geocode_sweep() from public, anon, authenticated;

select cron.schedule('property-geocode-sweep', '17 * * * *', $$select public.geocode_sweep()$$)
where not exists (select 1 from cron.job where jobname = 'property-geocode-sweep');
