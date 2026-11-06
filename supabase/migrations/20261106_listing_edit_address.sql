-- The Address field of the listing edit form (6 Nov 2026). An address picked from Google's suggestions is
-- written to Monday's location column (lat, lng, address) and the board's City / State / Zip text columns,
-- then mirrored here so the pin moves at once. The rules match lib/listing-edit.ts: the value is an object
-- {address, lat, lng, city?, state?, zipcode?}; it is never null (an address can't be cleared from the map);
-- latitude strictly inside ±90 and longitude within ±180 (Monday's own limits).
--
-- geom is generated from lat/lng, so the mirror sets only those. The properties_set_precision trigger reads
-- location_precision for the new coordinates: 'exact' (no geocoder attempt matches a hand-picked place).
-- Every statement stands on its own and the file can be re-run.

-- 1. Value rules: the 18 keys of 20261027_listing_edit.sql plus address.
create or replace function public.listing_edit_valid(p_changes jsonb)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
declare k text; v jsonb; t text; n numeric; d date; part text;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then return false; end if;
  for k, v in select key, value from jsonb_each(p_changes) loop
    if k not in ('address', 'next_availability', 'bedrooms', 'bathrooms', 'sqft', 'monthly_rate', 'security_deposit', 'cleaning_fee',
                 'admin_fee', 'application_fee', 'move_in_fee', 'pet_deposit', 'pet_fee', 'pet_rent', 'pet_status',
                 'furnished', 'fenced_yard', 'property_link', 'notes') then
      return false;
    end if;
    if k = 'address' then
      if jsonb_typeof(v) <> 'object' then return false; end if;
      t := v ->> 'address';
      if t is null or length(btrim(t)) = 0 or length(t) > 300 then return false; end if;
      if jsonb_typeof(v -> 'lat') <> 'number' or jsonb_typeof(v -> 'lng') <> 'number' then return false; end if;
      n := (v ->> 'lat')::numeric;
      if n <= -90 or n >= 90 then return false; end if;
      n := (v ->> 'lng')::numeric;
      if n < -180 or n > 180 then return false; end if;
      foreach part in array array['city', 'state', 'zipcode'] loop
        if v ? part and jsonb_typeof(v -> part) not in ('string', 'null') then return false; end if;
        if jsonb_typeof(v -> part) = 'string' and length(v ->> part) > 100 then return false; end if;
      end loop;
      continue;
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

-- 2. The mirror writer, now also moving the pin. Same contract as before: applies ONLY the changes stored on
--    log row p_log_id, narrowed to its confirmed keys, for this property, from the last 5 minutes, monday_ok.
--    An address sets address, lat, lng (geom follows), the parts Google gave, and geocode_status 'ok'.
create or replace function public.listing_edit_mirror(p_secret text, p_property_item_id text, p_log_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare p jsonb; a jsonb; v_keys text[]; v_found boolean;
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  select changes, confirmed into p, v_keys from public.listing_edit_log
  where id = p_log_id and property_item_id = p_property_item_id and status = 'monday_ok' and at > now() - interval '5 minutes'
  for update;
  if not found then return false; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into p
  from jsonb_each(p) where key = any(coalesce(v_keys, '{}'::text[]));
  if p = '{}'::jsonb or not public.listing_edit_valid(p) then return false; end if;
  a := p -> 'address';
  update public.properties set
    address           = case when a is not null then a ->> 'address' else address end,
    lat               = case when a is not null then (a ->> 'lat')::double precision else lat end,
    lng               = case when a is not null then (a ->> 'lng')::double precision else lng end,
    city              = case when a is not null and coalesce(a ->> 'city', '') <> ''    then a ->> 'city'    else city end,
    state             = case when a is not null and coalesce(a ->> 'state', '') <> ''   then a ->> 'state'   else state end,
    zipcode           = case when a is not null and coalesce(a ->> 'zipcode', '') <> '' then a ->> 'zipcode' else zipcode end,
    geocode_status    = case when a is not null then 'ok' else geocode_status end,
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
