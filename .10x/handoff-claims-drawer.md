# Handoff — Pillar E: claims drawer (Mine / All, Nearsite tab)

Branch `worktree-agent-a938ab236dcfb9166`, worktree `.claude/worktrees/agent-a938ab236dcfb9166`.

## Exports

### `components/ActiveClaimsDrawer.tsx` (default export, existing props unchanged)
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  onSelect: (claim: ActiveClaim) => void;
  onCount?: (count: number) => void;          // still the count of ALL claims (spec 3.6)
  onSelectNearsite?: (claim: NearsiteClaim) => void; // NEW, optional
}
```
- Reads flags itself with `featuresOn()` (`components/property/health.ts`). Flags: `mine`, `nearsite`.
- Both off: same DOM, copy and classes as before (checked by the browser test), and `/api/claims/nearsite` is never asked.
- `mine`: Mine | All radiogroup in the toolbar, "Test claims" label, name line `Showing N claims for {first name} · Change name`, inline name form (`Your name, as it is on Monday` / `Save`), empty state with `Show all`. Name in `localStorage["nh-reporter-name"]` (shared with Report bad link, `readReporterName()`), scope in `localStorage["nh-claims-scope"]`.
- `nearsite`: tabs `Claims n | Nearsite n`; Nearsite is read (cached) each time the drawer opens, never on page load; Refresh on that tab sends `?fresh=1`. If the route answers `enabled:false`, the tabs row disappears.

### `components/NearsiteList.tsx`
- `default NearsiteList(props: NearsiteListProps)`: `{ onSelectNearsite?, scope?: "mine"|"all", name?, onShowAll?, data?: NearsiteData, selectedId?, searchRef?, className? }`. Without `data` it fetches for itself and shows its own Refresh. Renders `null` when the server says off.
- `useNearsiteClaims(auto = false): NearsiteData` → `{ claims, loading, error, off, reload(fresh?) }`.
- States: loading `Loading Nearsite claims…`, empty `No open Nearsite claims.`, red error box (rows kept after a failed refresh), Mine = mine + free for all, `No open Nearsite claims for {first name}.` + Show all.

### `lib/mine.ts` (pure, tests in `tests/unit/mine.test.mts`)
`ClaimsScope`, `SCOPE_KEY`, `NAME_KEY`, `normalizeName`, `ownerNames`, `nameMatches`, `firstName`, `tidyName`, `initialScope`, `filterByScope`, `showingLine`, `daysLeftChip`, `sortNearsite`, `nearsiteNeeds`, `nearsiteMeta`, `cityState`.

## Wiring for the coordinator (MapApp.tsx)
1. Pass `onSelectNearsite` to `<ActiveClaimsDrawer>`. It must only OPEN the claim (spec Q2: "Pick up" assigns nothing). Per handoff §2, `NearsiteClaim.mondayItemId` is on the Nearsite board, so `/api/claim/[id]` (Claim Process Board) can't load it: centre the map on the claim's own `lat/lng`, use its beds/baths/budget as needs, and use `mondayItemId` as `claimId` for outside/scores/ask. Close the drawer after, like `onSelect`. Without the prop the buttons still show but do nothing.
2. `selectedId` is matched against `mondayItemId` or `id` on Nearsite rows, so pass the open Nearsite claim's `mondayItemId` as `selectedId` to get its check mark.
3. Nothing else: no new state in MapApp, the header count (`onCount`) is unchanged.

## Not done / for others
- The per-claim count line `3 ready · 2 submitted` under each claim (mock, spec 3.5) needs submit-status per claim; it belongs to the submit pillar and is not in this drawer yet.
- `test-results/` is not in `.gitignore`. Tailwind 4 scans every non-ignored file, so writing screenshots there while `next dev` runs triggers recompiles and occasional 500s mid-test. Suggest adding `test-results/` to `.gitignore` (not my file); until then pass a screenshot dir outside the repo: `node tests/browser/claims-drawer.mjs /tmp/shots`.

## Checks
`npm run typecheck` ok · `npm run test:unit` 116/116 · `tests/browser/claims-drawer.mjs` 101/101 (desktop light/dark, 360 px) · `npm run build` ok (`/dev/claims-drawer` prerenders as 404 in production).
