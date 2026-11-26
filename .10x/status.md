# Status — housing agent on the map

Branch `claude/map-agent`. Plan: six steps; every feature ships switched off.

| # | Step | State |
|---|---|---|
| 1 | Design (spec, mock, screenshots) | Done — see `.10x/specs`, `.10x/decisions` |
| 2 | Foundation (flags, types, migration file, routes, primitives, fixtures) | **Done** — 26 Nov 2026. See `.10x/handoff.md` |
| 3 | Build in parallel (six UI engineers + `MapApp.tsx` wiring) | Next |
| 4 | Verify (typecheck, build, unit, browser tests, security pass) | Not started |
| 5 | Ship (apply migration, README, PR, preview with flags off, merge) | Not started |
| 6 | Switch on (owner turns env flags on) | Not started |

## Foundation: what was checked
- `npm run typecheck`, `npm run test:unit` (103 tests), `npm run build`: pass.
- Flags off: `/api/health` keeps `ok, dryRun, quo, editing` and adds `features` (all false); every new route answers "off" with 200 (add-outside: 503 `feature_off`).
- Flags on against local mocks: every route answers the shapes in `lib/types.ts`; the chat proxy sends the body the workflow expects.
- Migration: run whole inside a transaction on the live database, every function called on real claims, then rolled back. Nothing was committed. **Not applied** — that is step 5.

## Open for later steps
- Step 5: apply `supabase/migrations/20261126_map_agent.sql`, then run `tests/sql/map-agent-rollback.sql`. Update README "API routes" and the env table (not done here).
- Step 6: env needed per feature is listed in `.10x/handoff.md`.
