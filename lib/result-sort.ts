import type { MatchScore, OutsideHome, Pin } from "./types";

// The order of the results list, for our own homes and outside listings together. Pure (type imports only), so
// it runs under `node --test`. The map and the list both read from the one list this returns.

export type SortMode = "best" | "nearest";

export type ResultItem =
  | { kind: "ours"; pin: Pin; score: MatchScore | null }
  /** `score` is set only when the listing is also a scored home of ours (rare); `home.score` is the search's own. */
  | { kind: "outside"; home: OutsideHome; score: MatchScore | null };

export interface SortInput {
  pins: Pin[];
  outside?: OutsideHome[] | null;
  scores?: MatchScore[] | null;
  mode: SortMode;
  /** Ids of homes of ours that are drawn elsewhere (filtered-out pins, the claim's own options): their outside twin is dropped too. */
  knownPropertyIds?: Iterable<string> | null;
}

export type Strength = "Strong" | "Fair" | "Weak";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Strong 75–100, Fair 50–74, Weak 0–49. */
export function strengthLabel(score: number): Strength {
  return score >= 75 ? "Strong" : score >= 50 ? "Fair" : "Weak";
}

/** "Stretch +$150"; plain "Stretch" when the stretch is not about price (far away). */
export function stretchText(n: number | null | undefined): string {
  return finite(n) && n > 0 ? `Stretch +$${Math.round(n).toLocaleString("en-US")}` : "Stretch";
}

/** Up to this much over the FRV is a stretch when the back end says nothing; more is plainly over (spec, question 3). */
export const STRETCH_LIMIT = 0.1;

/**
 * Is this home a stretch, and by how many dollars a month? `null` = not a stretch, `{ by: null }` = a stretch that
 * is not about price. The matcher's word wins; without it, rent up to 10% above the FRV counts.
 */
export function stretchOf(src: { score?: MatchScore | null; rent?: number | null; frv?: number | null }): { by: number | null } | null {
  if (src.score?.stretch) return { by: finite(src.score.stretchBy) && src.score.stretchBy > 0 ? src.score.stretchBy : null };
  if (src.score) return null;
  const { rent, frv } = src;
  if (finite(rent) && finite(frv) && frv > 0 && rent > frv && rent <= frv * (1 + STRETCH_LIMIT)) return { by: rent - frv };
  return null;
}

/** No coordinates: a list row only, never a pin. */
export function hasPin(home: Pick<OutsideHome, "lat" | "lng">): boolean {
  return finite(home.lat) && finite(home.lng);
}

/** The number a row shows and sorts by: the matcher's score for our homes, the search's score for outside ones. */
export function scoreOf(item: ResultItem): number | null {
  const v = item.score?.score ?? (item.kind === "outside" ? item.home.score : null);
  return finite(v) ? v : null;
}

export function itemId(item: ResultItem): string {
  return item.kind === "ours" ? item.pin.monday_item_id : item.home.listingId;
}

/** The DOM id of a row, as ResultRow and OutsideRow set it. */
export function rowDomId(item: ResultItem): string {
  return item.kind === "ours" ? `row-${item.pin.monday_item_id}` : `row-out-${item.home.listingId}`;
}

// green 0, anything else 1 (neutral, like lib/status.ts asMapStatus), red 2
const tier = (status: unknown): number => (status === "green" ? 0 : status === "red" ? 2 : 1);
const far = (n: number | null | undefined): number => (finite(n) ? n : Number.POSITIVE_INFINITY);
const distanceOf = (item: ResultItem): number => far(item.kind === "ours" ? item.pin.distance_miles : item.home.distanceMiles);
const cmp = (a: number, b: number): number => (a === b ? 0 : a < b ? -1 : 1); // safe with Infinity (a - b gives NaN)

/** Today's rule for our homes: green first, then nearest. */
function byStatusThenNearest(a: Pin, b: Pin): number {
  return tier(a.map_status) - tier(b.map_status) || cmp(far(a.distance_miles), far(b.distance_miles));
}

/**
 * One ordered list of our homes and outside listings.
 *
 * Left out: outside homes that are already one of our pins (`inPropertyDb` and its `propertyItemId` is in `pins`
 * or `knownPropertyIds`), and a listing that appears twice, so nothing is listed twice. Every other outside home
 * the API returns is listed. A home that broke a search rule (`fits: false`) is listed after the homes that fit,
 * and its row says why; a home with no map location is a list row only (see `hasPin`).
 *
 * "nearest": our homes exactly as today (green, then neutral, then red, each nearest first). Outside listings
 * have no colour, so they sit with the neutral homes by distance (ours first on a tie). Then the mapped homes that
 * did not fit, by distance. Listings with no map location come last, fitting ones first, each in the search's rank
 * order: see `noLocationStart` for the divider.
 *
 * "best": 1. everything with a score, highest first, ties nearest first; 2. outside listings without a score, in
 * the search's rank order (the search ranked them for this claim); 3. the rest of our homes, green then nearest;
 * 4. outside homes that did not fit, scored ones first, then by rank. Red (do not use) homes are always last, scored
 * or not. Homes on the claim are not pulled up.
 * With no scores at all and no outside homes this is the same order as "nearest".
 */
export function sortResults({ pins, outside, scores, mode, knownPropertyIds }: SortInput): ResultItem[] {
  const byProperty = new Map<string, MatchScore>();
  for (const s of scores ?? []) if (s && finite(s.score) && !byProperty.has(String(s.propertyId))) byProperty.set(String(s.propertyId), s);

  const ours: ResultItem[] = pins.map((pin) => ({ kind: "ours", pin, score: byProperty.get(String(pin.monday_item_id)) ?? null }));
  const known = new Set<string>(pins.map((p) => String(p.monday_item_id)));
  for (const id of knownPropertyIds ?? []) known.add(String(id));

  const seen = new Set<string>();
  const theirs: Extract<ResultItem, { kind: "outside" }>[] = [];
  for (const home of outside ?? []) {
    if (!home || seen.has(home.listingId)) continue;
    if (home.inPropertyDb && home.propertyItemId != null && known.has(String(home.propertyItemId))) continue;
    seen.add(home.listingId);
    theirs.push({ kind: "outside", home, score: (home.propertyItemId != null && byProperty.get(String(home.propertyItemId))) || null });
  }
  const byRank = (a: (typeof theirs)[number], b: (typeof theirs)[number]) => cmp(far(a.home.rank), far(b.home.rank));
  const oursFirst = (a: ResultItem, b: ResultItem) => (a.kind === b.kind ? 0 : a.kind === "ours" ? -1 : 1);
  // A home that broke a search rule still gets a row, after the ones that fit. `fits` is missing on some rows: those fit.
  const fits = (t: (typeof theirs)[number]) => t.home.fits !== false;
  const fitsItem = (i: ResultItem) => i.kind === "ours" || fits(i);

  if (mode === "nearest") {
    const located = theirs.filter((t) => hasPin(t.home));
    const listOnly = theirs.filter((t) => !hasPin(t.home));
    const rowTier = (i: ResultItem) => (i.kind === "ours" ? tier(i.pin.map_status) : 1);
    const main = [...ours, ...located.filter(fits)].sort((a, b) => rowTier(a) - rowTier(b) || cmp(distanceOf(a), distanceOf(b)) || oursFirst(a, b));
    const mappedNotFit = located.filter((t) => !fits(t)).sort((a, b) => cmp(distanceOf(a), distanceOf(b)) || byRank(a, b));
    // The trailing list-only rows are the "No map location" group: fitting first, then the ones that did not fit.
    return [...main, ...mappedNotFit, ...listOnly.filter(fits).sort(byRank), ...listOnly.filter((t) => !fits(t)).sort(byRank)];
  }

  const red = (i: ResultItem) => i.kind === "ours" && tier(i.pin.map_status) === 2;
  const all: ResultItem[] = [...ours, ...theirs];
  const scored = all
    .filter((i) => !red(i) && fitsItem(i) && scoreOf(i) != null)
    .sort((a, b) => cmp(scoreOf(b)!, scoreOf(a)!) || cmp(distanceOf(a), distanceOf(b)) || oursFirst(a, b));
  const unscoredOutside = theirs.filter((t) => fits(t) && scoreOf(t) == null).sort(byRank);
  const rest = ours.filter((i) => !red(i) && scoreOf(i) == null).sort((a, b) => byStatusThenNearest((a as { pin: Pin }).pin, (b as { pin: Pin }).pin));
  const notFit = theirs
    .filter((t) => !fits(t))
    .sort((a, b) => cmp(scoreOf(b) ?? -1, scoreOf(a) ?? -1) || byRank(a, b));
  const last = ours
    .filter(red)
    .sort((a, b) => cmp(scoreOf(b) ?? -1, scoreOf(a) ?? -1) || cmp(distanceOf(a), distanceOf(b)));
  return [...scored, ...unscoredOutside, ...rest, ...notFit, ...last];
}

/**
 * Where the "No map location (n)" divider goes: the index of the first of the trailing list-only rows, and how
 * many there are. Null in "best" (they sort like any other row there) and when there are none.
 */
export function noLocationStart(items: ResultItem[], mode: SortMode): { index: number; count: number } | null {
  if (mode !== "nearest") return null;
  let index = items.length;
  while (index > 0) {
    const prev = items[index - 1];
    if (prev.kind !== "outside" || hasPin(prev.home)) break;
    index--;
  }
  return index < items.length ? { index, count: items.length - index } : null;
}

/** Best match can be offered only with a claim open and at least one score for a home in the list. */
export function bestMatchAvailable(items: ResultItem[]): boolean {
  return items.some((i) => scoreOf(i) != null);
}

/** What the list really uses: the person's choice, unless Best match has nothing to sort by. */
export function effectiveSort(choice: SortMode, bestAvailable: boolean): SortMode {
  return choice === "best" && bestAvailable ? "best" : "nearest";
}
