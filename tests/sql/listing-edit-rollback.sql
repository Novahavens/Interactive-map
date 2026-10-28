-- Live check of the listing-edit functions against the real database, leaving nothing behind.
-- Paste into the Supabase SQL editor (or run through the connector). It sets a temporary secret, exercises
-- every gate on one real property, then raises an error on purpose so the whole transaction rolls back.
-- The error message is the result: every pair should read as in the comment below.
--
-- Expected (28 Oct 2026): wrong_secret=forbidden; null_secret=forbidden; bad_link=invalid; neg_rent=invalid;
-- not_whitelisted=invalid; no_property=not_found; ok=ok:; second_save=busy; mirror_before_monday=false;
-- mirror_wrong_secret=false; mirror=true rent_delta=123 total_delta=123; mirror_again=false;
-- finish_backwards_kept=applied; anon_read_log=denied; anon_key_ok=denied; anon_read_secret=denied;
-- anon_guard_no_secret=forbidden
-- Afterwards: select count(*) from listing_edit_log → 0; no MAP_EDIT_KEY row added by this script.
--
-- Do not run it once MAP_EDIT_KEY exists in sync_config (the insert would fail on the existing key).
do $$
declare
  r text := '';
  pid text; rent0 numeric; total0 numeric; rent1 numeric; total1 numeric;
  g text; lid bigint; ok boolean; st text; n int;
begin
  select monday_item_id, monthly_rate, move_in_total into pid, rent0, total0
  from public.properties where monthly_rate is not null order by monday_item_id limit 1;
  insert into public.sync_config (key, value) values ('MAP_EDIT_KEY', 'rollback-test-secret');

  g := public.listing_edit_guard('wrong', pid, '1.1.1.1', 'Test', array['monthly_rate'], jsonb_build_object('monthly_rate', rent0 + 1));
  r := r || 'wrong_secret=' || g || '; ';
  g := public.listing_edit_guard(null, pid, '1.1.1.1', 'Test', array['monthly_rate'], jsonb_build_object('monthly_rate', rent0 + 1));
  r := r || 'null_secret=' || g || '; ';
  g := public.listing_edit_guard('rollback-test-secret', pid, '1.1.1.1', 'Test', array['property_link'], '{"property_link":"javascript:alert(1)"}');
  r := r || 'bad_link=' || g || '; ';
  g := public.listing_edit_guard('rollback-test-secret', pid, '1.1.1.1', 'Test', array['monthly_rate'], '{"monthly_rate":-1}');
  r := r || 'neg_rent=' || g || '; ';
  g := public.listing_edit_guard('rollback-test-secret', pid, '1.1.1.1', 'Test', array['owner_phone'], '{"owner_phone":"1"}');
  r := r || 'not_whitelisted=' || g || '; ';
  g := public.listing_edit_guard('rollback-test-secret', '0000', '1.1.1.1', 'Test', array['monthly_rate'], '{"monthly_rate":1}');
  r := r || 'no_property=' || g || '; ';

  g := public.listing_edit_guard('rollback-test-secret', pid, '1.1.1.1', 'Test', array['monthly_rate'], jsonb_build_object('monthly_rate', rent0 + 123));
  r := r || 'ok=' || left(g, 3) || '; ';
  lid := split_part(g, ':', 2)::bigint;

  g := public.listing_edit_guard('rollback-test-secret', pid, '2.2.2.2', 'Other', array['monthly_rate'], jsonb_build_object('monthly_rate', rent0 + 5));
  r := r || 'second_save=' || g || '; ';

  ok := public.listing_edit_mirror('rollback-test-secret', pid, lid);
  r := r || 'mirror_before_monday=' || ok || '; ';
  ok := public.listing_edit_mirror('wrong', pid, lid);
  r := r || 'mirror_wrong_secret=' || ok || '; ';

  perform public.listing_edit_finish('rollback-test-secret', lid, 'monday_ok', jsonb_build_object('monthly_rate', rent0), array['monthly_rate']);
  ok := public.listing_edit_mirror('rollback-test-secret', pid, lid);
  select monthly_rate, move_in_total into rent1, total1 from public.properties where monday_item_id = pid;
  r := r || 'mirror=' || ok || ' rent_delta=' || (rent1 - rent0) || ' total_delta=' || (total1 - total0) || '; ';

  ok := public.listing_edit_mirror('rollback-test-secret', pid, lid);
  r := r || 'mirror_again=' || ok || '; ';

  perform public.listing_edit_finish('rollback-test-secret', lid, 'failed');
  select status into st from public.listing_edit_log where id = lid;
  r := r || 'finish_backwards_kept=' || st || '; ';

  set local role anon;
  begin
    select count(*) into n from public.listing_edit_log;
    r := r || 'anon_read_log=ALLOWED; ';
  exception when others then r := r || 'anon_read_log=denied; ';
  end;
  begin
    perform public.listing_edit_key_ok('rollback-test-secret');
    r := r || 'anon_key_ok=ALLOWED; ';
  exception when others then r := r || 'anon_key_ok=denied; ';
  end;
  begin
    select value into st from public.sync_config where key = 'MAP_EDIT_KEY';
    r := r || 'anon_read_secret=' || coalesce(st, 'no row visible') || '; ';
  exception when others then r := r || 'anon_read_secret=denied; ';
  end;
  g := public.listing_edit_guard(null, pid, '3.3.3.3', 'Anon', array['monthly_rate'], '{"monthly_rate":1}');
  r := r || 'anon_guard_no_secret=' || g || '; ';
  reset role;

  raise exception 'ROLLBACK-TEST %', r;
end $$;
