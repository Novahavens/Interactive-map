import type { OutsideHome } from "./types";
import type { PinFilters } from "./status";

// Pure rules for the outside-home pins (homes the search agent found on Zillow / Furnished Finder that are not
// in our database). The DOM lives in components/map/outside-pin.ts, the markers in components/MapCanvas.tsx.

/** The map never draws more outside pins than this (spec §3.1). */
export const OUTSIDE_PIN_CAP = 50;
/** z-index band 400–500: above our own pins (100–300), below attached (900) and groups (1000+). See pinWeight. */
export const OUTSIDE_Z_BASE = 400;

const SOURCE_NAME: Record<string, string> = { zillow: "Zillow", furnished_finder: "Furnished Finder" };

/** "Zillow", "Furnished Finder", or the raw source made readable ("apartments_com" → "Apartments com"). */
export function sourceName(source: string | null | undefined): string {
  const s = (source ?? "").trim();
  if (!s) return "another site";
  const known = SOURCE_NAME[s.toLowerCase()];
  if (known) return known;
  const words = s.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "another site";
}

/** The letter on the ink square: Z, F, else the first letter or digit of the source, else "?". Always one uppercase character. */
export function sourceLetter(source: string | null | undefined): string {
  const s = (source ?? "").trim().toLowerCase();
  if (s === "zillow") return "Z";
  if (s === "furnished_finder") return "F";
  const m = s.match(/[a-z0-9]/);
  return m ? m[0].toUpperCase() : "?";
}

/** Rent on the chip, same format as our own pins: $3.1k, $3k, $950, or — when unknown. */
export function outsideChipText(rent: number | null | undefined): string {
  if (typeof rent !== "number" || !Number.isFinite(rent) || rent <= 0) return "—";
  return rent >= 1000 ? `$${(rent / 1000).toFixed(rent % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(rent)}`;
}

export function hasCoords(h: Pick<OutsideHome, "lat" | "lng">): h is { lat: number; lng: number } {
  return typeof h.lat === "number" && typeof h.lng === "number" && Number.isFinite(h.lat) && Number.isFinite(h.lng);
}

/** How precise the pin is: "area" is drawn dashed with ≈, "approx" (near the house) solid with ≈, "exact" plain. */
export function pinPrecision(h: Pick<OutsideHome, "precision">): "exact" | "approx" | "area" {
  return h.precision === "area" ? "area" : h.precision === "approx" ? "approx" : "exact";
}

/**
 * 0–100, used for ordering and stacking. A scored home is always above an unscored one: scored 50–100
 * (50 + score / 2), unscored 0–49 by the search's rank (rank 1 → 49). Today no outside home has a score.
 */
export function pinWeight(h: Pick<OutsideHome, "score" | "rank">): number {
  if (typeof h.score === "number" && Number.isFinite(h.score)) return 50 + Math.round(Math.min(100, Math.max(0, h.score)) / 2);
  const rank = typeof h.rank === "number" && Number.isFinite(h.rank) ? Math.round(h.rank) : 50;
  return Math.min(49, Math.max(0, 50 - rank));
}

export function outsideZIndex(h: Pick<OutsideHome, "score" | "rank">): number {
  return OUTSIDE_Z_BASE + pinWeight(h);
}

/**
 * Which homes get a pin: they have coordinates, are not on the claim already (the attached layer draws those in
 * black) and are not already drawn as one of our own pins. Best first (scored by score, then unscored by rank), at most `cap`.
 * `capped` says how many pinnable homes were left out, for the "Showing the best 50…" line.
 */
export function pinnableOutside(
  homes: readonly OutsideHome[],
  opts: { drawnPropertyIds?: ReadonlySet<string>; cap?: number } = {},
): { homes: OutsideHome[]; capped: number } {
  const cap = opts.cap ?? OUTSIDE_PIN_CAP;
  const seen = new Set<string>();
  const ok: OutsideHome[] = [];
  for (const h of homes) {
    if (!h || typeof h.listingId !== "string" || seen.has(h.listingId)) continue;
    if (!hasCoords(h)) continue;
    if (h.onClaim) continue;
    if (h.inPropertyDb && h.propertyItemId != null && opts.drawnPropertyIds?.has(String(h.propertyItemId))) continue;
    seen.add(h.listingId);
    ok.push(h);
  }
  // Same order as pinWeight stacks them: scored homes first (by score), then unscored ones by the search's rank.
  ok.sort((a, b) => {
    const sa = typeof a.score === "number" && Number.isFinite(a.score) ? a.score : -Infinity;
    const sb = typeof b.score === "number" && Number.isFinite(b.score) ? b.score : -Infinity;
    return sb === sa ? a.rank - b.rank : sb > sa ? 1 : -1;
  });
  return { homes: ok.slice(0, Math.max(0, cap)), capped: Math.max(0, ok.length - Math.max(0, cap)) };
}

/** The listing sites write pets as free text ("Pets allowed", "No pets", "Cats only"). Null = it does not say. */
export function outsidePetsOk(pets: string | null | undefined): boolean | null {
  const t = (pets ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/\bno\b|\bnot\b|none|n\/a/.test(t)) return false;
  if (/allow|ok|yes|friendly|welcome|cats|dogs|consider|negotiable/.test(t)) return true;
  return null;
}

/** The rail's filters, applied to an outside home the way they apply to ours: a home that fails is dimmed, not removed. */
export function outsidePassesFilters(h: Pick<OutsideHome, "pets" | "photo" | "rent">, f: Pick<PinFilters, "pets" | "photos" | "priced"> | null | undefined): boolean {
  if (!f) return true;
  if (f.pets && outsidePetsOk(h.pets) !== true) return false;
  if (f.photos && !h.photo) return false;
  if (f.priced && h.rent == null) return false;
  return true;
}

/** What a screen reader hears: "905 Larkspur Ln, $3.1k, outside listing from Zillow, match 77, approximate location". */
export function outsidePinLabel(h: Pick<OutsideHome, "title" | "rent" | "source" | "score" | "precision">): string {
  const parts = [(h.title ?? "").trim() || "Outside listing", outsideChipText(h.rent), `outside listing from ${sourceName(h.source)}`];
  if (typeof h.score === "number" && Number.isFinite(h.score)) parts.push(`match ${Math.round(h.score)}`);
  const p = pinPrecision(h);
  if (p === "area") parts.push("area only");
  else if (p === "approx") parts.push("approximate location");
  return parts.join(", ");
}

/** Everything the pin's look depends on. The marker's element is rebuilt only when this changes. */
export function outsideStyleKey(
  h: Pick<OutsideHome, "source" | "rent" | "precision" | "score" | "title">,
  state: { selected: boolean; hovered: boolean; shown: boolean },
): string {
  const score = typeof h.score === "number" ? Math.round(h.score) : "";
  return `outside:${sourceLetter(h.source)}:${state.selected ? 1 : 0}:${state.hovered ? 1 : 0}:${state.shown ? 1 : 0}:${pinPrecision(h)}:${outsideChipText(h.rent)}:${score}:${h.title ?? ""}`;
}
