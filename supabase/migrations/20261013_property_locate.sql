-- Locate every property that can be located, and keep new ones flowing onto
-- the map within about a minute of landing in Monday.
--
-- Replaces the hourly Census-only sweep (20261007) with the property-locate
-- edge function, which tries, per row:
--   furnishedfinder  the listing's public page (via Firecrawl) -> its own
--                    coordinates, city and state. Approximate: the site never
--                    publishes the street.
--   address          Census geocoder, then Geocodio for what Census can't place
--                    (street-only names, missing numbers, listing-URL slugs).
-- Monday stays the system of record: the function writes the location column
-- and monday-webhook mirrors it back here, exactly as the backfill did.

-- 1. Attempts remember how a row was placed and what it looked like then.
alter table public.geocode_attempts
  add column if not exists source text,
  add column if not exists precision text,
  add column if not exists input_hash text;
update public.geocode_attempts set source = 'census' where source is null;
update public.geocode_attempts set precision = 'exact' where outcome = 'written' and precision is null;
comment on column public.geocode_attempts.precision is
  'exact = a street address was matched; approximate = listing-site coordinates or a street centroid.';
comment on column public.geocode_attempts.input_hash is
  'md5 of the item''s name/city/state/zip/link when attempted. A failed row is retried only once this changes, i.e. once someone edits it on the board.';

-- 2. What the map shows: is this pin an address or an area?
alter table public.properties add column if not exists location_precision text;

create or replace function public.location_precision_for(p_item text, p_lat double precision, p_lng double precision)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_lat is null or p_lng is null then null
    else coalesce((
      select a.precision from public.geocode_attempts a
      where a.monday_item_id = p_item and a.outcome = 'written'
        and abs(a.lat - p_lat) < 0.00001 and abs(a.lng - p_lng) < 0.00001
    ), 'exact')
  end;
$$;

-- Coordinates typed into Monday by a person are exact; coordinates we wrote
-- stay approximate only while they are still the ones we wrote.
create or replace function public.properties_set_precision()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.location_precision := public.location_precision_for(new.monday_item_id, new.lat, new.lng);
  return new;
end;
$$;

create or replace trigger properties_set_precision
  before insert or update of lat, lng on public.properties
  for each row execute function public.properties_set_precision();

-- The webhook can mirror our Monday write before the attempt row is recorded.
create or replace function public.attempts_sync_precision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.outcome = 'written' then
    update public.properties p
       set location_precision = public.location_precision_for(p.monday_item_id, p.lat, p.lng)
     where p.monday_item_id = new.monday_item_id
       and p.location_precision is distinct from public.location_precision_for(p.monday_item_id, p.lat, p.lng);
  end if;
  return null;
end;
$$;

create or replace trigger attempts_sync_precision
  after insert or update on public.geocode_attempts
  for each row execute function public.attempts_sync_precision();

-- Every pin before this migration came from a street address (Monday or Census).
update public.properties set location_precision = 'exact'
 where lat is not null and lng is not null and location_precision is null;

-- 3. The queue. kind is decided here so the function can skip a whole kind
-- (e.g. no Firecrawl key yet) without the skipped rows crowding out the rest.
create or replace view public.locate_candidates
with (security_invoker = true) as
  select p.monday_item_id, p.name, p.city, p.state, p.zipcode, p.property_link,
         case
           when p.property_link ~* 'furnishedfinder\.com/property/\d+_\d+'
             or p.name ~* '(^|[^0-9])\d{5,7}_\d{1,2}([^0-9]|$)' then 'furnishedfinder'
           else 'address'
         end as kind,
         h.input_hash
  from public.properties p
  cross join lateral (
    select md5(concat_ws('|', p.name, p.city, p.state, p.zipcode, p.property_link)) as input_hash
  ) h
  left join public.geocode_attempts a on a.monday_item_id = p.monday_item_id
  where p.geocode_status <> 'ok'
    and (a.monday_item_id is null
         or (a.outcome in ('error', 'deferred') and a.attempted_at < now() - interval '1 hour')
         or (a.outcome not in ('error', 'deferred') and a.input_hash is distinct from h.input_hash))
  order by p.synced_at desc;
comment on view public.locate_candidates is
  'Unmapped properties waiting for property-locate, newest first so a fresh Monday item is never stuck behind a backfill.';

-- What only a person can fix: the board has nothing a geocoder can use, the
-- match was unsafe, or the listing is gone.
create or replace view public.locate_needs_review
with (security_invoker = true) as
  select p.monday_item_id, p.name, p.city, p.state, p.zipcode, p.property_link,
         a.outcome, a.source, a.detail, a.attempted_at
  from public.properties p
  join public.geocode_attempts a on a.monday_item_id = p.monday_item_id
  where p.geocode_status <> 'ok'
    and a.outcome in ('no_match', 'rejected', 'unparsable', 'gone');

-- 4. One step = one property-locate invocation, logged in geocode_log.
create or replace function public.geocode_step(p_batch integer default 120, p_dry boolean default false)
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
  v_url := 'https://nmandvqfuwvqxeabptjd.supabase.co/functions/v1/property-locate?batch=' || p_batch
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

-- Fire a step when there is work and none is running. The advisory lock keeps
-- the row trigger and the cron tick from starting two steps at once.
create or replace function public.locate_sweep()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('property-locate')) then return; end if;
  if not public.geocode_settle() then return; end if;
  if exists (select 1 from public.locate_candidates) then
    perform public.geocode_step(120, false);
  end if;
end;
$$;

-- A new or re-addressed unmapped item starts a step straight away. Never let
-- a failure here roll back the webhook's write.
create or replace function public.properties_kick_locate()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  begin
    perform public.locate_sweep();
  exception when others then
    raise warning 'locate kick failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger properties_kick_locate_ins
  after insert on public.properties
  for each row when (new.geocode_status <> 'ok')
  execute function public.properties_kick_locate();

create or replace trigger properties_kick_locate_upd
  after update on public.properties
  for each row when (
    new.geocode_status <> 'ok'
    and (old.name, old.city, old.state, old.zipcode, old.property_link)
        is distinct from (new.name, new.city, new.state, new.zipcode, new.property_link)
  )
  execute function public.properties_kick_locate();

revoke all on function public.locate_sweep() from public, anon, authenticated;
revoke all on function public.properties_kick_locate() from public, anon, authenticated;
revoke all on function public.attempts_sync_precision() from public, anon, authenticated;

-- 5. Pins tell the map whether they are an address or an area.
-- A new name rather than a changed return type: the deployed app keeps calling
-- v1 until the version that reads `approximate` ships. Drop v1 after that.
create or replace function public.properties_within_radius_v2(p_lat double precision, p_lng double precision, p_miles double precision)
returns table(monday_item_id text, name text, lat double precision, lng double precision, group_title text, addable boolean,
              bedrooms numeric, bathrooms numeric, monthly_rate numeric, pet_status text, has_photos boolean,
              available_from date, distance_miles double precision, approximate boolean)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select
    p.monday_item_id,
    p.name,
    p.lat,
    p.lng,
    p.group_title,
    (p.group_title is distinct from 'DO NOT USE')            as addable,
    p.bedrooms,
    p.bathrooms,
    p.monthly_rate,
    p.pet_status,
    (p.photo_folder_url is not null)                          as has_photos,
    p.next_availability                                       as available_from,
    round((extensions.st_distance(
      p.geom,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / 1609.344)::numeric, 2)::double precision              as distance_miles,
    (p.location_precision = 'approximate')                    as approximate
  from public.properties p
  where p.geom is not null
    and p.geocode_status = 'ok'
    and extensions.st_dwithin(
          p.geom,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          p_miles * 1609.344
        )
  order by distance_miles asc;
$function$;
grant execute on function public.properties_within_radius_v2(double precision, double precision, double precision) to anon, authenticated, service_role;

-- 6. Every 30 seconds as a safety net for anything the row trigger missed
-- (a step already running, a step that failed, the hourly retry of errors).
select cron.unschedule('property-geocode-sweep') where exists (select 1 from cron.job where jobname = 'property-geocode-sweep');
select cron.unschedule('property-geocode') where exists (select 1 from cron.job where jobname = 'property-geocode');
select cron.schedule('property-locate', '30 seconds', $$select public.locate_sweep()$$)
where not exists (select 1 from cron.job where jobname = 'property-locate');
