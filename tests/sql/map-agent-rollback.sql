-- Live check of the housing-agent functions (supabase/migrations/20261126_map_agent.sql) against the real
-- database, leaving nothing behind. Run it through the Supabase SQL editor or the connector. It reads the
-- server secret from sync_config inside the block (never printed), exercises every function on real claims,
-- then raises an error on purpose so the whole transaction rolls back. The error message is the result.
--
-- Before the migration is applied, run it as one statement batch:  begin; <the migration file>; <this file>; rollback;
-- After it is applied, run this file alone. Either way, check afterwards that nothing stayed:
--   select count(*) from public.map_phone_lookups;            -- same as before (0 before go-live)
-- and, when it was run before applying:
--   select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--      and proname ~ '^map_(claim|outside|submit|nearsite|outreach|phone)';   -- 0
--
-- Expected (26 Nov 2026; the counts move with the data, the words must not):
--   key_present=true; wrong_secret=forbidden; homes>0 with fits first (first_fits=true first_rank=1);
--   limit3=3; unknown_claim has search_id null and n=0; ctx has known=true and a board_id;
--   ctx_unknown has known=false; scores_typed src=typed; scores_ns src=nearsite; scores_none source null;
--   submit states only from todo|ready|submitted|blocked; nearsite>0; outreach ok=true;
--   guard_wrong=forbidden; get_empty lookup null; guard=ok; save=true rows=1 with state found and the phone as
--   +15550100199; save_none=true rows=2 state=not_found; save_wrong=false; guard_20th=ok; guard_21st=ip_limit;
--   other_ip=ok; anon_read_log=denied; anon_no_secret=forbidden; anon_refs_no_secret=0;
--   anon_guard_no_secret=forbidden
--   Measured the same day: outside_ms about 9 warm (63 homes), about 500 on a cold cache; 46 for a 182-home run.
do $$
declare
  k text := (select value from public.sync_config where key = 'MAP_EDIT_KEY');
  r text := ''; j jsonb; g text; lid uuid; pid text; ok boolean; n int; n0 int; i int;
  ns_item text; typed_item text; t0 timestamptz;
begin
  r := r || 'key_present=' || (k is not null) || '; ';

  -- One Nearsite claim that has a search with results, and one Claim Process Board claim with typed matches.
  select nc.monday_item_id into ns_item
    from public.search_runs sr
    join public.search_versions v on v.id = sr.version_id
    join public.searches s on s.id = v.search_id and s.claim_source = 'nearsite'
    join public.nearsite_claims nc on nc.nearsite_claim_id = s.claim_ref
   where sr.found > 3 and nc.monday_item_id is not null
   order by sr.created_at desc limit 1;
  select claim_ref into typed_item from public.typed_matches order by updated_at desc nulls last limit 1;

  j := public.map_outside_homes('wrong', ns_item);
  r := r || 'wrong_secret=' || coalesce(j->>'error', 'ALLOWED') || '; ';
  j := public.map_outside_homes(k, ns_item, 80);
  t0 := clock_timestamp();
  j := public.map_outside_homes(k, ns_item, 80);
  r := r || 'outside_ms=' || round(extract(epoch from (clock_timestamp() - t0)) * 1000, 1)
        || ' homes=' || jsonb_array_length(j->'homes') || ' src=' || coalesce(j->>'claim_source', '-') || ' v=' || coalesce(j->>'version_no', 'null')
        || ' fits=' || (select count(*) from jsonb_array_elements(j->'homes') h where (h->>'fits')::boolean)
        || ' with_ll=' || (select count(*) from jsonb_array_elements(j->'homes') h where h->>'lat' is not null)
        || ' prec=' || coalesce((select jsonb_agg(distinct h->'precision') from jsonb_array_elements(j->'homes') h)::text, '-')
        || ' on_claim=' || (select count(*) from jsonb_array_elements(j->'homes') h where (h->>'on_claim')::boolean)
        || ' first_fits=' || coalesce(j->'homes'->0->>'fits', '-') || ' first_rank=' || coalesce(j->'homes'->0->>'rank', '-')
        || ' keys=' || coalesce((select string_agg(kk, ',') from jsonb_object_keys(j->'homes'->0) kk), '-') || '; ';
  lid := (j->'homes'->0->>'listing_id')::uuid;
  j := public.map_outside_homes(k, ns_item, 3);
  r := r || 'limit3=' || jsonb_array_length(j->'homes') || '; ';
  j := public.map_outside_homes(k, '1');
  r := r || 'unknown_claim=' || (j - 'homes')::text || ' n=' || jsonb_array_length(j->'homes') || '; ';

  j := public.map_claim_context(k, ns_item, lid);
  r := r || 'ctx=' || ((j - 'search_id') #- '{listing,title}')::text || '; ';
  j := public.map_claim_context(k, '1');
  r := r || 'ctx_unknown=' || j::text || '; ';

  j := public.map_claim_scores(k, typed_item);
  r := r || 'scores_typed=' || jsonb_array_length(j->'scores') || ' src=' || coalesce(j->>'source', 'null') || '; ';
  j := public.map_claim_scores(k, ns_item);
  r := r || 'scores_ns=' || jsonb_array_length(j->'scores') || ' src=' || coalesce(j->>'source', 'null') || '; ';
  j := public.map_claim_scores(k, '1');
  r := r || 'scores_none=' || j::text || '; ';

  j := public.map_submit_status(k, (select claim_item_id from public.submission_approvals order by updated_at desc nulls last limit 1));
  r := r || 'submit=' || jsonb_array_length(j->'options') || ' counts=' || (j->'counts')::text
        || ' states=' || coalesce((select jsonb_agg(distinct o->'state') from jsonb_array_elements(j->'options') o)::text, '-') || '; ';

  j := public.map_nearsite_claims(k, 200);
  r := r || 'nearsite=' || jsonb_array_length(j->'claims')
        || ' days=' || coalesce((select min((c->>'days_left')::int) || '..' || max((c->>'days_left')::int) from jsonb_array_elements(j->'claims') c), '-')
        || ' keys=' || coalesce((select string_agg(kk, ',') from jsonb_object_keys(j->'claims'->0) kk), '-') || '; ';

  select property_item_id into pid from public.external_listings where property_item_id is not null order by id limit 1;
  j := public.map_outreach_status(k, pid);
  r := r || 'outreach=' || (j - 'outreach')::text || '; ';

  -- Phone lookups, from an address nobody uses (TEST-NET-3), so earlier real lookups don't change the counts.
  select count(*) into n0 from public.map_phone_lookups;
  pid := '999999999999';
  g := public.map_phone_lookup_guard('wrong', pid, '203.0.113.250', 'Test');
  r := r || 'guard_wrong=' || g || '; ';
  j := public.map_phone_lookup_get(k, pid);
  r := r || 'get_empty=' || j::text || '; ';
  g := public.map_phone_lookup_guard(k, pid, '203.0.113.250', 'Test');
  r := r || 'guard=' || g || '; ';
  ok := public.map_phone_lookup_save(k, pid, null, '+1 (555) 010-0199', 'test', 'high', 'Test', '203.0.113.250');
  select count(*) - n0 into n from public.map_phone_lookups;
  j := public.map_phone_lookup_get(k, pid);
  r := r || 'save=' || ok || ' rows=' || n || ' get=' || ((j->'lookup') - 'looked_up_at')::text || '; ';
  ok := public.map_phone_lookup_save(k, pid, null, 'n/a', null, 'high', 'Test', '203.0.113.250');
  select count(*) - n0 into n from public.map_phone_lookups;
  j := public.map_phone_lookup_get(k, pid);
  r := r || 'save_none=' || ok || ' rows=' || n || ' state=' || (j->'lookup'->>'state') || '; ';
  ok := public.map_phone_lookup_save('wrong', pid, null, '5550100199', 'x', 'high', 'Test', '203.0.113.250');
  r := r || 'save_wrong=' || ok || '; ';
  for i in 1..18 loop g := public.map_phone_lookup_guard(k, pid, '203.0.113.250', 'Test'); end loop;
  r := r || 'guard_20th=' || g || '; ';
  g := public.map_phone_lookup_guard(k, pid, '203.0.113.250', 'Test');
  r := r || 'guard_21st=' || g || '; ';
  g := public.map_phone_lookup_guard(k, pid, '203.0.113.251', 'Test');
  r := r || 'other_ip=' || g || '; ';

  set local role anon;
  begin
    select count(*) into n from public.map_phone_lookups;
    r := r || 'anon_read_log=ALLOWED; ';
  exception when others then r := r || 'anon_read_log=denied; ';
  end;
  j := public.map_nearsite_claims(null, 5);
  r := r || 'anon_no_secret=' || coalesce(j->>'error', 'ALLOWED') || '; ';
  select count(*) into n from public.map_claim_refs(null, ns_item);
  r := r || 'anon_refs_no_secret=' || n || '; ';
  g := public.map_phone_lookup_guard(null, pid, '203.0.113.252', 'Anon');
  r := r || 'anon_guard_no_secret=' || g || '; ';
  reset role;

  raise exception 'ROLLBACK-TEST %', r;
end $$;
