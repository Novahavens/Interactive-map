-- NOT APPLIED. Written for review; apply only after the owner's go-ahead.
-- The harness's memory: where every claim and home stands on the graph, why, and what work is open.

create table if not exists public.agent_graph (
  version text primary key,
  graph jsonb not null,               -- graph.export(): nodes, edges, guards' labels, gates
  created_at timestamptz not null default now()
);

create table if not exists public.agent_state (
  claim_id text primary key,          -- '<claim_source>:<claim_ref>', e.g. 'nearsite:90003' or 'monday:1234567890'
                                      -- (the map reads it through map_agent_state in the map's migration)
  stage text not null,
  state jsonb not null,               -- claim, facts, homes (status, facts, history), waiting_on
  graph_version text not null,
  updated_at timestamptz not null default now()
);
create index if not exists agent_state_stage_idx on public.agent_state(stage);

create table if not exists public.agent_work (
  id text primary key,                -- claim:home:kind:seq, so the same work is never queued twice
  claim_id text not null,
  kind text not null check (kind in ('source_homes','parse_reply','send_outreach','send_follow_up','place_call','submit_claim')),
  status text not null check (status in ('queued','held_switch_off','in_progress','done','failed')),
  item jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists agent_work_open_idx on public.agent_work(status) where status <> 'done';

create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  claim_id text,
  home_key text,
  kind text not null,                 -- home_moved, claim_moved, work_queued, work_held_switch_off, ingest_*
  event jsonb not null
);
create index if not exists agent_events_claim_idx on public.agent_events(claim_id, at);

-- What people do in the map (tick or X, Submit, send back) waits here until the runtime
-- resumes that claim. The map writes it only through its map_agent_event() function.
create table if not exists public.agent_inbox (
  id bigint generated always as identity primary key,
  claim_id text not null,
  home_key text,
  type text not null check (type in ('human_pick', 'submit_pressed', 'person_action')),
  payload jsonb not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index if not exists agent_inbox_open_idx on public.agent_inbox(created_at) where processed_at is null;

-- Idempotency: a work item is handed to an agent at most once, even if a step is replayed.
create table if not exists public.agent_outbox (
  key text primary key,
  item jsonb not null,
  at timestamptz not null default now()
);

-- LangGraph's own checkpoint tables (checkpoints, checkpoint_blobs, checkpoint_writes,
-- checkpoint_migrations) are created by PostgresSaver.setup() on first start.

-- Append-only: events are the record of why things happened.
create or replace function public.agent_events_no_change() returns trigger language plpgsql as $$
begin
  raise exception 'agent_events is append-only';
end $$;
drop trigger if exists agent_events_append_only on public.agent_events;
create trigger agent_events_append_only before update or delete on public.agent_events
  for each row execute function public.agent_events_no_change();

alter table public.agent_graph enable row level security;
alter table public.agent_state enable row level security;
alter table public.agent_work enable row level security;
alter table public.agent_events enable row level security;
alter table public.agent_outbox enable row level security;
alter table public.agent_inbox enable row level security;
