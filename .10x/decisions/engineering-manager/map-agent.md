# Delivery — map-agent (26 Nov 2026)

| Step | What | Owner | Status |
|---|---|---|---|
| 1 | Design: spec + mock | design agent | Done |
| 2 | Foundation: types, switches, routes, migration file, shadcn parts, fixtures | foundation agent | In progress |
| 3 | Build, in parallel: (a) map layer + key (b) list, sort, score (c) chat bubble + voice (d) add outside + submit status (e) claims drawer (f) Find phone + templates; MapApp wiring by the orchestrator | six builders | Waiting on 2 |
| 4 | Verify: typecheck, build, unit + browser tests, security pass | QA agent | Pending |
| 5 | Ship: apply migration, README, PR, preview, merge, production check | DevOps agent | Pending |
| 6 | Hand over the switch list | orchestrator | Pending |

## Rules
- One hand on `components/MapApp.tsx`.
- Each agent loops until its checks pass, then writes a handover and appends to `.10x/learnings.md`.
- Every feature off by default.

## Risks
- Public repo: a push may be refused; stop and report.
- Voice may be blocked inside the Monday iframe.
- Chat covers most of the map on small laptops with the panel open.
