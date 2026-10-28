-- Quo → Monday: calls and texts log themselves, and "Owner said" from Quo's AI call summaries.
--
-- Quo posts every call, text and call summary to POST /api/quo/webhook (one Quo webhook, API version
-- 2026-03-30). The route matches the other party's number to properties here, records the event, and (when
-- QUO_LOG_MODE is 'live') moves Last Contact Date and posts one short note in Monday. Summaries are stored for
-- the property panel's "Owner said" card; applying one goes through the existing listing-edit route.
--
-- Every function below is granted to anon (the app holds only the publishable key) and gated on the same
-- server-only secret as listing edits: p_secret must equal sync_config 'MAP_EDIT_KEY' (see
-- 20261027_listing_edit.sql, public.listing_edit_key_ok). The tables are RLS-locked with no policy.
--
-- sync_config keys this migration reads (all optional):
--   QUO_LOG_MODE      'shadow' (default: record only), 'live' (write Monday), 'off' (ignore events)
--   QUO_LIVE_USERS    comma-separated Quo user ids or first names: when set, only their events write in live
--                     mode and everyone else's stay shadow (a pilot)
--   QUO_WEBHOOK_KEYS  JSON array of whsec_ signing keys (newest first), written by /api/quo/setup
--   QUO_WEBHOOK_ID    the Quo webhook id, written by /api/quo/setup
--
-- Every statement stands on its own so it can be applied one at a time, and the whole file can be re-run.

-- 1. Phone matching. Every North American number in a free-text cell, as its 10 digits; the same rule as
--    toE164List in lib/contact.ts (a cell can hold two numbers, "918-555-0100 / 918-555-0200").
create or replace function public.quo_phone_keys(p text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct m[1] || m[2] || m[3]), '{}'::text[])
  from regexp_matches(coalesce(p, ''),
                      '(?<![\d+])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]*([2-9]\d{2})[\s.-]*(\d{4})(?!\d)', 'g') as m;
$$;

create index if not exists properties_quo_phone_keys_idx on public.properties
  using gin ((public.quo_phone_keys(owner_phone) || public.quo_phone_keys(landlord_phone)));

-- 2. contact_events: one row per Quo event (call, text in, text out, summary). Message text is never stored.
--    state: received (being handled) → shadow | done | unmatched | ignored | failed (final), or retry (a
--    transient failure: the route answered 503 and Quo will deliver the event again).
create table if not exists public.contact_events (
  event_id      text primary key,
  type          text not null,
  resource_id   text not null,
  at            timestamptz not null,
  direction     text,
  numbers       text[] not null default '{}',
  inbox_id      text,
  user_id       text,
  teammate      text,
  quo_status    text,
  answered      boolean,
  duration_sec  integer,
  property_ids  text[] not null default '{}',
  note_ids      text[] not null default '{}',
  date_ids      text[] not null default '{}',
  mode          text,
  state         text not null default 'received',
  attempts      integer not null default 1,
  error         text,
  received_at   timestamptz not null default now(),
  claimed_at    timestamptz not null default now(),
  done_at       timestamptz
);

alter table public.contact_events drop constraint if exists contact_events_state_check;

alter table public.contact_events add constraint contact_events_state_check
  check (state in ('received', 'shadow', 'done', 'unmatched', 'ignored', 'failed', 'retry'));

create index if not exists contact_events_resource_idx on public.contact_events (resource_id);

create index if not exists contact_events_received_idx on public.contact_events (received_at);

alter table public.contact_events enable row level security;

revoke all on table public.contact_events from anon, authenticated;

-- 3. contact_notes: at most one note per property, day and slot. A slot is 'text_in', 'text_out', 'attempt',
--    'missed', or 'call:<call id>' (every answered call gets its own note). Claimed before posting, so a
--    retried event never posts twice; a claim whose post never finished is free again after a minute.
create table if not exists public.contact_notes (
  property_item_id text not null,
  day              date not null,
  slot             text not null,
  event_id         text not null,
  update_id        text,
  claimed_at       timestamptz not null default now(),
  primary key (property_item_id, day, slot)
);

alter table public.contact_notes enable row level security;

revoke all on table public.contact_notes from anon, authenticated;

-- 4. call_summaries: Quo's AI summary of an answered call, the facts read from it (lib/owner-said.ts), and who
--    applied them to Monday from the map.
create table if not exists public.call_summaries (
  call_id        text primary key,
  event_id       text not null,
  at             timestamptz not null,
  teammate       text,
  duration_sec   integer,
  numbers        text[] not null default '{}',
  property_ids   text[] not null default '{}',
  summary        text[] not null,
  next_steps     text[] not null default '{}',
  facts          jsonb not null default '[]'::jsonb,
  applied_by     text,
  applied_at     timestamptz,
  applied_fields text[],
  received_at    timestamptz not null default now()
);

-- How many properties the number matched in all, so the card can say when a summary may be about another one.
alter table public.call_summaries add column if not exists property_count integer;

create index if not exists call_summaries_property_idx on public.call_summaries using gin (property_ids);

alter table public.call_summaries enable row level security;

revoke all on table public.call_summaries from anon, authenticated;

-- 5. contact_backfill: the one-off fill of Last Contact Date from Quo's history. 'proposed' rows are the
--    report; /api/quo/backfill?mode=apply writes them to Monday and marks them 'applied'.
create table if not exists public.contact_backfill (
  property_item_id text primary key,
  phone            text not null,
  quo_at           timestamptz not null,
  quo_day          date not null,
  kind             text not null,
  teammate         text,
  monday_day       date,
  state            text not null default 'proposed',
  error            text,
  scanned_at       timestamptz not null default now(),
  applied_at       timestamptz
);

alter table public.contact_backfill drop constraint if exists contact_backfill_state_check;

alter table public.contact_backfill add constraint contact_backfill_state_check
  check (state in ('proposed', 'applied', 'skipped', 'failed'));

alter table public.contact_backfill enable row level security;

revoke all on table public.contact_backfill from anon, authenticated;

-- 6. Config for the route: the mode, the pilot users and the signing keys, in one read.
create or replace function public.quo_config(p_secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_keys jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return null; end if;
  begin
    v_keys := coalesce((select value from public.sync_config where key = 'QUO_WEBHOOK_KEYS')::jsonb, '[]'::jsonb);
  exception when others then
    v_keys := '[]'::jsonb;
  end;
  return jsonb_build_object(
    'mode', coalesce((select lower(trim(value)) from public.sync_config where key = 'QUO_LOG_MODE'), 'shadow'),
    'liveUsers', coalesce((select value from public.sync_config where key = 'QUO_LIVE_USERS'), ''),
    'keys', case when jsonb_typeof(v_keys) = 'array' then v_keys else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.quo_config(text) from public;

grant execute on function public.quo_config(text) to anon, authenticated, service_role;

-- 7. Stores the webhook /api/quo/setup created: its id, and its key first in the list (the previous key is
--    kept so deliveries signed before a rotation still verify).
create or replace function public.quo_set_webhook(p_secret text, p_webhook_id text, p_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_keys jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  if p_key is null or p_key !~ '^whsec_[A-Za-z0-9+/=]{16,200}$' or coalesce(p_webhook_id, '') = '' then return false; end if;
  begin
    v_keys := coalesce((select value from public.sync_config where key = 'QUO_WEBHOOK_KEYS')::jsonb, '[]'::jsonb);
  exception when others then
    v_keys := '[]'::jsonb;
  end;
  if jsonb_typeof(v_keys) <> 'array' then v_keys := '[]'::jsonb; end if;
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_keys
  from (select p_key as k union all
        select x from jsonb_array_elements_text(v_keys) as t(x) where x <> p_key limit 2) s;
  insert into public.sync_config (key, value, updated_at) values ('QUO_WEBHOOK_KEYS', v_keys::text, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.sync_config (key, value, updated_at) values ('QUO_WEBHOOK_ID', p_webhook_id, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return true;
end;
$$;

revoke all on function public.quo_set_webhook(text, text, text) from public;

grant execute on function public.quo_set_webhook(text, text, text) to anon, authenticated, service_role;

-- 8. The properties behind some numbers (E.164). One row per property and number: whether the number is the
--    owner's (else the landlord/PM's), whether the property is an option on an active claim, its Last Contact
--    Date as the map has it, and its street (so a call summary that names a street goes to that property). Ordered for the smart pick: active-claim options first, then the most
--    recently contacted, then the most recently updated.
create or replace function public.quo_match(p_secret text, p_numbers text[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return null; end if;
  with keys as (
    select distinct n as number, right(regexp_replace(n, '\D', '', 'g'), 10) as k
    from unnest(coalesce(p_numbers, '{}'::text[])) as n
    where n ~ '^\+1[2-9]\d{2}[2-9]\d{6}$'
    limit 20
  ), hits as (
    select keys.number, p.monday_item_id as id,
           keys.k = any(public.quo_phone_keys(p.owner_phone)) as owner,
           exists (select 1 from public.claim_options o where o.property_item_id = p.monday_item_id) as on_claim,
           p.last_contact, p.updated_at, nullif(trim(split_part(coalesce(p.address, ''), ',', 1)), '') as street
    from keys
    join lateral (
      select * from public.properties p
      where (public.quo_phone_keys(p.owner_phone) || public.quo_phone_keys(p.landlord_phone)) @> array[keys.k]
      limit 200
    ) p on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'number', number, 'id', id, 'owner', owner, 'onClaim', on_claim, 'lastContact', last_contact, 'street', street)
         order by on_claim desc, last_contact desc nulls last, updated_at desc nulls last, id), '[]'::jsonb)
  into v from hits;
  return v;
end;
$$;

revoke all on function public.quo_match(text, text[]) from public;

grant execute on function public.quo_match(text, text[]) to anon, authenticated, service_role;

-- 9. Starts handling an event. Answers 'new' (first delivery), 'retry' (an earlier delivery didn't finish),
--    'duplicate' (already handled: answer 200 and do nothing), 'busy' (another delivery is handling it right
--    now: answer 503 so Quo comes back later) or 'forbidden'.
create or replace function public.quo_event_begin(p_secret text, p_event jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id text := p_event->>'eventId'; v_state text; v_claimed timestamptz;
begin
  if not public.listing_edit_key_ok(p_secret) then return 'forbidden'; end if;
  if coalesce(v_id, '') = '' or length(v_id) > 100 or coalesce(p_event->>'resourceId', '') = '' or coalesce(p_event->>'type', '') = ''
     or coalesce(p_event->>'at', '') !~ '^\d{4}-\d{2}-\d{2}T' then
    return 'invalid';
  end if;
  insert into public.contact_events (event_id, type, resource_id, at, direction, numbers, inbox_id, user_id, teammate,
                                     quo_status, answered, duration_sec, mode)
  values (v_id, left(p_event->>'type', 60), left(p_event->>'resourceId', 100),
          (p_event->>'at')::timestamptz, left(p_event->>'direction', 20),
          coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p_event->'numbers', '[]'::jsonb)) as t(x) limit 10), '{}'),
          left(p_event->>'inboxId', 60), left(p_event->>'userId', 60), left(p_event->>'teammate', 80),
          left(p_event->>'status', 40), (p_event->>'answered')::boolean, (p_event->>'durationSec')::integer,
          left(p_event->>'mode', 20))
  on conflict (event_id) do nothing;
  if found then return 'new'; end if;
  select state, claimed_at into v_state, v_claimed from public.contact_events where event_id = v_id for update;
  if v_state in ('shadow', 'done', 'unmatched', 'ignored', 'failed') then return 'duplicate'; end if;
  if v_state = 'received' and v_claimed > now() - interval '20 seconds' then return 'busy'; end if;
  update public.contact_events
     set state = 'received', attempts = attempts + 1, claimed_at = now(), mode = left(p_event->>'mode', 20)
   where event_id = v_id;
  return 'retry';
end;
$$;

revoke all on function public.quo_event_begin(text, jsonb) from public;

grant execute on function public.quo_event_begin(text, jsonb) to anon, authenticated, service_role;

-- 10. Closes an event with what happened to it.
create or replace function public.quo_event_finish(p_secret text, p_event_id text, p_state text, p_property_ids text[],
                                                   p_note_ids text[], p_date_ids text[], p_error text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  if p_state not in ('shadow', 'done', 'unmatched', 'ignored', 'failed', 'retry') then return false; end if;
  update public.contact_events
     set state = p_state,
         property_ids = coalesce(p_property_ids, '{}'), note_ids = coalesce(p_note_ids, '{}'), date_ids = coalesce(p_date_ids, '{}'),
         error = left(p_error, 500),
         done_at = case when p_state = 'retry' then null else now() end
   where event_id = p_event_id;
  return found;
end;
$$;

revoke all on function public.quo_event_finish(text, text, text, text[], text[], text[], text) from public;

grant execute on function public.quo_event_finish(text, text, text, text[], text[], text[], text) to anon, authenticated, service_role;

-- 11. Note claims: claim before posting, record the update id after, release when the post failed.
create or replace function public.quo_note_claim(p_secret text, p_property_item_id text, p_day date, p_slot text, p_event_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ok boolean;
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  insert into public.contact_notes (property_item_id, day, slot, event_id)
  values (p_property_item_id, p_day, left(p_slot, 120), p_event_id)
  on conflict (property_item_id, day, slot) do update
     set event_id = excluded.event_id, claimed_at = now()
   where public.contact_notes.update_id is null and public.contact_notes.claimed_at < now() - interval '60 seconds'
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.quo_note_claim(text, text, date, text, text) from public;

grant execute on function public.quo_note_claim(text, text, date, text, text) to anon, authenticated, service_role;

create or replace function public.quo_note_done(p_secret text, p_property_item_id text, p_day date, p_slot text,
                                                p_event_id text, p_update_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  if p_update_id is null then
    delete from public.contact_notes
     where property_item_id = p_property_item_id and day = p_day and slot = p_slot and event_id = p_event_id and update_id is null;
  else
    update public.contact_notes set update_id = left(p_update_id, 40)
     where property_item_id = p_property_item_id and day = p_day and slot = p_slot and event_id = p_event_id;
  end if;
  return found;
end;
$$;

revoke all on function public.quo_note_done(text, text, date, text, text, text) from public;

grant execute on function public.quo_note_done(text, text, date, text, text, text) to anon, authenticated, service_role;

-- 12. The map shows a new Last Contact Date at once (the Monday webhook confirms it seconds later). Never
--     moves a date backwards.
create or replace function public.quo_mirror_last_contact(p_secret text, p_ids text[], p_day date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  if not public.listing_edit_key_ok(p_secret) then return 0; end if;
  if p_day is null or p_day < date '2015-01-01' or p_day > current_date + 1 then return 0; end if;
  update public.properties set last_contact = p_day, updated_at = now()
   where monday_item_id = any(coalesce(p_ids, '{}')) and (last_contact is null or last_contact < p_day);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.quo_mirror_last_contact(text, text[], date) from public;

grant execute on function public.quo_mirror_last_contact(text, text[], date) to anon, authenticated, service_role;

-- 13. Summaries: save (a re-delivered summary refreshes the text but keeps who applied it), read for the
--     panel, check a source on an edit, and mark one applied.
create or replace function public.quo_summary_save(p_secret text, p_row jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  if coalesce(p_row->>'callId', '') = '' or jsonb_typeof(p_row->'summary') <> 'array' then return false; end if;
  insert into public.call_summaries (call_id, event_id, at, teammate, duration_sec, numbers, property_ids, property_count,
                                     summary, next_steps, facts)
  values (
    left(p_row->>'callId', 100), left(p_row->>'eventId', 100), coalesce((p_row->>'at')::timestamptz, now()),
    left(p_row->>'teammate', 80), (p_row->>'durationSec')::integer,
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p_row->'numbers', '[]'::jsonb)) as t(x) limit 10), '{}'),
    coalesce(array(select left(x, 20) from jsonb_array_elements_text(coalesce(p_row->'propertyIds', '[]'::jsonb)) as t(x) limit 200), '{}'),
    (p_row->>'propertyCount')::integer,
    array(select left(x, 1000) from jsonb_array_elements_text(p_row->'summary') as t(x) limit 20),
    coalesce(array(select left(x, 1000) from jsonb_array_elements_text(coalesce(p_row->'nextSteps', '[]'::jsonb)) as t(x) limit 20), '{}'),
    case when jsonb_typeof(p_row->'facts') = 'array' then p_row->'facts' else '[]'::jsonb end
  )
  on conflict (call_id) do update set
    event_id = excluded.event_id, at = excluded.at, teammate = coalesce(excluded.teammate, call_summaries.teammate),
    duration_sec = coalesce(excluded.duration_sec, call_summaries.duration_sec), numbers = excluded.numbers,
    property_ids = excluded.property_ids, property_count = excluded.property_count, summary = excluded.summary,
    next_steps = excluded.next_steps, facts = excluded.facts;
  return true;
end;
$$;

revoke all on function public.quo_summary_save(text, jsonb) from public;

grant execute on function public.quo_summary_save(text, jsonb) to anon, authenticated, service_role;

create or replace function public.quo_owner_said(p_secret text, p_property_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'callId', call_id, 'at', at, 'by', teammate, 'durationSec', duration_sec, 'propertyCount', property_count,
           'summary', to_jsonb(summary), 'nextSteps', to_jsonb(next_steps), 'facts', facts,
           'applied', case when applied_at is null then null
                           else jsonb_build_object('by', applied_by, 'at', applied_at, 'fields', to_jsonb(coalesce(applied_fields, '{}'))) end)
         order by at desc), '[]'::jsonb)
  into v
  from (select * from public.call_summaries
         where property_ids @> array[p_property_item_id] and at > now() - interval '180 days'
         order by at desc limit 3) s;
  return v;
end;
$$;

revoke all on function public.quo_owner_said(text, text) from public;

grant execute on function public.quo_owner_said(text, text) to anon, authenticated, service_role;

create or replace function public.quo_summary_source(p_secret text, p_call_id text, p_property_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return null; end if;
  select jsonb_build_object('at', at, 'by', teammate) into v
  from public.call_summaries where call_id = p_call_id and property_ids @> array[p_property_item_id];
  return v;
end;
$$;

revoke all on function public.quo_summary_source(text, text, text) from public;

grant execute on function public.quo_summary_source(text, text, text) to anon, authenticated, service_role;

create or replace function public.quo_summary_applied(p_secret text, p_call_id text, p_property_item_id text, p_editor text, p_fields text[])
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.listing_edit_key_ok(p_secret) then return false; end if;
  update public.call_summaries
     set applied_by = left(p_editor, 80), applied_at = now(),
         applied_fields = array(select left(x, 40) from unnest(coalesce(p_fields, '{}')) as x limit 30)
   where call_id = p_call_id and property_ids @> array[p_property_item_id];
  return found;
end;
$$;

revoke all on function public.quo_summary_applied(text, text, text, text, text[]) from public;

grant execute on function public.quo_summary_applied(text, text, text, text, text[]) to anon, authenticated, service_role;

-- 14. Backfill: record what a scan found (keeping the newest contact per property), read the next rows to
--     write, and mark rows written (or not). Applying also moves the map's date.
create or replace function public.quo_backfill_upsert(p_secret text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  if not public.listing_edit_key_ok(p_secret) then return 0; end if;
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  insert into public.contact_backfill as b (property_item_id, phone, quo_at, quo_day, kind, teammate, monday_day)
  select left(r->>'id', 20), left(r->>'phone', 40), (r->>'at')::timestamptz, (r->>'day')::date, left(r->>'kind', 20),
         left(r->>'teammate', 80), (r->>'mondayDay')::date
  from jsonb_array_elements(p_rows) as r
  where coalesce(r->>'id', '') <> '' and (r->>'day') is not null
  on conflict (property_item_id) do update set
    phone = excluded.phone, quo_at = excluded.quo_at, quo_day = excluded.quo_day, kind = excluded.kind,
    teammate = excluded.teammate, monday_day = excluded.monday_day, scanned_at = now()
  where b.state = 'proposed' and excluded.quo_at > b.quo_at;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.quo_backfill_upsert(text, jsonb) from public;

grant execute on function public.quo_backfill_upsert(text, jsonb) to anon, authenticated, service_role;

create or replace function public.quo_backfill_next(p_secret text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return null; end if;
  -- A row the map already holds at that date or later (someone logged it meanwhile) has nothing to do.
  update public.contact_backfill b set state = 'skipped'
    from public.properties p
   where b.state = 'proposed' and p.monday_item_id = b.property_item_id and p.last_contact >= b.quo_day;
  select coalesce(jsonb_agg(jsonb_build_object('id', property_item_id, 'day', quo_day) order by property_item_id), '[]'::jsonb)
  into v
  from (select property_item_id, quo_day from public.contact_backfill
         where state = 'proposed' order by property_item_id limit greatest(1, least(coalesce(p_limit, 25), 100))) s;
  return v;
end;
$$;

revoke all on function public.quo_backfill_next(text, integer) from public;

grant execute on function public.quo_backfill_next(text, integer) to anon, authenticated, service_role;

create or replace function public.quo_backfill_mark(p_secret text, p_ids text[], p_state text, p_error text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  if not public.listing_edit_key_ok(p_secret) then return 0; end if;
  if p_state not in ('applied', 'failed') then return 0; end if;
  update public.contact_backfill
     set state = p_state, error = left(p_error, 500), applied_at = case when p_state = 'applied' then now() else applied_at end
   where property_item_id = any(coalesce(p_ids, '{}')) and state = 'proposed';
  get diagnostics v_n = row_count;
  if p_state = 'applied' then
    update public.properties p set last_contact = b.quo_day, updated_at = now()
      from public.contact_backfill b
     where b.property_item_id = any(p_ids) and b.state = 'applied' and p.monday_item_id = b.property_item_id
       and (p.last_contact is null or p.last_contact < b.quo_day);
  end if;
  return v_n;
end;
$$;

revoke all on function public.quo_backfill_mark(text, text[], text, text) from public;

grant execute on function public.quo_backfill_mark(text, text[], text, text) to anon, authenticated, service_role;

-- 15. The daily check during shadow mode (read with the SQL editor; not exposed to the API).
create or replace view public.contact_events_daily as
with e as (select (received_at at time zone 'America/Chicago')::date as day, * from public.contact_events)
select day,
       count(*) filter (where type = 'call.completed') as calls,
       count(*) filter (where type = 'call.completed' and answered) as answered_calls,
       count(*) filter (where type in ('message.received', 'message.delivered')) as texts,
       count(*) filter (where type = 'call.summary.completed') as summaries,
       count(*) filter (where state = 'unmatched') as unmatched,
       count(*) filter (where state in ('failed', 'retry')) as failed,
       (select count(distinct p) from e e2 cross join lateral unnest(e2.property_ids) as p where e2.day = e.day) as properties_matched,
       count(*) filter (where cardinality(note_ids) > 0) as events_with_notes,
       count(*) filter (where cardinality(date_ids) > 0) as events_moving_dates
from e
group by day;

revoke all on public.contact_events_daily from anon, authenticated;
