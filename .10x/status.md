# Status — housing agent on the map

Merged to `main` in PR #26 on 26 Nov 2026 (`c23be26`). Every feature ships switched off.

| # | Step | State |
|---|---|---|
| 1 | Design (spec, mock, screenshots) | Done — see `.10x/specs`, `.10x/decisions` |
| 2 | Foundation (flags, types, migration file, routes, primitives, fixtures) | Done — 26 Nov 2026. See `.10x/handoff.md` |
| 3 | Build in parallel (six UI engineers + `MapApp.tsx` wiring) | Done — 26 Nov 2026 |
| 4 | Verify (typecheck, build, unit, browser tests, security pass) | Done — 26 Nov 2026 |
| 5 | Ship (apply migration, README, PR, preview with flags off, merge) | Done — 26 Nov 2026 |
| 6 | Switch on (owner turns env flags on) | **Not started** — owner's call |

## Checked on `main` after the merge (26 Nov 2026)
- Production deploy of `c23be26`: READY. `/api/health` answers `ok`, every `features` value false. Feature routes answer "off" (e.g. `/api/claims/nearsite` → `{ enabled:false, claims:[] }`). Existing routes unchanged (`/api/claims/active` returns the live claims). `/dev/*` pages answer 404 in production.
- `npm run typecheck`, `npm run test:unit` (198 tests), `npm run build`: pass.
- Browser suites against `next dev` with `MAP_FEATURES=all`, routes mocked from the fixtures: agent-chat 131, claims-drawer 101, contacts 84, list-score 87, map-layer 87, outside-panel 95 checks, all pass.
- Migration `20261126_map_agent.sql` is applied (all `map_*` functions present). `tests/sql/map-agent-rollback.sql` run against the live database: every expected answer, rolled back, `map_phone_lookups` still 0 rows.

## Not tested yet
- The agent end to end with real calls (chat, add outside, find phone): needs `MAP_CHAT_URL`/`MAP_CHAT_TOKEN`/`MAP_PHONE_URL` set, which is step 6. Try on a Preview first.

## Step 6: switching on
Env needed per feature is in the README ("Housing agent on the map") and `.10x/handoff.md`.
