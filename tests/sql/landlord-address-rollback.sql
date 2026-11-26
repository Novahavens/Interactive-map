-- Live check of the landlord-reply functions (supabase/migrations/20261126_landlord_address.sql) against the real
-- database, leaving nothing behind. It reads the server secret from sync_config inside the block (never printed),
-- saves replies on three real Furnished Finder homes with no address, then raises an error on purpose so the whole
-- transaction rolls back. The error message is the result.
--
-- Run it alone after the migration is applied. Afterwards check that nothing stayed:
--   select count(*) from public.landlord_replies;                          -- 0
--   select count(*) from public.external_listings where address_line is not null;   -- as before the run
--
-- Expected (26 Nov 2026; the words must hold, the counts move with the data):
--   key_present=true; prepare=found:true,recorded:false,source:furnished_finder; prepare_wrong_secret=forbidden;
--   prepare_bad_fp=bad_request; save1=status:saved,written:true; the listing has the street, key "123 main 74104",
--   host_phone=null, geog=true, precision=approx; replies=1; open_outreach=1 (status replied, fingerprint set);
--   repeat_paste=status:duplicate,written:false; replies_after_repeat=1; prepare_after=recorded:true;
--   other_street=status:saved,written:false (the street is kept); replies_two=2; long_reply=reply_len=4000;
--   open_outreach_after_second=1; same_street_other_home=status:saved,written:true,possible_dups:1;
--   zillow_home=wrong_source; save_wrong_secret=forbidden; save_missing_home=found:false;
--   flow_home_save=status:saved,written:false; flow_row_after=status=sent,message=flow message,reply_text=null,fp=null;
--   flow_home_replies=1
do $$
declare
  k text := (select value from public.sync_config where key = 'MAP_EDIT_KEY');
  lid uuid; lid2 uuid; lid3 uuid; ztid uuid;
  fp text := md5('landlord-verify-1') || md5('landlord-verify-1b');
  fp2 text := md5('landlord-verify-2') || md5('landlord-verify-2b');
  fp3 text := md5('landlord-verify-3') || md5('landlord-verify-3b');
  r text := ''; j jsonb; n int; s text;
begin
  select id into lid from public.external_listings where source = 'furnished_finder' and address_line is null and lat is null and property_item_id is null order by first_seen_at, id limit 1;
  select id into lid2 from public.external_listings where source = 'furnished_finder' and address_line is null and property_item_id is null and id <> lid order by first_seen_at, id limit 1;
  select id into lid3 from public.external_listings where source = 'furnished_finder' and address_line is null and property_item_id is null and id not in (lid, lid2) order by first_seen_at, id limit 1;
  select id into ztid from public.external_listings where source = 'zillow' limit 1;
  r := r || 'key_present=' || (k is not null) || '; ';

  j := public.map_listing_reply_prepare(k, lid, fp);
  r := r || 'prepare=found:' || coalesce(j->>'found', 'null') || ',recorded:' || coalesce(j->>'recorded', 'null') || ',source:' || coalesce(j->>'source', 'null') || '; ';
  j := public.map_listing_reply_prepare('wrong-secret', lid, fp);
  r := r || 'prepare_wrong_secret=' || coalesce(j->>'error', 'none') || '; ';
  j := public.map_listing_reply_prepare(k, lid, 'not-hex');
  r := r || 'prepare_bad_fp=' || coalesce(j->>'error', 'none') || '; ';

  j := public.map_listing_address_save(k, lid, fp, 'Hi, it is 123 Main St, Tulsa OK 74104. Call 918-555-0100.', 'Verifier', '+19185550100',
         jsonb_build_object('v', 1, 'outcome', 'address_saved'),
         jsonb_build_object('address_line', '123 Main St', 'unit', null, 'city', 'Tulsa', 'state', 'OK', 'zip', '74104', 'lat', 36.15, 'lng', -95.97, 'precision', 'approx'));
  r := r || 'save1=status:' || coalesce(j->>'status', 'null') || ',written:' || coalesce(j->>'address_written', 'null') || ',dups:' || jsonb_array_length(j->'possible_duplicates') || ',props:' || jsonb_array_length(j->'property_db_matches') || '; ';
  select 'addr=' || coalesce(address_line, 'null') || ' | key=' || coalesce(address_key, 'null') || ' | host_phone=' || coalesce(host_phone, 'null') || ' | geog=' || (geog is not null)::text || ' | precision=' || coalesce(location_precision, 'null') into s from public.external_listings where id = lid;
  r := r || 'listing=' || s || '; ';
  select count(*) into n from public.landlord_replies where listing_id = lid;
  r := r || 'replies=' || n || '; ';
  select count(*) into n from public.landlord_outreach where listing_id = lid and channel = 'ff_message' and status not in ('failed', 'cancelled');
  r := r || 'open_outreach=' || n || '; ';
  select 'status=' || status || ',fp_set=' || (reply_fingerprint is not null)::text || ',phone=' || coalesce(landlord_phone, 'null') || ',by=' || coalesce(reply_by_name, 'null') into s from public.landlord_outreach where listing_id = lid and channel = 'ff_message' and status not in ('failed', 'cancelled');
  r := r || 'outreach_row=' || s || '; ';

  j := public.map_listing_address_save(k, lid, fp, 'Hi, it is 123 Main St, Tulsa OK 74104.', 'Verifier', null, jsonb_build_object('v', 1), null);
  r := r || 'repeat_paste=status:' || coalesce(j->>'status', 'null') || ',written:' || coalesce(j->>'address_written', 'null') || '; ';
  select count(*) into n from public.landlord_replies where listing_id = lid;
  r := r || 'replies_after_repeat=' || n || '; ';
  j := public.map_listing_reply_prepare(k, lid, fp);
  r := r || 'prepare_after=recorded:' || coalesce(j->>'recorded', 'null') || '; ';

  j := public.map_listing_address_save(k, lid, fp2, repeat('long text ', 600), 'Verifier', null, jsonb_build_object('v', 1, 'outcome', 'kept_existing'),
         jsonb_build_object('address_line', '456 Oak Ave', 'unit', null, 'city', 'Tulsa', 'state', 'OK', 'zip', '74105', 'lat', 36.1, 'lng', -95.9, 'precision', 'approx'));
  r := r || 'other_street=status:' || coalesce(j->>'status', 'null') || ',written:' || coalesce(j->>'address_written', 'null') || ',kept:' || coalesce(j->>'address_line', 'null') || '; ';
  select count(*) into n from public.landlord_replies where listing_id = lid;
  r := r || 'replies_two=' || n || '; ';
  select 'reply_len=' || length(reply_text) into s from public.landlord_replies where listing_id = lid and reply_fingerprint = fp2;
  r := r || 'long_reply=' || coalesce(s, 'null') || '; ';
  select count(*) into n from public.landlord_outreach where listing_id = lid and channel = 'ff_message' and status not in ('failed', 'cancelled');
  r := r || 'open_outreach_after_second=' || n || '; ';
  select 'reply_len=' || length(reply_text) || ',is_latest=' || (left(reply_text, 20) = repeat('long text ', 2))::text into s from public.landlord_outreach where listing_id = lid and channel = 'ff_message' and status not in ('failed', 'cancelled');
  r := r || 'outreach_now_latest=' || coalesce(s, 'null') || '; ';

  j := public.map_listing_address_save(k, lid2, fp, 'Same street on another home', 'Verifier', null, jsonb_build_object('v', 1),
         jsonb_build_object('address_line', '123 Main St', 'unit', null, 'city', 'Tulsa', 'state', 'OK', 'zip', '74104', 'lat', 36.15, 'lng', -95.97, 'precision', 'approx'));
  r := r || 'same_street_other_home=status:' || coalesce(j->>'status', 'null') || ',written:' || coalesce(j->>'address_written', 'null') || ',possible_dups:' || jsonb_array_length(j->'possible_duplicates') || '; ';

  if ztid is not null then
    j := public.map_listing_address_save(k, ztid, fp, 'x', 'Verifier', null, jsonb_build_object('v', 1), null);
    r := r || 'zillow_home=' || coalesce(j->>'error', j->>'status', 'null') || '; ';
  end if;
  j := public.map_listing_address_save('wrong-secret', lid2, fp2, 'x', 'Verifier', null, jsonb_build_object('v', 1), null);
  r := r || 'save_wrong_secret=' || coalesce(j->>'error', 'none') || '; ';
  j := public.map_listing_address_save(k, '00000000-0000-4000-8000-000000000000', fp, 'x', 'Verifier', null, jsonb_build_object('v', 1), null);
  r := r || 'save_missing_home=found:' || coalesce(j->>'found', 'null') || '; ';

  -- A row the message flow made (no fingerprint): the reply is recorded, the flow's row is not changed.
  insert into public.landlord_outreach (listing_id, channel, status, message, sent_at) values (lid3, 'ff_message', 'sent', 'flow message', now());
  j := public.map_listing_address_save(k, lid3, fp3, 'Reply on a home the message flow contacted', 'Verifier', '+19185550111', jsonb_build_object('v', 1, 'outcome', 'no_address'), null);
  r := r || 'flow_home_save=status:' || coalesce(j->>'status', 'null') || ',written:' || coalesce(j->>'address_written', 'null') || '; ';
  select 'status=' || status || ',message=' || message || ',reply_text=' || coalesce(reply_text, 'null') || ',fp=' || coalesce(reply_fingerprint, 'null') into s from public.landlord_outreach where listing_id = lid3 and channel = 'ff_message' and status not in ('failed', 'cancelled');
  r := r || 'flow_row_after=' || coalesce(s, 'null') || '; ';
  select count(*) into n from public.landlord_replies where listing_id = lid3;
  r := r || 'flow_home_replies=' || n || '; ';

  raise exception using message = 'VERIFY ' || r || ' | ROLLED BACK';
end $$;
