# Build plan — repo truth + claims drawer + specialist summary

> **Historical (12 Oct 2026).** Every phase here is done. For what exists now see the README; for requirements see PRD v4 (Google Doc), §14 and §15.

Companion to `docs/PRD-claims-drawer-and-specialist-summary.md`. Phases are sequential; steps inside a phase can run in parallel where noted. Branch: `ccr-b5ed9a81-8g65uc` → draft PR #5.

## Phase 0 — Recover the live source (blocking)

Goal: every file of production deployment `dpl_6beu23Uhss23wPB2hEJVWqAkG74r` (team `team_YEcPHHbzFoa1DSSKBbNDiyEk`) committed at the repo root, byte-exact.

Status (12 Oct): **✅ done — all 24 source files recovered via REST, every blob hash verified.**

| File | Status |
|---|---|
| package.json, next.config.ts, tsconfig.json, postcss.config.mjs, .gitignore, .env.example | ✅ complete |
| app/page.tsx, lib/google.ts, lib/supabase.ts, lib/utils.ts, lib/useTheme.ts | ✅ complete |
| app/layout.tsx, app/globals.css, components/{MapApp,MapCanvas,PropertyPanel,SearchBox}.tsx, lib/monday.ts, lib/types.ts | ⏳ truncated — need REST pull |
| app/api/properties/route.ts, app/api/properties/[id]/route.ts, app/api/claim/[claimId]/route.ts, app/api/claim/add/route.ts | ⏳ not listable — need REST pull |

Two ways to finish, either is fine:

**A. Read-only Vercel token in the cloud environment (lets this session finish it).**
Create a token at vercel.com → Account → Tokens, scoped to the *Nova Havens* team, read-only is enough. Add it to this session's cloud environment (title bar → environment menu → Edit → *Network secrets*, or as an environment variable) named `VERCEL_TOKEN`. A new session picks it up and runs:

```bash
D=dpl_6beu23Uhss23wPB2hEJVWqAkG74r; T=team_YEcPHHbzFoa1DSSKBbNDiyEk
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v6/deployments/$D/files?teamId=$T" > files.json
# walk the tree; for each file uid:
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v8/deployments/$D/files/$UID?teamId=$T" | jq -r .data | base64 -d > path/to/file
```

**B. Push from the laptop that deployed it.**
From the Next.js project folder: `git clone` this repo, copy the folder contents (not `node_modules`, `.next`, `.env*`, `.vercel`) to the repo root on branch `ccr-b5ed9a81-8g65uc`, commit, push. I then diff against the recovered 10 files and the deployment hashes.

Verification: `sha1sum` of each recovered file matches the `uid` Vercel reports (they are git-style blob hashes); `npm run build` passes.

## Phase 1 — Repo truth (after Phase 0)

1. `git mv` the prototype into `legacy/` (index.html, index.tsx, index.css, *.ts at root, metadata.json, vite.config.ts, example_style.ts, json_schema.ts, taxonomy.ts, playground.ts, validator.ts). Add `legacy/README.md` (two lines: what it is, that it's retired).
2. Root `package.json`, `tsconfig.json`, `.gitignore` replaced with the Next.js ones. Keep `supabase/` where it is.
3. `vercel.json` → `{ "$schema": "https://openapi.vercel.sh/vercel.json" }` (Next is auto-detected; no `outputDirectory`, no `ignoreCommand`).
4. Vercel project setting *Framework Preset* `vite` → `nextjs` (dashboard, or `update_project` — outward-facing, do with Fazal watching).
5. README: replace the status banner with "Source is in this repo as of <date>; deploys from `main`"; keep the *Legacy prototype* section pointing at `legacy/`.
6. `npm install && npm run build && npm run typecheck`. Commit as "Bring live Next.js app into the repo; retire prototype".
7. Push → preview deployment. Open it: map renders, search works, claim URL works (read-only check; no adds).

## Phase 2 — Local safety (F1) ✅

- `lib/monday.ts`: add `export const DRY_RUN = process.env.MONDAY_DRY_RUN === "1"`; in the mutation helper, if `DRY_RUN`, `console.info("[monday dry-run]", query, variables)` and return a synthetic result.
- `app/api/claim/add/route.ts`: nothing to change if it goes through the helper; otherwise branch there. Return `{ subitemId: "dry_<timestamp>", dryRun: true }`.
- `app/api/health/route.ts`: `{ ok: true, dryRun: boolean }`. `MapApp` fetches once on mount and shows a "Dry run" chip.
- `.env.example`: `MONDAY_DRY_RUN=1` with a comment.
- Test: `curl -X POST localhost:3000/api/claim/add -d '{...}'` with dry-run on → `dry_`; log shows the payload.

## Phase 3 — Active claims (F2 + F3) ✅

Shipped with these deviations, confirmed against board 9030696652 on 12 Oct:
- "Active" is **group-based**, not status-based: the board has no "Awaiting Options" label; claims needing options live in the *New Housing Request* (`topics`) and *New Option Needed* (`group_mkvngrgz`) groups. Configurable via `MONDAY_ACTIVE_CLAIM_GROUPS`; the age window (`MONDAY_ACTIVE_CLAIM_DAYS`) was dropped as redundant.
- UI built with shadcn/ui (Sheet + Command/cmdk), themed through the existing tokens in `globals.css`.

Parallel-safe once Phase 1 is in:

**3a. API** `app/api/claims/active/route.ts`
- Query board `BOARDS.claim` with `items_page(limit: 100, query_params: { rules: [{column_id: <status col>, compare_value: [...labels]}] })`, follow `cursor`. Pull name, group, created_at, the needs columns from `COLS`, the loss address column (location → address, lat, lng), and `subitems { id }` for the count.
- Filter by `MONDAY_ACTIVE_CLAIM_DAYS`; exclude the testing group unless `includeTest=1`.
- Cache 60s. Return the shape in PRD §7 F2.
- Add `ActiveClaim` to `lib/types.ts`.

**3b. UI** `components/ActiveClaimsDrawer.tsx`
- Props: `open, onClose, selectedId, onSelect(claim)`. Fetches `/api/claims/active` on open (and on a Refresh button). Search filters client-side.
- Mobile: fixed inset-y-0 left-0 w-full sm:w-[360px]; focus trap; `Esc` closes; scrim.
- Row: name · loss address · needs preview · created · "N options" chip · selected mark.
- Styling from `globals.css` tokens (`--surface`, `--line`, `--ink`, `--muted`); Geist; same chip look as the filter chips.

**3c. Wiring** in `MapApp.tsx`
- `const [claimId, setClaimId] = useState(initialClaimId)`; effect: when `claimId` changes → `history.replaceState` URL, clear `selected`, refetch claim (`/api/claim/[id]`), set center from claim loss, set search box text to loss address (SearchBox gains a controlled `value`/`badge` prop if it doesn't already).
- Header: left button with count badge; `Cmd/Ctrl+K` handler.
- `PropertyPanel`: new prop `claimName`; header line "Adding to: {claimName}"; stale-response guard around the add call; disabled state copy.

**3d. Tests/checks**
- Typecheck; manual run with dry-run on: pick claim A, add property → payload has A's id; pick claim B mid-flight → attached set refetched for B, no cross-write.
- 360px width: no horizontal scroll; drawer covers the list, not the header.

## Phase 4 — Specialist summary (F4) ✅

Shipped with these decisions (Fazal, 12 Oct):
- Specialists are external (claim column *Relocation Specialist* links a contacts board; *Specialist Email* mirrors their address), so a Monday @mention can't reach them. Delivery is the **searcher's own email**: the sheet copies the formatted summary, opens a `mailto:` to the specialist with the subject filled, and logs the summary as a Monday update on the claim (honours `MONDAY_DRY_RUN`).
- Owner/landlord contacts are omitted. "Open in Monday" links are omitted from the email (specialists can't open Monday).
- Button lives in the claim block of the rail ("Send summary (N options)"); the per-option Phase 2 placeholders in the property panel are untouched.

1. `lib/summary.ts`: `buildSummary(claim, options[]) → { text, html }` (pure; unit-testable).
2. `app/api/claim/[claimId]/summary/route.ts`: loads claim (Monday) + attached option ids → `properties_by_ids` + `property_detail` (Supabase) → `buildSummary`. If `send`: `create_update(item_id: claimId, body: html)`; if a People column identifies the specialist, prefix an `@mention`. Honour `DRY_RUN`.
3. `components/SummarySheet.tsx`: preview, Copy, Send; success/error states.
4. Replace the "Phase 2" button with "Send summary" (disabled until ≥1 attached).
5. Check: dry-run returns text; real send posts one update; summary has every attached option with move-in totals.

## Phase 5 — Ship

- One PR, commits per phase. PR body lists env vars added (`MONDAY_DRY_RUN`, `MONDAY_ACTIVE_CLAIM_STATUSES`, `MONDAY_ACTIVE_CLAIM_DAYS`) and the Vercel setting change.
- Before merge: preview deployment walked through on a phone; Fazal confirms open questions §9.
- After merge: production deploy from `main`; confirm the live alias moved to the git build; delete the stale CLI deployment only after that.

## Env vars (final list)

| Var | Where | Purpose |
|---|---|---|
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID | all | existing |
| SUPABASE_URL, SUPABASE_KEY, MONDAY_API_TOKEN | all | existing |
| MONDAY_*_BOARD_ID | all | existing |
| MONDAY_DRY_RUN | local only | F1 |
| MONDAY_ACTIVE_CLAIM_STATUSES, MONDAY_ACTIVE_CLAIM_DAYS | all | F2 |
| RESEND_API_KEY | later | email delivery (v2) |
