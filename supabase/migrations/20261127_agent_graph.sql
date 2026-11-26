-- Claims agent on the map (feature `agentGraph`, off by default): where the agent has a claim on its graph, and a
-- way for the map to tell the agent what a person decided.
--
--   map_agent_state   the agent's projection of one claim (stage, what it waits on, each home's step)
--   map_agent_event   records a person's decision (tick or X a home, press Submit, drop or send back a home)
--                     in agent_inbox; the agent picks it up and moves the claim. Nothing is sent from here.
--
-- Needs the agent's tables (agent_state, agent_inbox) from nearsite-agent/migrations/002_harness_state.sql. Until
-- those exist both functions answer {"ok": false, "error": "agent_not_installed"} and the map shows nothing.
-- Same guard as the other map functions: p_secret must pass listing_edit_key_ok. Additive and re-runnable.
--
-- Rollback:
--   drop function if exists public.map_agent_event(text, text, text, text, jsonb, text);
--   drop function if exists public.map_agent_state(text, text);

create or replace function public.map_agent_state(p_secret text, p_claim_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_key text;
  v_state jsonb;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_claim_item_id is null or p_claim_item_id !~ '^\d{1,20}$' then return jsonb_build_object('ok', false, 'error', 'bad_id'); end if;
  if to_regclass('public.agent_state') is null then return jsonb_build_object('ok', false, 'error', 'agent_not_installed'); end if;
  -- Prefer the Nearsite claim when the item is linked to one; the agent keys claims as '<source>:<ref>'.
  execute $q$
    select s.claim_id, s.state
      from public.map_claim_refs($1, $2) r
      join public.agent_state s on s.claim_id = r.claim_source || ':' || r.claim_ref
     order by (r.claim_source = 'nearsite') desc, s.updated_at desc
     limit 1
  $q$ into v_key, v_state using p_secret, p_claim_item_id;
  if v_key is null then return jsonb_build_object('ok', true, 'claim_key', null, 'state', null); end if;
  return jsonb_build_object('ok', true, 'claim_key', v_key, 'state', v_state);
end;
$$;

revoke all on function public.map_agent_state(text, text) from public;
grant execute on function public.map_agent_state(text, text) to anon, authenticated, service_role;

create or replace function public.map_agent_event(p_secret text, p_claim_item_id text, p_home_key text, p_type text, p_payload jsonb, p_by text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_key text;
begin
  if not public.listing_edit_key_ok(p_secret) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_claim_item_id is null or p_claim_item_id !~ '^\d{1,20}$' then return jsonb_build_object('ok', false, 'error', 'bad_id'); end if;
  if p_type not in ('human_pick', 'submit_pressed', 'person_action') then return jsonb_build_object('ok', false, 'error', 'bad_type'); end if;
  if p_type <> 'submit_pressed' and (p_home_key is null or p_home_key !~ '^[A-Za-z0-9:_-]{1,80}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_home');
  end if;
  if to_regclass('public.agent_inbox') is null then return jsonb_build_object('ok', false, 'error', 'agent_not_installed'); end if;
  execute $q$
    select s.claim_id
      from public.map_claim_refs($1, $2) r
      join public.agent_state s on s.claim_id = r.claim_source || ':' || r.claim_ref
     order by (r.claim_source = 'nearsite') desc, s.updated_at desc
     limit 1
  $q$ into v_key using p_secret, p_claim_item_id;
  if v_key is null then return jsonb_build_object('ok', false, 'error', 'not_running'); end if;
  execute $q$
    insert into public.agent_inbox (claim_id, home_key, type, payload, created_by)
    values ($1, $2, $3, coalesce($4, '{}'::jsonb), left(coalesce($5, 'map'), 60))
  $q$ using v_key, p_home_key, p_type, p_payload, p_by;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.map_agent_event(text, text, text, text, jsonb, text) from public;
grant execute on function public.map_agent_event(text, text, text, text, jsonb, text) to anon, authenticated, service_role;
