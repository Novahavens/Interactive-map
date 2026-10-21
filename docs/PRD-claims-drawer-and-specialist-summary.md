# PRD — Active Claims Drawer, Claim-scoped Add, and Relocation-Specialist Summary

**Product:** Nova Havens · Property Map (`nova-havens-map.vercel.app`)
**Status:** Draft v1 · 12 Oct 2026
**Owner:** Fazal (Nova Havens) · **Author:** Claude Code session

---

## 1. Background

The Property Map helps a searcher find temporary housing near a family's damaged home and send the best options back on the claim in Monday. Today the map only knows which claim it is working on if it was opened from Monday with `?claimId=`. Opened on its own, the searcher types a loss address by hand, and **Add to claim** is disabled because there is nothing to attach to.

Two things are in the way of improving this:

1. **The repo does not contain the live app.** `main` holds the retired AI Studio prototype (Vite + Lit). The live Next.js app was deployed from a laptop with the Vercel CLI on 29 Sep 2026 and was never committed. Every feature below has to be built on the live code, so it has to be in the repo first.
2. **Pushes to `main` currently build the prototype as production deployments.** `vercel.json`'s `ignoreCommand` was changed on 10 Oct to `test ! -f vite.config.ts`, which means the Vite prototype *is* built (and the Vercel project's framework is set to `vite`). The live alias still points at the 7 Oct CLI deployment, but any promotion or rollback could put the sample-data prototype in front of users. The README's "Git builds are skipped" note is out of date.

This PRD covers fixing both, plus three features.

## 2. Goals

| # | Goal | Why |
|---|---|---|
| G0 | The repo is the source of truth for the live app; `git push` to `main` deploys it. | Prerequisite for everything else; removes the laptop as a single point of failure. |
| G1 | A searcher can pick any active claim from inside the map, without going back to Monday. | Saves a round-trip; lets one searcher work several claims in one sitting. |
| G2 | Properties added with **Add to claim** land as sub-items on *the claim the searcher chose*, with Distance to Loss filled in. | This is the core workflow; it must be unambiguous which claim is being written to. |
| G3 | One tap produces a summary of the chosen options that reaches the relocation specialist who sent the claim. | Replaces the greyed-out "Phase 2" placeholder with the thing it was standing in for. |
| G4 | Local development cannot accidentally write to real Monday boards. | Today the README's only protection is "use the testing group". |

## 3. Non-goals (this PRD)

- Availability calendar, last-used badges, Quo call/text, embedded Monday view (Phase 2 features 2, 3, 5, 6 in `PHASE_TWO_IMPLEMENTATION.md`).
- Editing property data from the map (Monday stays the system of record).
- Multi-user auth / per-searcher identity. The app is used by a small internal team behind a shared link.
- Email delivery of the summary (see §7 F4 — Monday update first; email is a follow-up once the recipient field and provider are confirmed).

## 4. Users

- **Searcher** (Nova Havens staff): opens the map on a phone or laptop, finds options, adds them to a claim. Primary user of F2–F4.
- **Relocation specialist** (external, at the insurer/TPA): sent the claim; receives the summary. Reads it in Monday or email; never uses the map.
- **Developer/maintainer**: needs the repo to build and deploy. User of F0–F1.

## 5. Current state (as found 12 Oct 2026)

- Live app: Next.js 15.5 / React 19 / Tailwind 4, deployed as `dpl_6beu23Uhss23wPB2hEJVWqAkG74r` (source: CLI redeploy). File tree confirmed: `app/` (page, layout, globals.css, 4 API routes), `components/` (MapApp, MapCanvas, PropertyPanel, SearchBox), `lib/` (google, monday, supabase, types, utils, useTheme), `next.config.ts`, `package.json`, `tsconfig.json`, `postcss.config.mjs`.
- `claimId` is read from the URL in `app/page.tsx` and passed to `MapApp` as a prop. There is no in-app way to change it.
- `lib/monday.ts` already wires board IDs (`BOARDS.claim = 9030696652`, `BOARDS.claimSubitems = 9205253360`) and column IDs for loss address, beds, baths, pets, FRV, move-in, adults, children, the sub-item property relation, sub-item status (`SUBITEM_START_STATUS = "To Do"`), and Distance to Loss.
- `PHASE_TWO_IMPLEMENTATION.md` (in repo) already specifies an "Active Claims Drawer" (Feature 1) and an "Email Generator for Relocation Specialist" (Feature 4). This PRD narrows and sequences those; it does not replace that doc.

## 6. Feature F0 — Source recovery and repo truth

**Requirement.** The Next.js source is committed at the repo root; the Vite prototype is moved to `legacy/` (kept for reference, excluded from builds); `vercel.json` is reduced to Next defaults; the Vercel project framework is switched to Next.js; README's status banner is rewritten.

**Acceptance.**
- `npm install && npm run build && npm run typecheck` pass from a clean clone.
- A preview deployment from a branch renders the live map (not the prototype) with the same `.env` keys.
- Byte-for-byte: recovered files match the deployment's file hashes (Vercel exposes `uid` per file).
- No `.env*`, tokens, or `node_modules` committed.

**How.** Vercel keeps the uploaded source of CLI deployments and serves it via `GET /v6/deployments/{id}/files` and `/v8/deployments/{id}/files/{fileId}`. 10 files are already recovered byte-exact (see build plan). The remaining 12 need a REST pull with a read-only Vercel token, or a push of the project folder from the laptop that deployed it. Either path ends in the same commit.

## 7. Features

### F1 — Monday write guard (local safety)

- New env `MONDAY_DRY_RUN`. When `"1"`, `POST /api/claim/add` (and F4's send) build the exact Monday mutation, log it server-side, and return a success shape with a synthetic id prefixed `dry_`. No GraphQL mutation is sent. Reads are unaffected.
- `.env.example` ships with `MONDAY_DRY_RUN=1`. Vercel production/preview env does not set it.
- The UI shows a small "Dry run" chip in the header when the server reports dry-run mode (via a tiny `GET /api/health` or a header on responses) so nobody is confused by sub-items that don't appear in Monday.

### F2 — Active Claims drawer

**Entry point.** A button at the far left of the header (menu icon + badge with the count of active claims). On phones it opens a full-height left sheet; on wider screens a 360px panel over the list. `Esc`/scrim closes. `Cmd/Ctrl+K` toggles (per Phase 2 doc).

**Contents.** Search field (matches name, loss address, item id). List sorted newest first. Each row: claim name, loss address (one line, truncated), needs preview ("2 adults · 1 child · 3 bed · pets"), created date, and a count chip "N options" if sub-items exist. The currently selected claim is marked.

**Selecting a claim.**
1. `claimId` becomes app state (seeded from the URL on load). The URL is updated with `history.replaceState` to `?claimId=…` so refresh and share keep it.
2. The existing claim loader runs (`GET /api/claim/[claimId]`), which already returns loss address + coordinates + needs + attached pins.
3. The search box is filled with the loss address and shows the existing "from claim" badge. The map recentres and re-queries pins at the current radius.
4. Any open property panel closes; "On this claim" pins are replaced by the new claim's attached pins.
5. The drawer closes.

**Definition of "active".** Configurable: `MONDAY_ACTIVE_CLAIM_STATUSES` (comma-separated status labels; default `Awaiting Options`, per the Phase 2 doc) and `MONDAY_ACTIVE_CLAIM_DAYS` (default 30, so a claim that aged out of status still shows if recent). Rows outside the testing group are the default; a "Show test claims" toggle includes the *Claims AI @ Novahavens.com ONLY FOR TESTING* group. **Open:** the exact status column id and label values on board 9030696652 must be confirmed in Monday before this ships.

**API.** `GET /api/claims/active?days=30&q=&includeTest=0` → `{ claims: [{ id, name, lossAddress, lat, lng, needs: {adults, children, bedrooms, bathrooms, pets, frv, moveIn}, createdAt, status, attachedCount, group }], count }`. Server-side cache 60s (Next `unstable_cache` or in-memory per instance) so opening the drawer repeatedly doesn't page Monday each time. Monday pagination handled (`items_page` with cursor).

**Empty/error states.** "No active claims" with a link to the board; Monday error shows the message and a Retry button; loading shows 5 skeleton rows.

### F3 — Claim-scoped Add to claim

- `PropertyPanel` already takes `claimId` and calls `/api/claim/add`. The change is that `claimId` now comes from F2 state, and the panel header shows **"Adding to: {claim name}"** so the searcher can see the target before tapping.
- Guard: the add request carries the `claimId` *captured at tap time*; if the user switches claims while an add is in flight, the response is ignored for the new claim (stale-response check) and the attached set is refetched.
- On success: the pin turns black ("On this claim"), the drawer's "N options" count increments, and a toast reads "Added to {claim name}".
- With no claim selected the button is disabled with the hint "Choose a claim first", and tapping it opens the drawer.

### F4 — Relocation-specialist summary (replaces the "Phase 2" placeholder)

**Trigger.** The greyed-out "Phase 2" button becomes **"Send summary"**, enabled when the selected claim has ≥1 attached option.

**Preview first.** Tapping opens a sheet with the rendered summary and two actions: *Copy* and *Send*. Nothing is sent without the explicit Send tap.

**Summary content (v1).**
- Header: claim name, loss address, family needs (adults/children/bedrooms/bathrooms/pets/FRV/move-in), date, searcher's name if known.
- One block per attached option, sorted by distance: street address, beds/baths, type, pets, monthly rent, deposits & fees, **move-in total**, distance to loss, next availability, listing link, photo folder link, *Open in Monday* link.
- Footer: "Prepared with the Nova Havens Property Map". Owner/landlord phone numbers are **omitted** by default (specialists shouldn't contact owners directly); `?includeContacts=1` can be added later if the team wants it.

**Delivery (v1): Monday update on the claim item**, with the relocation specialist @-mentioned. Rationale: zero new integrations, lands where the team already works, and Monday emails the mentioned user. **Open:** which column on board 9030696652 identifies the specialist (a People column vs. a text/email column). If it is a People column, mention works; if it's an email column, v1 posts the update without a mention and v2 adds email via Resend (`RESEND_API_KEY`), per Phase 2 Feature 4.

**API.** `POST /api/claim/[claimId]/summary` body `{ send: boolean }` → `{ text, html, recipient: {name, email}|null, sentUpdateId?: string }`. `send:false` returns the preview only. Respects `MONDAY_DRY_RUN`.

## 8. Decisions taken (defaults; say if you want them changed)

| Decision | Choice | Alternative |
|---|---|---|
| Local Monday safety | Dry-run flag (F1) | Duplicate sandbox board (realistic but needs Monday admin + data copy) |
| Where the summary goes | Monday update on the claim | Email via Resend (follow-up once recipient field is confirmed) |
| Switching claims | Clears selected property and attached pins | Keep the panel open across claims (confusing — rejected) |
| Active claim rule | Status list + age window, env-configurable | Hard-code one status (brittle) |
| Legacy prototype | Move to `legacy/` | Delete (history keeps it anyway — either is fine) |
| Drawer placement | Left, from a header button (as drawn on the screenshot) | Modal in the centre |

## 9. Open questions (need Fazal / Monday admin)

1. Exact status column id and the label(s) that mean "awaiting options" on the Claim Process Board.
2. Which column holds the relocation specialist (People / email / text)? Is it on the claim item itself?
3. Should owner/landlord contacts be included in the summary?
4. Is there a searcher identity we can stamp on the summary (Monday user via token, or none)?

## 10. Risks

- **Wrong-claim writes.** Mitigated by the "Adding to: …" header, the stale-response guard, and the drawer marking the selected claim.
- **Source drift.** If the laptop copy differs from the 7 Oct deployment, the deployment is treated as canonical (it's what users see).
- **Prototype reaching production.** Addressed by F0 (framework switch + vercel.json). Until then, don't press Promote/Rollback on git-built deployments.
- **Monday rate limits.** Active-claims query is cached 60s; summary generation reads from Supabase (`properties_by_ids`) not Monday, so it's one Monday call per send.

## 11. Acceptance criteria (summary)

- [ ] F0: clean clone builds; preview deploy shows the live map; README banner updated; `legacy/` excluded from build.
- [ ] F1: with `MONDAY_DRY_RUN=1`, Add to claim returns `dry_…`, no sub-item appears in Monday, header shows "Dry run".
- [ ] F2: drawer lists active claims within 2s (cached), search filters live, choosing a claim fills the search box with its loss address and recentres the map; URL carries `?claimId`.
- [ ] F3: Add to claim creates a sub-item on the *selected* claim with Distance to Loss; panel shows the target claim name; button disabled with no claim.
- [ ] F4: Send summary shows a preview; Send posts a Monday update on the claim containing every attached option with move-in totals; dry-run returns the text without posting.
- [ ] Works at 360px width with 16px gutters and no horizontal scroll; light and dark.
