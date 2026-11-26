-- Landlord replies pasted on the map (26 Nov 2026): a Furnished Finder home's street address, read from the reply
-- staff paste into the outside panel (lib/landlord-reply.ts decides what may be written). Additive only.
--
--   landlord_replies                     one row per reply per home: the text (4,000 characters at most), the phone
--                                        digits and what the parser found. Unique on (listing_id, reply_fingerprint),
--                                        so the same reply pasted twice is recorded once. Nothing reads it but these
--                                        functions; RLS is on with no policy, so the app's key cannot read it.
--   landlord_outreach.reply_fingerprint  the fingerprint of the reply that made this outreach row (null on rows the
--                                        message flow made). The table allows one open ff_message row per home
--                                        (landlord_outreach_one_open), so the map's "Replied" row is the one open row:
--                                        a row this path made is updated to the newest reply; any other is left alone.
--   map_listing_reply_prepare            the home's state and whether this reply is already recorded (read only)
--   map_listing_address_save             one transaction: writes the street only when the home has none, records the
--                                        reply, and returns possible duplicates (another outside home, or a PROPERTY
--                                        DATABASE home with the same nearsite_address_key). Flagged, never merged.
--
-- The street is written only when external_listings.address_line is null; an address the home already has is never
-- overwritten here. host_phone is never written. address_key and geog are generated columns and follow on their own.
-- Monday is not written. The mirror trigger external_listings_mirror_address does copy a new address onto the
-- properties row when property_item_id is set (that is our database, not Monday).
--
-- Every function is SECURITY DEFINER and gated by listing_edit_key_ok(p_secret), like 20261126_map_agent.sql.
--
-- Rollback (the outside panel's paste box then answers 502; nothing else depends on these):
--   drop function if exists public.map_listing_address_save(text, uuid, text, text, text, text, jsonb, jsonb);
--   drop function if exists public.map_listing_reply_prepare(text, uuid, text);
--   drop table if exists public.landlord_replies;                       -- drops the recorded replies too
--   drop index if exists public.landlord_outreach_listing_reply_key;
--   alter table public.landlord_outreach drop column if exists reply_fingerprint;
--
-- Every statement stands on its own and the file can be re-run.

-- 1. Each reply, once per home. Text capped at 4,000 characters; the fingerprint is sha256 of the normalised text.
create table if not exists public.landlord_replies (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.external_listings (id) on delete cascade,
  reply_fingerprint text not null,
  reply_text       text not null,
  landlord_phone   text,
  reply_by_name    text,
  extracted        jsonb not null default '{}'::jsonb,
  replied_at       timestamptz not null default now(),
  constraint landlord_replies_fingerprint_check check (reply_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint landlord_replies_listing_fingerprint_key unique (listing_id, reply_fingerprint)
);

alter table public.landlord_replies enable row level security;

revoke all on table public.landlord_replies from anon, authenticated;

comment on table public.landlord_replies is
  'Landlord replies pasted on the map (one per reply per home). Written only by map_listing_address_save.';

-- 2. The fingerprint on the outreach row (which reply made it) and its unique key. Existing rows have none.
alter table public.landlord_outreach add column if not exists reply_fingerprint text;

create unique index if not exists landlord_outreach_listing_reply_key
  on public.landlord_outreach (listing_id, reply_fingerprint);

-- 3. Read: is this home a Furnished Finder listing, what address does it have, and is this reply already recorded?
create or replace function public.map_listing_reply_prepare(p_secret text, p_listing_id uuid, p_fingerprint text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare l public.external_listings%rowtype; v_recorded boolean;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;

  select * into l from public.external_listings where id = p_listing_id;
  if not found then return jsonb_build_object('ok', true, 'found', false); end if;

  select exists (select 1 from public.landlord_replies r
                  where r.listing_id = p_listing_id and r.reply_fingerprint = p_fingerprint) into v_recorded;

  return jsonb_build_object(
    'ok', true, 'found', true, 'source', l.source,
    'address_line', l.address_line, 'unit', l.unit, 'city', l.city, 'state', l.state, 'zip', l.zip,
    'property_item_id', l.property_item_id, 'host_phone', l.host_phone, 'recorded', v_recorded);
end;
$$;

revoke all on function public.map_listing_reply_prepare(text, uuid, text) from public;

grant execute on function public.map_listing_reply_prepare(text, uuid, text) to anon, authenticated, service_role;

-- 4. Write: the street (only when the home has none), the reply, and the possible duplicates. One transaction. The row
--    lock on the home makes two saves for the same home run one after the other. p_address is null when nothing may
--    be written; otherwise {address_line, unit, city, state, zip, lat, lng, precision}. p_phone is the phone digits
--    from the reply, for the record only.
create or replace function public.map_listing_address_save(p_secret text, p_listing_id uuid, p_fingerprint text,
                                                           p_reply text, p_by text, p_phone text,
                                                           p_extracted jsonb, p_address jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  l public.external_listings%rowtype;
  v_written boolean := false;
  v_reply uuid;
  v_open_id uuid;
  v_open_fp text;
  v_dups jsonb := '[]'::jsonb;
  v_props jsonb := '[]'::jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_reply is null or p_extracted is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select * into l from public.external_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', true, 'found', false); end if;
  if l.source <> 'furnished_finder' then return jsonb_build_object('ok', false, 'error', 'wrong_source'); end if;

  -- The same reply for this home is recorded once: answer it, change nothing.
  if exists (select 1 from public.landlord_replies r
              where r.listing_id = p_listing_id and r.reply_fingerprint = p_fingerprint) then
    return jsonb_build_object('ok', true, 'found', true, 'status', 'duplicate', 'address_written', false,
             'address_line', l.address_line, 'unit', l.unit, 'city', l.city, 'state', l.state, 'zip', l.zip,
             'property_item_id', l.property_item_id);
  end if;

  -- The street: only into a home that has none.
  if p_address is not null and l.address_line is null then
    update public.external_listings
       set address_line = p_address->>'address_line',
           unit = nullif(p_address->>'unit', ''),
           city = nullif(p_address->>'city', ''),
           state = nullif(p_address->>'state', ''),
           zip = nullif(p_address->>'zip', ''),
           lat = (p_address->>'lat')::double precision,
           lng = (p_address->>'lng')::double precision,
           location_precision = p_address->>'precision'
     where id = p_listing_id
    returning * into l;
    v_written := true;

    -- Possible duplicates: the same address_key on another outside home, or the same street (nearsite_address_key)
    -- on a PROPERTY DATABASE home. Listed for a person; nothing is merged.
    if l.address_key is not null then
      select coalesce(jsonb_agg(x.id), '[]'::jsonb) into v_dups
        from (select e.id from public.external_listings e
               where e.address_key = l.address_key and e.id <> p_listing_id limit 10) x;
      select coalesce(jsonb_agg(x.monday_item_id), '[]'::jsonb) into v_props
        from (select p.monday_item_id from public.properties p
               where public.nearsite_address_key(p.address, p.zipcode, null) = l.address_key limit 10) x;
    end if;
  end if;

  -- The reply itself, once per home and text.
  insert into public.landlord_replies (listing_id, reply_fingerprint, reply_text, landlord_phone, reply_by_name, extracted, replied_at)
  values (p_listing_id, p_fingerprint, left(p_reply, 4000), nullif(p_phone, ''), nullif(left(p_by, 80), ''), p_extracted, now())
  on conflict (listing_id, reply_fingerprint) do nothing
  returning id into v_reply;
  if v_reply is null then raise exception 'landlord reply already recorded for this home'; end if;

  -- The outreach row the map shows as "Replied". Its one open ff_message row is kept: no open row gets a new one;
  -- a row this path made takes the newest reply; a row the message flow made is left as it is.
  select o.id, o.reply_fingerprint into v_open_id, v_open_fp
    from public.landlord_outreach o
   where o.listing_id = p_listing_id and o.channel = 'ff_message' and o.status not in ('failed', 'cancelled')
   order by o.created_at desc nulls last
   limit 1
   for update;

  if v_open_id is null then
    insert into public.landlord_outreach (listing_id, channel, status, message, reply_text, reply_fingerprint, replied_at,
                                          landlord_phone, requested_name, reply_by_name, extracted)
    values (p_listing_id, 'ff_message', 'replied', '', left(p_reply, 4000), p_fingerprint, now(),
            nullif(p_phone, ''), nullif(left(p_by, 80), ''), nullif(left(p_by, 80), ''), p_extracted);
  elsif v_open_fp is not null then
    update public.landlord_outreach
       set reply_text = left(p_reply, 4000),
           replied_at = now(),
           landlord_phone = coalesce(nullif(p_phone, ''), landlord_phone),
           reply_by_name = nullif(left(p_by, 80), ''),
           extracted = p_extracted,
           updated_at = now()
     where id = v_open_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'found', true, 'status', 'saved', 'reply_id', v_reply, 'address_written', v_written,
    'address_line', l.address_line, 'unit', l.unit, 'city', l.city, 'state', l.state, 'zip', l.zip,
    'property_item_id', l.property_item_id,
    'possible_duplicates', v_dups, 'property_db_matches', v_props);
end;
$$;

revoke all on function public.map_listing_address_save(text, uuid, text, text, text, text, jsonb, jsonb) from public;

grant execute on function public.map_listing_address_save(text, uuid, text, text, text, text, jsonb, jsonb) to anon, authenticated, service_role;
