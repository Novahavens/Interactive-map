-- Live check of the Quo contact-log functions (20261028_quo_contact_log.sql) against the real database,
-- leaving nothing behind. Paste into the Supabase SQL editor (or run through the connector). It uses the
-- existing MAP_EDIT_KEY, exercises every function on one real property, then raises an error on purpose so
-- the whole transaction rolls back. The error message is the result; every pair should read as below.
--
-- Expected (28 Oct 2026): config_wrong=null; config_mode=shadow; set_bad_key=false; set_key=true; keys=1;
-- match_wrong=null; match_n>0=true; match_owner=true; match_intl=0; begin=new; begin_again=busy;
-- begin_after_retry=retry; begin_done=duplicate; begin_invalid=invalid; claim=true; claim_again=false;
-- claim_released=true; mirror=1; mirror_again=0; mirror_future=0; summary_save=true; owner_said=1;
-- owner_said_fact=monthly_rate; source=true; applied=true; owner_said_applied=Tester; backfill_upsert=1;
-- backfill_older=0; backfill_next=1; backfill_mark=1; backfill_mirrored=true; anon_read_events=denied;
-- anon_config_no_secret=null
do $$
declare
  r text := '';
  k text; pid text; phone text; day0 date; j jsonb; n int;
begin
  select value into k from public.sync_config where key = 'MAP_EDIT_KEY';
  select p.monday_item_id, '+1' || (public.quo_phone_keys(p.owner_phone))[1], p.last_contact
    into pid, phone, day0
  from public.properties p
  where cardinality(public.quo_phone_keys(p.owner_phone)) > 0 and (p.last_contact is null or p.last_contact < date '2026-10-01')
  order by p.monday_item_id limit 1;

  -- config and keys
  r := r || 'config_wrong=' || coalesce(public.quo_config('wrong')::text, 'null') || '; ';
  delete from public.sync_config where key in ('QUO_LOG_MODE', 'QUO_WEBHOOK_KEYS', 'QUO_WEBHOOK_ID');
  r := r || 'config_mode=' || (public.quo_config(k)->>'mode') || '; ';
  r := r || 'set_bad_key=' || public.quo_set_webhook(k, 'WH1', 'not-a-key') || '; ';
  r := r || 'set_key=' || public.quo_set_webhook(k, 'WH1', 'whsec_' || encode('0123456789abcdef0123456789abcdef'::bytea, 'base64')) || '; ';
  r := r || 'keys=' || jsonb_array_length(public.quo_config(k)->'keys') || '; ';

  -- matching
  r := r || 'match_wrong=' || coalesce(public.quo_match('wrong', array[phone])::text, 'null') || '; ';
  j := public.quo_match(k, array[phone]);
  r := r || 'match_n>0=' || (jsonb_array_length(j) > 0) || '; ';
  r := r || 'match_owner=' || (select bool_or((x->>'owner')::boolean) from jsonb_array_elements(j) x where x->>'id' = pid) || '; ';
  r := r || 'match_intl=' || jsonb_array_length(public.quo_match(k, array['+447700900123'])) || '; ';

  -- event lifecycle
  j := jsonb_build_object('eventId', 'EVtest1', 'type', 'call.completed', 'resourceId', 'ACtest1', 'at', '2026-10-27T19:14:00Z',
         'direction', 'outgoing', 'numbers', jsonb_build_array(phone), 'answered', true, 'durationSec', 185, 'mode', 'live');
  r := r || 'begin=' || public.quo_event_begin(k, j) || '; ';
  r := r || 'begin_again=' || public.quo_event_begin(k, j) || '; ';
  perform public.quo_event_finish(k, 'EVtest1', 'retry', array[pid], array[pid], array[pid], 'test');
  update public.contact_events set claimed_at = now() - interval '1 minute' where event_id = 'EVtest1';
  r := r || 'begin_after_retry=' || public.quo_event_begin(k, j) || '; ';
  perform public.quo_event_finish(k, 'EVtest1', 'done', array[pid], array[pid], array[pid]);
  r := r || 'begin_done=' || public.quo_event_begin(k, j) || '; ';
  r := r || 'begin_invalid=' || public.quo_event_begin(k, j - 'type') || '; ';

  -- note claims
  r := r || 'claim=' || public.quo_note_claim(k, pid, date '2026-10-27', 'text_in', 'EVtest1') || '; ';
  r := r || 'claim_again=' || public.quo_note_claim(k, pid, date '2026-10-27', 'text_in', 'EVtest2') || '; ';
  perform public.quo_note_done(k, pid, date '2026-10-27', 'text_in', 'EVtest1', null); -- the post failed: released
  r := r || 'claim_released=' || public.quo_note_claim(k, pid, date '2026-10-27', 'text_in', 'EVtest2') || '; ';
  perform public.quo_note_done(k, pid, date '2026-10-27', 'text_in', 'EVtest2', '123456');

  -- mirror
  r := r || 'mirror=' || public.quo_mirror_last_contact(k, array[pid], date '2026-10-27') || '; ';
  r := r || 'mirror_again=' || public.quo_mirror_last_contact(k, array[pid], date '2026-10-26') || '; ';
  r := r || 'mirror_future=' || public.quo_mirror_last_contact(k, array[pid], current_date + 5) || '; ';

  -- summaries
  r := r || 'summary_save=' || public.quo_summary_save(k, jsonb_build_object('callId', 'ACtest1', 'eventId', 'EVtest3',
         'at', '2026-10-27T19:14:00Z', 'teammate', 'Will', 'durationSec', 185, 'numbers', jsonb_build_array(phone),
         'propertyIds', jsonb_build_array(pid), 'propertyCount', 1, 'summary', jsonb_build_array('Rent is $2,400.'),
         'nextSteps', '[]'::jsonb, 'facts', jsonb_build_array(jsonb_build_object('key', 'monthly_rate', 'value', 2400, 'evidence', 'Rent is $2,400.')))) || '; ';
  j := public.quo_owner_said(k, pid);
  r := r || 'owner_said=' || jsonb_array_length(j) || '; ';
  r := r || 'owner_said_fact=' || (j->0->'facts'->0->>'key') || '; ';
  r := r || 'source=' || (public.quo_summary_source(k, 'ACtest1', pid)->>'by' = 'Will') || '; ';
  r := r || 'applied=' || public.quo_summary_applied(k, 'ACtest1', pid, 'Tester', array['monthly_rate']) || '; ';
  r := r || 'owner_said_applied=' || (public.quo_owner_said(k, pid)->0->'applied'->>'by') || '; ';

  -- backfill (the mirror above set the date to 2026-10-27; put it back first)
  update public.properties set last_contact = day0 where monday_item_id = pid;
  r := r || 'backfill_upsert=' || public.quo_backfill_upsert(k, jsonb_build_array(jsonb_build_object('id', pid, 'phone', phone,
         'at', '2026-10-20T15:00:00Z', 'day', '2026-10-20', 'kind', 'call', 'teammate', 'Will', 'mondayDay', day0))) || '; ';
  r := r || 'backfill_older=' || public.quo_backfill_upsert(k, jsonb_build_array(jsonb_build_object('id', pid, 'phone', phone,
         'at', '2026-10-01T15:00:00Z', 'day', '2026-10-01', 'kind', 'call'))) || '; ';
  r := r || 'backfill_next=' || (select count(*) from jsonb_array_elements(public.quo_backfill_next(k, 100)) x where x->>'id' = pid) || '; ';
  r := r || 'backfill_mark=' || public.quo_backfill_mark(k, array[pid], 'applied') || '; ';
  r := r || 'backfill_mirrored=' || ((select last_contact from public.properties where monday_item_id = pid) = date '2026-10-20') || '; ';

  -- what the publishable key can reach directly
  set local role anon;
  begin
    select count(*) into n from public.contact_events;
    r := r || 'anon_read_events=ALLOWED; ';
  exception when others then r := r || 'anon_read_events=denied; ';
  end;
  r := r || 'anon_config_no_secret=' || coalesce(public.quo_config(null)::text, 'null') || '; ';
  reset role;

  raise exception 'ROLLBACK-TEST %', r;
end $$;
