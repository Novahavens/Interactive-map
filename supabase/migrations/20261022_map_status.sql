-- Map dot colour for every property: green (used before / preferred), neutral (yellow),
-- red (do not use). One rule, one place, never blank.
--
--   red     the property's group, or its owner's approval status, is DO NOT USE
--   green   the owner is Preferred or Approved on the owner board, or the property is in the
--           preferred group, or Rental History says we have placed a family there, or the
--           owner's email / phone belongs to a claim where we placed (or are placing) a tenant
--   yellow  everything else, including any group name nobody has seen before
--
-- Red always beats green. Additive only: the v2 functions stay as the rollback path.

-- 1. Owners we have used: contact keys taken from claims in the "placed" groups
--    (Incoming Move In, Current Tenant, 45/30/10 Days To Vacate, both Moved Out groups,
--    Damage Deposit Dispute). Refreshed every 10 minutes by the used-before-sync edge function,
--    which writes this table directly with the service key.
create table if not exists public.used_before_keys (
  key        text primary key,            -- lower-case email, or the last 10 digits of a phone
  kind       text not null check (kind in ('email', 'phone')),
  claims     integer not null default 1,  -- how many placed claims carry this contact
  updated_at timestamptz not null default now()
);
alter table public.used_before_keys enable row level security;  -- service role / definer functions only
comment on table public.used_before_keys is
  'Owner contacts from claims where a tenant was placed. A property whose owner email or phone is here is green on the map.';

create table if not exists public.used_before_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  claims  integer,
  keys    integer,
  error   text
);
alter table public.used_before_log enable row level security;

-- 2. The rule. (Checking all 16,384 properties takes about 5 s; one map view touches a few hundred.)
create or replace function public.owner_phone_key(p text)
returns text
language sql
immutable
as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
              then right(regexp_replace(p, '\D', '', 'g'), 10) end;
$$;

create or replace function public.map_status_reason(
  p_group text, p_approval text, p_rental text,
  p_email text, p_phone text, p_ll_phone text, p_ll_contact text
) returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    when lower(coalesce(p_group, '')) like '%do not use%'
      or lower(trim(coalesce(p_group, ''))) = 'dnu'                       then 'dnu_group'
    when lower(coalesce(p_approval, '')) like '%do not use%'              then 'dnu_owner'
    when lower(coalesce(p_group, '')) like '%prefer%'                     then 'preferred_group'   -- also catches "PREFERED"
    when lower(trim(coalesce(p_approval, ''))) = 'preferred'              then 'owner_preferred'
    when lower(trim(coalesce(p_approval, ''))) = 'approved'               then 'owner_approved'
    when lower(trim(coalesce(p_rental, ''))) in ('currently rented', 'previously rented') then 'rented_before'
    when exists (
           -- look the property's own emails and phones up in the (indexed) key list; never the other way round
           select 1 from public.used_before_keys k
           where k.key = any (
             array(select lower(m[1]) from regexp_matches(coalesce(p_email, '') || ' ' || coalesce(p_ll_contact, ''),
                                                         '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m)
             || array[public.owner_phone_key(p_phone), public.owner_phone_key(p_ll_phone)]
           )
         )                                                                 then 'used_before'
    else 'none'
  end;
$$;

create or replace function public.map_status_of(p_reason text)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'dnu_group' then 'red'
    when 'dnu_owner' then 'red'
    when 'preferred_group' then 'green'
    when 'owner_preferred' then 'green'
    when 'owner_approved' then 'green'
    when 'rented_before' then 'green'
    when 'used_before' then 'green'
    else 'yellow'
  end;
$$;

-- 3. Every property, one row, one colour. The check "counts add up to the total" runs on this.
create or replace view public.properties_map_status as
select p.monday_item_id,
       r.reason,
       public.map_status_of(r.reason) as status
from public.properties p
cross join lateral (
  select public.map_status_reason(p.group_title, p.landlord_approval, p.rental_history,
                                  p.owner_email, p.owner_phone, p.landlord_phone, p.landlord_contact) as reason
) r;
revoke all on public.properties_map_status from anon, authenticated;

-- 4. What the app reads. SECURITY DEFINER like the other map functions.
create or replace function public.properties_within_radius_v3(p_lat double precision, p_lng double precision, p_miles double precision)
returns table(monday_item_id text, name text, lat double precision, lng double precision, group_title text,
              addable boolean, bedrooms numeric, bathrooms numeric, monthly_rate numeric, pet_status text,
              has_photos boolean, available_from date, distance_miles double precision, approximate boolean,
              map_status text)
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
    public.map_status_of(s.reason)                             as map_status
  from public.properties p
  cross join lateral (
    select public.map_status_reason(p.group_title, p.landlord_approval, p.rental_history,
                                    p.owner_email, p.owner_phone, p.landlord_phone, p.landlord_contact) as reason
  ) s
  where p.geom is not null
    and p.geocode_status = 'ok'
    and extensions.st_dwithin(
          p.geom,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          p_miles * 1609.344)
  order by distance_miles asc;
$$;

create or replace function public.properties_by_ids_v2(p_ids text[])
returns table(monday_item_id text, name text, lat double precision, lng double precision, group_title text,
              monthly_rate numeric, bedrooms numeric, bathrooms numeric, map_status text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.monday_item_id, p.name, p.lat, p.lng, p.group_title, p.monthly_rate, p.bedrooms, p.bathrooms,
         public.map_status_of(s.reason)
  from public.properties p
  cross join lateral (
    select public.map_status_reason(p.group_title, p.landlord_approval, p.rental_history,
                                    p.owner_email, p.owner_phone, p.landlord_phone, p.landlord_contact) as reason
  ) s
  where p.monday_item_id = any(p_ids) and p.lat is not null;
$$;

create or replace function public.property_map_status(p_monday_item_id text)
returns table(status text, reason text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.map_status_of(s.reason), s.reason
  from public.properties p
  cross join lateral (
    select public.map_status_reason(p.group_title, p.landlord_approval, p.rental_history,
                                    p.owner_email, p.owner_phone, p.landlord_phone, p.landlord_contact) as reason
  ) s
  where p.monday_item_id = p_monday_item_id;
$$;

-- helpers are internal: only the definer functions above and the service role call them
revoke all on function public.map_status_reason(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.map_status_of(text) from public, anon, authenticated;

-- 5. Refresh the used-before list every 10 minutes (and on demand from a claim-board webhook).
create or replace function public.used_before_kick()
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
    url := 'https://nmandvqfuwvqxeabptjd.supabase.co/functions/v1/used-before-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;
revoke all on function public.used_before_kick() from public, anon, authenticated;

-- The webhooks on the owner and claim boards carry this key in their URL.
insert into public.sync_config (key, value)
values ('MAP_HOOK_KEY', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

select cron.schedule('used-before-sync', '*/10 * * * *', 'select public.used_before_kick()')
where not exists (select 1 from cron.job where jobname = 'used-before-sync');
