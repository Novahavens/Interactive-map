# Handoff — pillar B, list-score (Best match sort, outside rows, score display)

Flags read: `outside` (outside rows) and `bestMatch` (scores, toggle). None of these components fetch or read flags themselves: the coordinator passes data in only when the flag is on. With both flags off, pass `outside: null, scores: null` and keep today's caption, and the list is exactly today's (unit and browser tests check this).

## Exports

### `lib/result-sort.ts` (pure, unit tested in `tests/unit/result-sort.test.mts`)
- `type SortMode = "best" | "nearest"`
- `type ResultItem = { kind: "ours"; pin: Pin; score: MatchScore | null } | { kind: "outside"; home: OutsideHome; score: MatchScore | null }`
- `sortResults({ pins, outside?, scores?, mode, knownPropertyIds? }): ResultItem[]`
  - nearest = today's rule (green, neutral, red; each nearest first). Outside homes sit with the neutral ones by distance; homes with no coordinates go last, in rank order.
  - best = scored rows highest first (ties by distance, ours first), then unscored outside homes by rank, then the rest of ours in today's order; red always last.
  - Leaves out `fits:false` homes, duplicate listing ids, and outside homes whose `propertyItemId` is one of `pins` or `knownPropertyIds` (pass attached ids / filtered-out ids here so nothing is drawn twice).
- `noLocationStart(items, mode) → { index, count } | null` (where to put `<NoLocationDivider>`; null in best)
- `bestMatchAvailable(items)`, `effectiveSort(choice, bestAvailable)`
- `strengthLabel(n)`, `stretchText(by)`, `stretchOf({ score?, rent?, frv? })` (matcher's word wins; else rent ≤ 10% over FRV), `hasPin(home)`, `scoreOf(item)`, `itemId(item)`, `rowDomId(item)` (`row-<id>` / `row-out-<listingId>`), `STRETCH_LIMIT = 0.1`

### `lib/chips.ts` (existing order of `chipsFor` unchanged)
- `Chip.line?: boolean` (new, optional)
- `scoreChip(score)`, `stretchChip(by)`, `outsideChips(home, { score?, stretch? })`, `sourceLabel(source)`, `sourceLetter(source)`, `NO_MAP_LOCATION`

### Components
- `SortToggle` (default) — `{ value: SortMode; onChange(mode): void; bestAvailable: boolean; loading?: boolean; countLabel?: string; claimOpen?: boolean (default true); error?: boolean; onRetry?(): void; className?: string }`. Renders the count + toggle row and the hint line (`Scoring homes for this claim…`, `Pick a claim to sort by best match.`, `Couldn't score these homes. Showing nearest first.` + Try again, `No match scores for this claim yet. Showing nearest first.`). Also exports `readSortChoice()` / `saveSortChoice(mode)` (`localStorage["nh-sort"]`, try/catch).
- `OutsideRow` (default, memo) — `{ home: OutsideHome; score?: MatchScore | null; selected: boolean; hovered: boolean; frv?: number | null; why?: string | null; onSelect(id): void; onHover(id | null, from?): void }`. Button id `row-out-<listingId>`; list-only rows never call `onHover`. Also exports `NoLocationDivider({ count })` (an `<li>`).
- `MatchScore` (default) — `{ score: MatchScore | null; loading?: boolean; className?: string }`. Nothing when no score and not loading.
- `ResultRow` — new optional prop `score?: MatchScore | null` (leading `Match 82 · Strong` chip, `Stretch +$N` last). Nothing else changed.

## Wiring the coordinator must do
1. **MapApp**: replace `sortedPins` with
   `const items = useMemo(() => sortResults({ pins: visiblePins, outside: features.outside && !outsideHidden ? outside?.homes : null, scores: features.bestMatch ? scores : null, mode, knownPropertyIds: attachedIds }), …)`,
   where `const bestAvailable = bestMatchAvailable(sortResults({ …same, mode: "nearest" }))` and `mode = effectiveSort(choice, bestAvailable)`; `choice` starts at `readSortChoice()` (read in an effect), and `onChange` calls `saveSortChoice`.
2. **resultRows**: map `items`; `kind === "ours"` → `<ResultRow … score={item.score} />`, `kind === "outside"` → `<OutsideRow home score frv={needs/claim FRV} why={top three outside rows only: item.score?.why} …/>`. Insert `<NoLocationDivider count>` at `noLocationStart(items, mode)?.index`. See `app/dev/list-score/page.tsx` `LiveList` for a working copy.
3. **Count row**: replace the `green first, then nearest` span with `<SortToggle value={choice} onChange bestAvailable loading={scoresLoading} claimOpen={!!claimId} error={scoresError} onRetry={refetchScores} countLabel={countLabel} />` when `features.bestMatch`; else keep today's markup. `countLabel` gains `· N outside`.
4. **Spec rule not in the components**: while scores load, keep Nearest; when they land, switch only if the list has not been scrolled (MapApp owns the list scroll).
5. **onSelect / onHover** receive a listing uuid for outside rows; MapApp must tell them apart from Monday ids (e.g. `UUID_RE`) to open `OutsidePanel` and to hover the outside pin.
6. **PropertyPanel**: `<MatchScore score={scoreFor(propertyId)} loading={scoresLoading} />` as first child of "Fit against this claim".
7. **StatusChips.tsx / globals.css** (not mine): add `nh-chip--line` when `c.line`. OutsideRow draws its own chips with Tailwind (`!border-line2 !text-ink`) so it works without that class.

## Unfinished / notes
- `OutsideHome.score` is null for every home today, so outside rows sort by rank after the scored rows in Best match. Shared `MatchScore` type has no `band` field; the band comes from `strengthLabel(score)`.
- The `why` line for outside homes has no source in the contract (only our homes' `MatchScore.why`); the preview uses fictional text.
