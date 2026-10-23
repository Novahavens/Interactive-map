-- Hardening after review: durable abuse guard for "Report bad link", tighter map RPCs, claim sync bookkeeping.
-- Applied live as single small statements (the connector cancels at ~60 s); this file is the source of truth.

-- 1. flag_link_log: one row per accepted report. The guard below is the only writer.
create table if not exists public.flag_link_log (
  id                   bigserial primary key,
  at                   timestamptz not null default now(),
  property_item_id     text not null,
  ip                   text,
  reported_by          text,
  note                 text,
  previous_link_status text
);
create index if not exists flag_link_log_property_at_idx on public.flag_link_log (property_item_id, at);
create index if not exists flag_link_log_at_idx on public.flag_link_log (at);
alter table public.flag_link_log enable row level security;
revoke all on table public.flag_link_log from anon, authenticated;
revoke all on sequence public.flag_link_log_id_seq from anon, authenticated;

-- 2. The guard. Granted to anon because the app only holds the publishable key; it enforces every limit
--    itself and moves a row to BAD LINK at most once per 24 h. The properties row lock serialises
--    concurrent reports for one property. The mirror is optimistic: the Monday webhook confirms it.
create or replace function public.flag_link_guard(p_property_item_id text, p_ip text, p_reported_by text, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_link text; v_status text;
begin
  select property_link, link_status into v_link, v_status
  from public.properties where monday_item_id = p_property_item_id for update;
  if not found then return 'not_found'; end if;
  if v_status = 'BAD LINK' then return 'already_flagged'; end if;
  if v_link is null then return 'no_link'; end if;
  if exists (select 1 from public.flag_link_log where property_item_id = p_property_item_id and at > now() - interval '24 hours') then
    return 'duplicate';
  end if;
  if p_ip is not null and (select count(*) from public.flag_link_log where ip = p_ip and at > now() - interval '10 minutes') >= 10 then
    return 'ip_limit';
  end if;
  if (select count(*) from public.flag_link_log where at > now() - interval '24 hours') >= 300 then
    return 'daily_cap';
  end if;
  insert into public.flag_link_log (property_item_id, ip, reported_by, note, previous_link_status)
  values (p_property_item_id, p_ip, left(p_reported_by, 80), left(p_note, 300), v_status);
  update public.properties set link_status = 'BAD LINK', updated_at = now() where monday_item_id = p_property_item_id;
  return 'ok';
end;
$$;
revoke all on function public.flag_link_guard(text, text, text, text) from public;
grant execute on function public.flag_link_guard(text, text, text, text) to anon, authenticated, service_role;

-- 3. Undo for a report whose Monday write failed. Only the newest log row, and only within 5 minutes,
--    so the anon grant cannot be used to clear an older flag.
create or replace function public.flag_link_undo(p_property_item_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r public.flag_link_log;
begin
  select * into r from public.flag_link_log
  where property_item_id = p_property_item_id and at > now() - interval '5 minutes'
  order by id desc limit 1;
  if not found then return; end if;
  update public.properties set link_status = r.previous_link_status, updated_at = now()
  where monday_item_id = p_property_item_id and link_status = 'BAD LINK';
  delete from public.flag_link_log where id = r.id;
end;
$$;
revoke all on function public.flag_link_undo(text) from public;
grant execute on function public.flag_link_undo(text) to anon, authenticated, service_role;

-- 4. Claim sync bookkeeping: started_at is written at the start of a run (throttle sees in-flight runs).
alter table public.claim_options_log add column if not exists started_at timestamptz;
alter table public.claim_options_log add column if not exists finished_at timestamptz;
create index if not exists claim_options_log_at_idx on public.claim_options_log (at);
revoke all on table public.claim_options, public.claim_options_log from anon, authenticated;
revoke all on sequence public.claim_options_log_id_seq from anon, authenticated;

-- 5. One aggregate for "options on this property", used by v4 and property_claim_options.
--    Plain SQL so v4 inlines it; not callable by API roles (the definer functions call it as owner).
create or replace function public.claim_options_json(p_property_item_id text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'subitemId', o.subitem_id, 'claimId', o.claim_item_id, 'claimName', o.claim_name, 'status', o.status
           ) order by o.claim_name, o.subitem_id)
    from public.claim_options o
    where o.property_item_id = p_property_item_id
  ), '[]'::jsonb);
$$;
revoke all on function public.claim_options_json(text) from public, anon, authenticated;

create or replace function public.property_claim_options(p_monday_item_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$ select public.claim_options_json(p_monday_item_id); $$;

create or replace function public.miles_to_meters(p_miles double precision)
returns double precision
language sql
immutable
parallel safe
as $$ select p_miles * 1609.344; $$;

-- 6. v4: radius clamped to 1..30 miles, map status computed once, shared aggregate and unit helper.
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
    (s.status <> 'red')                                        as addable,
    p.bedrooms, p.bathrooms, p.monthly_rate, p.pet_status,
    (p.photo_folder_url is not null)                           as has_photos,
    p.next_availability                                        as available_from,
    round((extensions.st_distance(
      p.geom,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / public.miles_to_meters(1))::numeric, 2)::double precision as distance_miles,
    (p.location_precision = 'approximate')                     as approximate,
    s.status                                                   as map_status,
    p.availability, p.availability_checked, p.last_contact, p.link_status,
    public.claim_options_json(p.monday_item_id)                as other_claims
  from public.properties p
  cross join lateral (
    select public.map_status_of(public.map_status_reason(p.group_title, p.landlord_approval, p.rental_history,
                                    p.owner_email, p.owner_phone, p.landlord_phone, p.landlord_contact)) as status
  ) s
  where p.geom is not null
    and p.geocode_status = 'ok'
    and extensions.st_dwithin(
          p.geom,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          public.miles_to_meters(least(greatest(p_miles, 1), 30)))
  order by distance_miles asc;
$$;

-- 7. property_detail as it is live (SETOF properties, so it carries availability, availability_checked
--    and link_status). Committed here so the repo holds it.
CREATE OR REPLACE FUNCTION public.property_detail(p_monday_item_id text)
 RETURNS SETOF properties
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select * from public.properties where monday_item_id = p_monday_item_id; $function$;
