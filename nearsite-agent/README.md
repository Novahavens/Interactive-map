# Nearsite claims agent

Claude Code plugin for Nova Havens' claims pipeline: intake, sourcing (our homes first), landlord outreach, verification calls, a checker gate, two-person Slack approval, then Nearsite or email submission. A LangGraph harness walks each claim and home on a graph and resumes on events (Quo replies, Slack presses, map decisions). **Ships switched off**: every outward step needs three locks plus, for submits, a one-time ticket.

## Private values (never in this repo)

`config/agent-config.json` holds **example** pricing and placeholder people (`pricing._example: true`). The real pricing rules, phone numbers, approvers and Slack ids live in a private overlay, loaded over the committed config by `config.load()`:

- env `NEARSITE_AGENT_CONFIG_LOCAL=/path/to/agent-config.local.json`, or
- `config/agent-config.local.json` (git-ignored).

While `pricing._example` is true the checker refuses every outreach, call and submit ("Pricing rules not loaded"), so the agent can't act on example numbers. Tests and fixtures use fictional claims and homes only.

## Layout

| Path | What |
|---|---|
| `.claude-plugin/plugin.json` | manifest |
| `skills/` | 9 skills: nearsite-orchestrator, claim-intake, home-sourcing, landlord-outreach, verification-call, submission-checker, nearsite-submit, email-submission, approval-and-reporting |
| `agents/` | orchestrator + 8 sub-agents (checker-agent has no write tools) |
| `hooks/hooks.json`, `hooks/live_gate.py` | PreToolUse live gate on `mcp__.*`, Bash and file edits |
| `lib/nearsite_core/` | engine: pricing, scoring, checker, payloads, templates, messages, slack_card, state, tickets, config |
| `scripts/ns.py` | JSON CLI the skills call |
| `scripts/dry_run.py` | offline end-to-end run on fixtures |
| `fixtures/claims.json` | fictional requests 90001-90003 + synthetic landlord answers (no real client data) |
| `tests/` | pytest suite (engine, gate, harness, LangGraph runtime, router; Postgres tests run when `NEARSITE_TEST_PG` is set) |
| `migrations/001_*.sql`, `002_harness_state.sql` | NOT applied (approvals, outreach channels, harness state, inbox read by the map) |
| `extension/` | MV3 messenger bridge, unpublished, selectors unverified |
| `config/agent-config.json` | every live switch `false`; example pricing (see above) |
| `requirements-dev.txt` | pinned Python dependencies |

## Verify

```
pip install -r requirements-dev.txt
python3 -m pytest -q -p no:cacheprovider tests
python3 scripts/dry_run.py --out /tmp/nearsite-dry
bash scripts/verify_all.sh          # everything, including the node tests
```

CI (`.github/workflows/ci.yml`, job *agent*) runs all of it on every pull request, with a throwaway Postgres for the checkpointer tests.

## Live gate

Allowed only when `live.master`, `live.<switch>` and env `NEARSITE_AGENT_LIVE=1` are all set. Nearsite submit / add-property save and email send also consume a one-time ticket from `ns.py issue-ticket` (re-runs the checker; in live mode reads approvals only from `agent_approvals`, keeping a row only when its Slack user matches the configured approver). Always blocked: edits to config/hook/tickets, writes to approvals tables, pressing Send in listing messengers. Decisions log to `~/.nearsite-agent/audit.jsonl`. Fails closed on any error.

The gate is a guardrail inside Claude Code, not a sandbox: it matches tool names and text. Real credentials for Quo, Slack and Nearsite should only be given to the agent's environment when its switch is on.
