-- Housing agent on the map: what the map reads from the search system, and a log for owner-phone lookups.
--
--   map_claim_refs          a Monday claim item id → the search system's (claim_source, claim_ref) pairs
--   map_claim_context       which board the claim is on, its search and version, and one outside home's state
--   map_outside_homes       homes found outside our database (Zillow, Furnished Finder) for the open claim
--   map_claim_scores        our own homes scored against the claim (typed_matches, else nearsite_matches)
--   map_submit_status       To Do → Ready to Submit → Option Submitted per option on the claim
--   map_nearsite_claims     open Nearsite claims, newest first
--   map_outreach_status     latest landlord message for a home that is in PROPERTY DATABASE
--   map_phone_lookups       log of "Find phone" lookups (guard, save, get)
--
-- Additive only: nothing existing is altered or dropped, and nothing here writes outside map_phone_lookups.
-- Every function is SECURITY DEFINER and granted to anon (the app holds only the publishable key), so each one
-- takes the server-only secret first: p_secret must equal sync_config 'MAP_EDIT_KEY' (env MAP_EDIT_SECRET),
-- checked by the existing listing_edit_key_ok. Without it the read functions answer {"ok": false,
-- "error": "forbidden"} and the phone guard answers 'forbidden'.
--
-- Every statement stands on its own so it can be applied one at a time (the connector cancels at ~60 s), and
-- the whole file can be re-run.
--
-- Rollback (the map's routes then answer "off" or 502; nothing else depends on these):
--   drop function if exists public.map_phone_lookup_get(text, text);
--   drop function if exists public.map_phone_lookup_save(text, text, uuid, text, text, text, text, text);
--   drop function if exists public.map_phone_lookup_guard(text, text, text, text);
--   drop table if exists public.map_phone_lookups;
--   drop function if exists public.map_outreach_status(text, text);
--   drop function if exists public.map_nearsite_claims(text, integer);
--   drop function if exists public.map_submit_status(text, text);
--   drop function if exists public.map_claim_scores(text, text);
--   drop function if exists public.map_outside_homes(text, text, integer);
--   drop function if exists public.map_claim_context(text, text, uuid);
--   drop function if exists public.map_claim_refs(text, text);

-- 1. Claim lookup. The same three ways in as chat_resolve_item (a Nearsite Claims item, its earlier item, a Claim
--    Process Board item the search system has saved), plus the Claim Process Board item a Nearsite claim was
--    handed off to. Returns every pair, not the first, so callers can pick the one that has a search.
--    One branch per way in, so the first can use the unique index on nearsite_claims.monday_item_id. Callers
--    resolve the pairs once per request and reuse them.
create or replace function public.map_claim_refs(p_secret text, p_claim_item_id text)
returns table(claim_source text, claim_ref text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.listing_edit_key_ok(p_secret) then return; end if;
  if p_claim_item_id is null or p_claim_item_id !~ '^\d{1,20}$' then return; end if;
  return query
    select distinct x.src, x.ref from (
      select 'nearsite'::text as src, c.nearsite_claim_id as ref
        from public.nearsite_claims c
       where c.monday_item_id = p_claim_item_id
      union all
      select 'nearsite'::text, c.nearsite_claim_id
        from public.nearsite_claims c
       where c.old_monday_item_id = p_claim_item_id
      union all
      select 'nearsite'::text, c.nearsite_claim_id
        from public.nearsite_claims c
       where c.handoff_state is not null and c.handoff_detail->>'item_id' = p_claim_item_id
      union all
      select 'monday'::text, s.claim_ref
        from public.search_claims s
       where s.claim_source = 'monday' and s.claim_ref = p_claim_item_id
    ) x;
end;
$$;

revoke all on function public.map_claim_refs(text, text) from public;

grant execute on function public.map_claim_refs(text, text) to anon, authenticated, service_role;

-- 2. What the chat and "Add to claim" routes need before they call the Search Chat workflow: the board the claim
--    item is on (the workflow fills a sub-item differently per board), the current search and version (for
--    "undo"), and, when p_listing_id is given, whether that home can be added. `address_known` follows
--    chat_add_prepare: a home with no street address or no pin, and no Nearsite listing reference, cannot be put
--    in PROPERTY DATABASE.
create or replace function public.map_claim_context(p_secret text, p_claim_item_id text, p_listing_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_board text; v_search uuid; v_version int; v_listing jsonb := null; v_keys text[];
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- The claim's (source, ref) pairs, resolved once, as 'source:ref' keys.
  select coalesce(array_agg(f.claim_source || ':' || f.claim_ref), '{}') into v_keys
    from public.map_claim_refs(p_secret, p_claim_item_id) f;

  select coalesce(
    (select s.board_id from public.search_claims s where s.claim_source = 'monday' and s.claim_ref = p_claim_item_id limit 1),
    (select '18438016194'::text from public.nearsite_claims c where c.monday_item_id = p_claim_item_id limit 1),
    (select '18438016194'::text from public.nearsite_claims c where c.old_monday_item_id = p_claim_item_id limit 1),
    (select coalesce(c.handed_off_board, '9030696652') from public.nearsite_claims c
      where c.handoff_state is not null and c.handoff_detail->>'item_id' = p_claim_item_id limit 1))
    into v_board;

  select q.id, q.version_no into v_search, v_version from (
    select s.id, v.version_no,
           (select max(r.created_at) from public.search_runs r join public.search_versions vv on vv.id = r.version_id
             where vv.search_id = s.id) as last_run, s.created_at
      from public.searches s
      left join public.search_versions v on v.id = s.current_version_id
     where (s.claim_source || ':' || s.claim_ref) = any(v_keys)
  ) q order by q.last_run desc nulls last, q.created_at desc limit 1;

  if p_listing_id is not null then
    select jsonb_build_object(
             'found', true,
             'title', coalesce(l.address_line, l.title),
             'property_item_id', coalesce(a.property_item_id, l.property_item_id),
             'subitem_id', a.subitem_id,
             'on_claim', a.listing_id is not null,
             'address_known', l.property_item_id is not null
                              or not ((l.address_line is null or l.lat is null) and public.nearsite_listing_ref(l.url) is null))
      into v_listing
      from public.external_listings l
      left join lateral (
        select h.listing_id, h.property_item_id, h.subitem_id
          from public.chat_added_homes h
         where h.listing_id = l.id and (h.claim_source || ':' || h.claim_ref) = any(v_keys)
         order by h.added_at desc limit 1) a on true
     where l.id = p_listing_id;
    v_listing := coalesce(v_listing, jsonb_build_object('found', false));
  end if;

  return jsonb_build_object('ok', true, 'known', cardinality(v_keys) > 0, 'board_id', v_board, 'search_id', v_search,
                            'version_no', v_version, 'listing', v_listing);
end;
$$;

revoke all on function public.map_claim_context(text, text, uuid) from public;

grant execute on function public.map_claim_context(text, text, uuid) to anon, authenticated, service_role;

-- 3. Outside homes for the open claim. Assembled the way chat_get_search does (latest run of the claim's search,
--    homes the team hid are left out, latest live landlord message per home), plus what the map needs and the
--    panel does not: coordinates and their precision, score, and the homes that do not fit with the reason.
--    Fitting homes come first, then by rank. A home counts as on the claim when the chat added it or when an
--    active option on the claim points at its PROPERTY DATABASE item. The claim's pairs, the homes the chat
--    added and the claim's options are each read once, before the homes.
create or replace function public.map_outside_homes(p_secret text, p_claim_item_id text, p_limit integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_search uuid; v_src text; v_ref text; v_version uuid; v_version_no int; v_params jsonb; v_run public.search_runs%rowtype;
        v_homes jsonb; v_limit int := greatest(1, least(coalesce(p_limit, 80), 200));
        v_keys text[]; v_added uuid[]; v_props text[];
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select coalesce(array_agg(f.claim_source || ':' || f.claim_ref), '{}') into v_keys
    from public.map_claim_refs(p_secret, p_claim_item_id) f;

  select q.id, q.claim_source, q.claim_ref, q.current_version_id into v_search, v_src, v_ref, v_version from (
    select s.id, s.claim_source, s.claim_ref, s.current_version_id, s.created_at,
           (select max(r.created_at) from public.search_runs r join public.search_versions vv on vv.id = r.version_id
             where vv.search_id = s.id) as last_run
      from public.searches s
     where (s.claim_source || ':' || s.claim_ref) = any(v_keys)
  ) q order by q.last_run desc nulls last, q.created_at desc limit 1;

  if v_search is null then
    return jsonb_build_object('ok', true, 'search_id', null, 'version_no', null, 'run', null, 'homes', '[]'::jsonb);
  end if;

  select v.version_no, v.params into v_version_no, v_params from public.search_versions v where v.id = v_version;

  select sr.* into v_run
    from public.search_runs sr join public.search_versions vv on vv.id = sr.version_id
   where vv.search_id = v_search
   order by sr.created_at desc limit 1;

  select coalesce(array_agg(a.listing_id), '{}') into v_added
    from public.chat_added_homes a
   where (a.claim_source || ':' || a.claim_ref) = any(v_keys);

  select coalesce(array_agg(o.property_item_id), '{}') into v_props
    from public.claim_options o
   where o.claim_item_id = p_claim_item_id;

  select coalesce(jsonb_agg(h.home order by h.ord), '[]'::jsonb) into v_homes from (
    select row_number() over (order by x.fits desc, x.rank nulls last, x.id) as ord,
           jsonb_build_object(
             'listing_id', l.id, 'source', l.source, 'url', l.url,
             'title', coalesce(l.address_line, l.title), 'address_known', l.address_line is not null,
             'city', l.city, 'state', l.state, 'beds', l.beds, 'baths', l.baths, 'rent', l.rent_monthly,
             'lat', l.lat, 'lng', l.lng,
             'precision', case when l.lat is null or l.lng is null then
                                 case when l.location_precision = 'area' then 'area' end
                               when l.location_precision = 'exact' then 'exact'
                               when l.location_precision = 'area' then 'area'
                               else 'approx' end,
             'distance_mi', x.distance_mi, 'rank', x.rank, 'score', x.score, 'fits', coalesce(x.fits, false),
             'excluded_by', coalesce(to_jsonb(x.excluded_by), '[]'::jsonb), 'is_new', coalesce(x.is_new, false),
             'in_property_db', coalesce(l.property_item_id, x.property_item_id) is not null,
             'property_item_id', coalesce(l.property_item_id, x.property_item_id),
             'on_claim', l.id = any(v_added)
                         or coalesce(coalesce(l.property_item_id, x.property_item_id) = any(v_props), false),
             'has_phone', l.host_phone is not null, 'available_from', l.available_from, 'pets', l.pets,
             'photo', l.photos->>0,
             'outreach', case when oo.status is not null then jsonb_build_object(
                           'status', oo.status, 'channel', oo.channel, 'sent_at', oo.sent_at,
                           'sent_by', oo.sent_by_name, 'replied_at', oo.replied_at) end) as home
      from public.search_run_results x
      join public.external_listings l on l.id = x.listing_id
      left join lateral (select o.status, o.channel, o.sent_at, o.sent_by_name, o.replied_at
                           from public.landlord_outreach o
                          where o.listing_id = l.id and o.status not in ('failed', 'cancelled')
                          order by o.created_at desc limit 1) oo on true
     where x.run_id = v_run.id
       and not (coalesce(v_params->'exclude_listing_ids', '[]'::jsonb) ? l.id::text)
     order by x.fits desc, x.rank nulls last, x.id
     limit v_limit) h;

  return jsonb_build_object(
    'ok', true, 'search_id', v_search, 'version_no', v_version_no, 'claim_source', v_src, 'claim_ref', v_ref,
    'run', case when v_run.id is not null then jsonb_build_object(
             'status', v_run.status, 'found', coalesce(v_run.found, 0), 'fitting', coalesce(v_run.fitting, 0),
             'new_homes', coalesce(v_run.new_homes, 0), 'finished_at', v_run.finished_at) end,
    'homes', v_homes);
end;
$$;

revoke all on function public.map_outside_homes(text, text, integer) from public;

grant execute on function public.map_outside_homes(text, text, integer) to anon, authenticated, service_role;

-- 4. Our own homes scored against the claim. typed_matches.claim_ref is the Claim Process Board item id;
--    nearsite_matches hangs off the Nearsite claim the item belongs to. typed_matches wins when both exist.
--    `stretch` is the matcher's own flag (nearsite) or a rent above the claim's cap; `stretch_by` is the dollars
--    per month above the cap, null when the stretch is not about price.
create or replace function public.map_claim_scores(p_secret text, p_claim_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_scores jsonb; v_source text := 'typed';
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_claim_item_id is null or p_claim_item_id !~ '^\d{1,20}$' then
    return jsonb_build_object('ok', true, 'source', null, 'scores', '[]'::jsonb);
  end if;

  select jsonb_agg(jsonb_build_object(
           'property_id', t.property_id, 'rank', t.rank, 'score', t.score, 'why', t.why,
           'stretch', coalesce(t.margin_usd < 0, false),
           'stretch_by', case when t.margin_usd < 0 then round(-t.margin_usd) end,
           'distance_mi', t.distance_mi) order by t.rank, t.property_id)
    into v_scores
    from public.typed_matches t
   where t.claim_ref = p_claim_item_id;

  if v_scores is null then
    v_source := 'nearsite';
    select jsonb_agg(jsonb_build_object(
             'property_id', m.property_id, 'rank', m.rank, 'score', m.score, 'why', m.why,
             'stretch', coalesce(m.stretch, false),
             'stretch_by', case when c.max_rate is not null and m.monthly_rate > c.max_rate
                                then round(m.monthly_rate - c.max_rate) end,
             'distance_mi', m.distance_mi) order by m.rank, m.property_id)
      into v_scores
      from public.nearsite_matches m
      join public.nearsite_claims c on c.nearsite_claim_id = m.nearsite_claim_id
     where m.nearsite_claim_id = (
             select f.claim_ref from public.map_claim_refs(p_secret, p_claim_item_id) f
              where f.claim_source = 'nearsite' order by f.claim_ref limit 1);
  end if;

  return jsonb_build_object('ok', true, 'source', case when v_scores is null then null else v_source end,
                            'scores', coalesce(v_scores, '[]'::jsonb));
end;
$$;

revoke all on function public.map_claim_scores(text, text) from public;

grant execute on function public.map_claim_scores(text, text) to anon, authenticated, service_role;

-- 5. Submit status per option on the claim: every active option (claim_options) and every sub-item that has an
--    approval row. Monday's own status wins for "Option Submitted"; otherwise the newest approval decides, with a
--    live one (approved, submitted) ahead of a blocked or refused one.
--      submitted  approval 'submitted' or status "Option Submitted"
--      ready      approval 'approved' or status "Ready to Submit"
--      blocked    approval 'blocked' or 'refused' (reason says why)
--      todo       everything else
create or replace function public.map_submit_status(p_secret text, p_claim_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_options jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_claim_item_id is null or p_claim_item_id !~ '^\d{1,20}$' then
    return jsonb_build_object('ok', true, 'options', '[]'::jsonb, 'counts', jsonb_build_object('ready', 0, 'submitted', 0));
  end if;

  with subs as (
    select o.subitem_id from public.claim_options o where o.claim_item_id = p_claim_item_id
    union
    select a.subitem_id from public.submission_approvals a where a.claim_item_id = p_claim_item_id and a.subitem_id is not null
  ), rows as (
    select s.subitem_id,
           coalesce(o.property_item_id, a.property_item_id) as property_id,
           case when o.status = 'Option Submitted' or a.state = 'submitted' then 'submitted'
                when a.state = 'approved' or o.status = 'Ready to Submit' then 'ready'
                when a.state in ('blocked', 'refused') then 'blocked'
                else 'todo' end as state,
           case when a.state in ('blocked', 'refused') and coalesce(o.status, '') <> 'Option Submitted' then a.reason end as reason,
           a.approved_by_name, a.approved_at, a.submitted_by_name, a.submitted_at
      from subs s
      left join public.claim_options o on o.subitem_id = s.subitem_id
      left join lateral (
        select x.* from public.submission_approvals x
         where x.subitem_id = s.subitem_id
         order by (x.state in ('approved', 'submitted')) desc, x.updated_at desc nulls last, x.id desc
         limit 1) a on true
  )
  select jsonb_agg(jsonb_build_object(
           'subitem_id', r.subitem_id, 'property_id', r.property_id, 'state', r.state, 'reason', r.reason,
           'approved_by', r.approved_by_name, 'approved_at', r.approved_at,
           'submitted_by', r.submitted_by_name, 'submitted_at', r.submitted_at) order by r.subitem_id)
    into v_options
    from rows r;

  return jsonb_build_object(
    'ok', true,
    'options', coalesce(v_options, '[]'::jsonb),
    'counts', jsonb_build_object(
      'ready', (select count(*) from jsonb_array_elements(coalesce(v_options, '[]'::jsonb)) e where e->>'state' = 'ready'),
      'submitted', (select count(*) from jsonb_array_elements(coalesce(v_options, '[]'::jsonb)) e where e->>'state' = 'submitted')));
end;
$$;

revoke all on function public.map_submit_status(text, text) from public;

grant execute on function public.map_submit_status(text, text) to anon, authenticated, service_role;

-- 6. Open Nearsite claims, newest first: still in the feed (status 'open'), still "Open" on Nearsite, and not
--    already handed off to the Claim Process Board (those are in the Active Claims list). No tenant contact
--    details: only what the Nearsite Claims board shows.
create or replace function public.map_nearsite_claims(p_secret text, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_claims jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select coalesce(jsonb_agg(q.claim order by q.ord), '[]'::jsonb) into v_claims from (
    select row_number() over (order by coalesce(c.nearsite_created_at, c.first_seen_at) desc nulls last, c.nearsite_claim_id desc) as ord,
           jsonb_build_object(
             'id', c.nearsite_claim_id, 'monday_item_id', c.monday_item_id, 'title', c.title, 'company', c.company,
             'city', c.city, 'state', c.state, 'lat', c.lat, 'lng', c.lng, 'loss_address', c.loss_address,
             'beds', c.beds, 'baths', c.baths, 'budget_monthly', c.budget_monthly, 'max_rate', c.max_rate,
             'move_in', c.move_in,
             'days_left', case when c.expires_at is not null
                               then greatest(0, ceil(extract(epoch from (c.expires_at - now())) / 86400.0))::int end,
             'fee_group', c.fee_group, 'homes_found', c.supply_homes, 'status', c.nearsite_status,
             'assigned_to', c.assigned_am_name,
             'url', case when c.claim_url ~* '^https?://' then c.claim_url end) as claim
      from public.nearsite_claims c
     where c.status = 'open'
       and c.nearsite_status = 'Open'
       and coalesce(c.handoff_state, '') <> 'done'
     order by coalesce(c.nearsite_created_at, c.first_seen_at) desc nulls last, c.nearsite_claim_id desc
     limit greatest(1, least(coalesce(p_limit, 200), 500))) q;

  return jsonb_build_object('ok', true, 'claims', v_claims);
end;
$$;

revoke all on function public.map_nearsite_claims(text, integer) from public;

grant execute on function public.map_nearsite_claims(text, integer) to anon, authenticated, service_role;

-- 7. Latest landlord message for a home that is in PROPERTY DATABASE (through the outside listing linked to it).
--    Failed and cancelled messages do not count, as in chat_get_search.
create or replace function public.map_outreach_status(p_secret text, p_property_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_out jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_property_item_id is null or p_property_item_id !~ '^\d{1,20}$' then
    return jsonb_build_object('ok', true, 'outreach', null);
  end if;

  select jsonb_build_object('status', o.status, 'channel', o.channel, 'sent_at', o.sent_at,
                            'sent_by', o.sent_by_name, 'replied_at', o.replied_at)
    into v_out
    from public.landlord_outreach o
    join public.external_listings l on l.id = o.listing_id
   where l.property_item_id = p_property_item_id
     and o.status not in ('failed', 'cancelled')
   order by o.created_at desc
   limit 1;

  return jsonb_build_object('ok', true, 'outreach', v_out);
end;
$$;

revoke all on function public.map_outreach_status(text, text) from public;

grant execute on function public.map_outreach_status(text, text) to anon, authenticated, service_role;

-- 8. "Find phone" log. One row per lookup that passed the guard; the guard inserts it, save fills in the answer.
--    A row with no `source` is a lookup that never came back. The functions below are the only readers and writers.
create table if not exists public.map_phone_lookups (
  id               bigserial primary key,
  property_item_id text,
  listing_id       uuid,
  phone            text,
  source           text,
  confidence       text,
  requested_by     text,
  ip               text,
  created_at       timestamptz default now()
);

create index if not exists map_phone_lookups_property_at_idx on public.map_phone_lookups (property_item_id, created_at desc);

create index if not exists map_phone_lookups_ip_at_idx on public.map_phone_lookups (ip, created_at);

create index if not exists map_phone_lookups_at_idx on public.map_phone_lookups (created_at);

alter table public.map_phone_lookups enable row level security;

revoke all on table public.map_phone_lookups from anon, authenticated;

revoke all on sequence public.map_phone_lookups_id_seq from anon, authenticated;

comment on table public.map_phone_lookups is
  'Owner-phone lookups asked from the map (Find phone). Written only by map_phone_lookup_guard and map_phone_lookup_save.';

-- 9. The guard. Answers forbidden | ip_limit | daily_cap, or logs the lookup and answers 'ok'. Limits: 20 per IP
--    per 10 minutes (a missing IP is its own 'unknown' bucket) and 200 per 24 hours overall, because each lookup
--    costs money. The advisory lock makes two lookups at the same instant count one after the other.
create or replace function public.map_phone_lookup_guard(p_secret text, p_property_item_id text, p_ip text, p_by text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ip text := coalesce(nullif(left(p_ip, 64), ''), 'unknown');
begin
  if not public.listing_edit_key_ok(p_secret) then return 'forbidden'; end if;
  if p_property_item_id is null or p_property_item_id !~ '^\d{1,20}$' then return 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('map_phone_lookups'));
  if (select count(*) from public.map_phone_lookups where ip = v_ip and created_at > now() - interval '10 minutes') >= 20 then
    return 'ip_limit';
  end if;
  if (select count(*) from public.map_phone_lookups where created_at > now() - interval '24 hours') >= 200 then
    return 'daily_cap';
  end if;
  insert into public.map_phone_lookups (property_item_id, requested_by, ip)
  values (p_property_item_id, nullif(left(p_by, 80), ''), v_ip);
  return 'ok';
end;
$$;

revoke all on function public.map_phone_lookup_guard(text, text, text, text) from public;

grant execute on function public.map_phone_lookup_guard(text, text, text, text) to anon, authenticated, service_role;

-- 10. Save the answer on the row the guard just logged (same property, no answer yet, last 10 minutes); when there
--     is none, add a row. A phone that is not 7–15 digits is stored as "not found". True when a row was written.
create or replace function public.map_phone_lookup_save(p_secret text, p_property_item_id text, p_listing_id uuid,
                                                        p_phone text, p_source text, p_confidence text, p_by text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id bigint;
        v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        v_phone text;
        v_source text := coalesce(nullif(left(btrim(p_source), 60), ''), 'lookup');
        v_conf text := case when p_confidence in ('high', 'medium', 'low') then p_confidence end;
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  if p_property_item_id is null or p_property_item_id !~ '^\d{1,20}$' then return false; end if;
  v_phone := case when length(v_digits) between 7 and 15
                  then (case when btrim(p_phone) like '+%' then '+' else '' end) || v_digits end;
  if v_phone is null then v_conf := null; end if;

  select id into v_id from public.map_phone_lookups
   where property_item_id = p_property_item_id and source is null and created_at > now() - interval '10 minutes'
   order by created_at desc, id desc limit 1 for update;

  if v_id is not null then
    update public.map_phone_lookups
       set phone = v_phone, source = v_source, confidence = v_conf, listing_id = coalesce(p_listing_id, listing_id)
     where id = v_id;
  else
    insert into public.map_phone_lookups (property_item_id, listing_id, phone, source, confidence, requested_by, ip)
    values (p_property_item_id, p_listing_id, v_phone, v_source, v_conf, nullif(left(p_by, 80), ''),
            coalesce(nullif(left(p_ip, 64), ''), 'unknown'));
  end if;
  return true;
end;
$$;

revoke all on function public.map_phone_lookup_save(text, text, uuid, text, text, text, text, text) from public;

grant execute on function public.map_phone_lookup_save(text, text, uuid, text, text, text, text, text) to anon, authenticated, service_role;

-- 11. The latest finished lookup for a property within 90 days, or JSON null when there is none.
create or replace function public.map_phone_lookup_get(p_secret text, p_property_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_out jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select jsonb_build_object('state', case when p.phone is not null then 'found' else 'not_found' end,
                            'phone', p.phone, 'source', p.source, 'confidence', p.confidence,
                            'looked_up_at', p.created_at)
    into v_out
    from public.map_phone_lookups p
   where p.property_item_id = p_property_item_id
     and p.source is not null
     and p.created_at > now() - interval '90 days'
   order by p.created_at desc, p.id desc
   limit 1;

  return jsonb_build_object('ok', true, 'lookup', v_out);
end;
$$;

revoke all on function public.map_phone_lookup_get(text, text) from public;

grant execute on function public.map_phone_lookup_get(text, text) to anon, authenticated, service_role;
