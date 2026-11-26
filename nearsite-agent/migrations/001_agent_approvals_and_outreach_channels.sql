-- NOT APPLIED. Written for review; apply only after the owner's go-ahead.
-- Project: nmandvqfuwvqxeabptjd (Interactive Map database)
--
-- Reuses what the map and the Nearsite workflows already have, instead of new copies:
--   claims        search_claims (Claim Process Board) + nearsite_claims, joined by map_claim_refs()
--   homes         claim_options (sub-items), external_listings (outside homes)
--   scores        typed_matches / nearsite_matches (what the map's Best match shows)
--   outreach      landlord_outreach (what the map's outreach line shows)
--   submit state  submission_approvals (what the map's submit status shows)
-- New here: the two-person Slack approvals, and the outreach channels the agent adds.
--
-- Rollback:
--   drop table if exists public.agent_approvals;
--   alter table public.landlord_outreach drop constraint landlord_outreach_channel_check,
--     add constraint landlord_outreach_channel_check check (channel = 'ff_message');
--   alter table public.landlord_outreach drop constraint landlord_outreach_status_check,
--     add constraint landlord_outreach_status_check check (status = any (array['queued','sending','sent','replied','address_found','no_answer','failed','cancelled']));

-- 1. Slack approval presses for Nearsite batches. Written ONLY by the Slack button handler.
--    When William and Lou have both approved a batch, the harness writes one submission_approvals
--    row per option (state 'approved'), so the map's submit status shows it with no new UI.
create table if not exists public.agent_approvals (
  id bigint generated always as identity primary key,
  batch_id text not null,
  person text not null check (person in ('william','lou')),
  action text not null check (action in ('approve','hold','reject')),
  slack_user text not null,
  pressed_at timestamptz not null default now()
);
create index if not exists agent_approvals_batch_idx on public.agent_approvals(batch_id, pressed_at);
alter table public.agent_approvals enable row level security;

-- 2. landlord_outreach takes the agent's channels (Sona text and call, the map's in-app message)
--    and an opted_out status, so a STOP is kept on the record the map already reads.
alter table public.landlord_outreach drop constraint if exists landlord_outreach_channel_check;
alter table public.landlord_outreach add constraint landlord_outreach_channel_check
  check (channel = any (array['ff_message', 'sona_text', 'sona_call', 'in_app']));
alter table public.landlord_outreach drop constraint if exists landlord_outreach_status_check;
alter table public.landlord_outreach add constraint landlord_outreach_status_check
  check (status = any (array['queued', 'sending', 'sent', 'replied', 'address_found', 'no_answer', 'failed', 'cancelled', 'opted_out']));
