-- Live status on the map: availability, link quality, last contact, and "already on another claim".
--
--   properties.availability / availability_checked / link_status   mirrored from the property board
--   claim_options                                                  active options on claims, refreshed
--                                                                  every 10 minutes by claim-options-sync
--   properties_within_radius_v4, property_claim_options            what the app reads
--
-- Additive: v3 stays in place as the rollback path. Applied live as single small statements.

-- 1. Property board columns (Availability, Availability Checked, ZZ.Status link quality).
alter table public.properties
  add column if not exists availability text,
  add column if not exists availability_checked date,
  add column if not exists link_status text;

-- 2. Active options: one row per claim sub-item that points at a property.
create table if not exists public.claim_options (
  subitem_id       text primary key,
  property_item_id text not null,
  claim_item_id    text not null,
  claim_name       text not null,
  status           text,
  claim_group      text,
  updated_at       timestamptz not null default now()
);
create index if not exists claim_options_property_idx on public.claim_options (property_item_id);
alter table public.claim_options enable row level security;  -- service role / definer functions only
comment on table public.claim_options is
  'Active options (claim sub-items) per property. Replaced wholesale every 10 minutes by the claim-options-sync edge function.';

create table if not exists public.claim_options_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  claims  integer,
  options integer,
  error   text
);
alter table public.claim_options_log enable row level security;

-- 3. What the app reads. SECURITY DEFINER like the other map functions.
create or replace function public.property_claim_options(p_monday_item_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'subitemId', o.subitem_id, 'claimId', o.claim_item_id, 'claimName', o.claim_name, 'status', o.status
         ) order by o.claim_name, o.subitem_id), '[]'::jsonb)
  from public.claim_options o
  where o.property_item_id = p_monday_item_id;
$$;

create or replace function public.properties_within_radius_v4(p_lat double precision, p_lng double precision, p_miles double precision)
returns table(monday_item_id text, name text, lat double precision, lng double precision, group_title text,
              addable boolean, bedrooms numeric, bathrooms numeric, monthly_rate numeric, pet_status text,
              has_photos boolean, available_from date, distance_miles double precision, approximate boolean,
              map_status text, availability text, availability_checked date, last_contact date,
              link_status text, other_claims jsonb)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select
    p.monday_item_id, p.name, p.lat, p.lng, p.group_title,
    (public.map_status_of(s.reason) <> 'red')                 as addable,
    p.bedrooms, p.bathrooms, p.monthly_rate, p.pet_status,
    (p.photo_folder_url is not null)                           as has_photos,
    p.next_availability                                        as available_from,
    round((extensions.st_distance(
      p.geom,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / 1609.344)::numeric, 2)::double precision               as distance_miles,
    (p.location_precision = 'approximate')                     as approximate,
    public.map_status_of(s.reason)                             as map_status,
    p.availability, p.availability_checked, p.last_contact, p.link_status,
    coalesce(oc.options, '[]'::jsonb)                          as other_claims
  from public.properties p
  cross join lateral (
    select public.map_status_reason(p.group_title, p.landlord_approval, p.rental_history,
                                    p.owner_email, p.owner_phone, p.landlord_phone, p.landlord_contact) as reason
  ) s
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'subitemId', o.subitem_id, 'claimId', o.claim_item_id, 'claimName', o.claim_name, 'status', o.status
           ) order by o.claim_name, o.subitem_id) as options
    from public.claim_options o
    where o.property_item_id = p.monday_item_id
  ) oc on true
  where p.geom is not null
    and p.geocode_status = 'ok'
    and extensions.st_dwithin(
          p.geom,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          p_miles * 1609.344)
  order by distance_miles asc;
$$;

grant execute on function public.properties_within_radius_v4(double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.property_claim_options(text) to anon, authenticated, service_role;

-- 4. Refresh the options every 10 minutes (and on demand from a claim-board webhook).
create or replace function public.claim_options_kick()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_secret text; v_id bigint;
begin
  select value into v_secret from public.sync_config where key = 'SYNC_SECRET';
  if v_secret is null then raise exception 'SYNC_SECRET not set in sync_config'; end if;
  select net.http_post(
    url := 'https://nmandvqfuwvqxeabptjd.supabase.co/functions/v1/claim-options-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;
revoke all on function public.claim_options_kick() from public, anon, authenticated;

select cron.schedule('claim-options-sync', '*/10 * * * *', 'select public.claim_options_kick()')
where not exists (select 1 from cron.job where jobname = 'claim-options-sync');

-- 5. Cleanup, NOT applied: the app and cron no longer call these, but `drop function` on
--    properties_within_radius, radius_coverage and properties_by_ids (v1) timed out in the
--    connector. Run them later from the SQL editor, one statement at a time:
--      drop function public.properties_within_radius(double precision, double precision, double precision);
--      drop function public.radius_coverage(double precision, double precision, double precision);
--      drop function public.properties_by_ids(text[]);
