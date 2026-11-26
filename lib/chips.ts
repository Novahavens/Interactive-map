import type { ClaimOption, OutsideHome, Pin, PropertyDetail } from "./types";
import { BAD_LINK } from "./types";
import { hasPin, strengthLabel, stretchText } from "./result-sort";
import { dayMonth } from "./utils";

export type ChipTone = "ok" | "info" | "muted" | "bad" | "amber";

export interface Chip {
  key: string;
  label: string;
  tone: ChipTone;
  /** Red outline instead of plain red text (Bad link). */
  outline?: boolean;
  strike?: boolean;
  /** Ink text in a thin outline (the source of an outside listing). */
  line?: boolean;
  title?: string;
}

export interface ChipSource {
  availability?: string | null;
  link_status?: string | null;
  last_contact?: string | null;
  other_claims?: ClaimOption[] | null;
}

const AVAILABILITY_CHIP: Record<string, Omit<Chip, "key">> = {
  "available now": { label: "Available now", tone: "ok" },
  "available soon": { label: "Available soon", tone: "info" },
  "available (unverified)": { label: "Unverified", tone: "muted", title: "Listed as available, not confirmed by the availability check" },
  unavailable: { label: "Unavailable", tone: "bad" },
  "listing removed": { label: "Listing removed", tone: "muted", strike: true },
};

function isBadLink(linkStatus: string | null | undefined): boolean {
  return (linkStatus ?? "").trim().toUpperCase() === BAD_LINK;
}

/** The detail is the fresher copy and the list's pin covers its gaps, but a BAD LINK in either wins so a stale mirror cannot undo a report. */
export function mergeChipSource(detail: PropertyDetail | null, pin: Pin | null): ChipSource {
  return {
    availability: detail?.availability ?? pin?.availability,
    link_status: [detail?.link_status, pin?.link_status].find(isBadLink) ?? detail?.link_status ?? pin?.link_status,
    last_contact: detail?.last_contact ?? pin?.last_contact,
    other_claims: detail?.other_claims ?? pin?.other_claims,
  };
}

/**
 * The compact chip line shared by list rows and the panel header, in the order availability, claims, link,
 * contact. "Check Failed", blank and unrecognised availability give no chip: the monitor said nothing useful.
 * `otherClaims` is the claims holding the property without the one being worked. The panel header passes
 * `{ availability: false }`: it shows availability as its own pill (components/property/AvailabilityPill.tsx).
 */
export function chipsFor(
  src: ChipSource,
  claimId: string | null,
  opts: { availability?: boolean } = {},
): { chips: Chip[]; otherClaims: ClaimOption[]; badLink: boolean } {
  const chips: Chip[] = [];
  const avail = opts.availability === false ? undefined : AVAILABILITY_CHIP[(src.availability ?? "").trim().toLowerCase()];
  if (avail) chips.push({ key: "availability", ...avail });

  const otherClaims = (src.other_claims ?? []).filter((c) => c.claimId !== claimId);
  if (otherClaims.length > 0) {
    const [first] = otherClaims;
    const status = (c: ClaimOption) => (c.status ? ` · ${c.status}` : "");
    chips.push({
      key: "other-claims",
      label: otherClaims.length === 1 ? `On claim ${first.claimName}${status(first)}` : `On ${otherClaims.length} claims`,
      tone: "amber",
      title: otherClaims.map((c) => `${c.claimName}${status(c)}`).join("\n"),
    });
  }

  const badLink = isBadLink(src.link_status);
  if (badLink) chips.push({ key: "bad-link", label: "Bad link", tone: "bad", outline: true, title: "Reported as a broken listing link" });
  if (src.last_contact) chips.push({ key: "last-contact", label: `Last contact ${dayMonth(src.last_contact)}`, tone: "muted" });
  return { chips, otherClaims, badLink };
}

const SCORE_TONE = { Strong: "ok", Fair: "info", Weak: "muted" } as const;

/** "Match 82 · Strong". Strong reads green, Fair blue, Weak grey; the word carries it without the colour. */
export function scoreChip(score: number): Chip {
  const n = Math.max(0, Math.min(100, Math.round(score)));
  const band = strengthLabel(n);
  return { key: "score", label: `Match ${n} · ${band}`, tone: SCORE_TONE[band], title: `Match score ${n} out of 100` };
}

/** "Stretch +$150", or plain "Stretch" when it is not about the price. */
export function stretchChip(by: number | null | undefined): Chip {
  const priced = typeof by === "number" && by > 0;
  return {
    key: "stretch",
    label: stretchText(by),
    tone: "amber",
    title: priced
      ? `$${Math.round(by).toLocaleString("en-US")} a month above the FRV. Ask before you offer it.`
      : "Outside what the claim asked for. Ask before you offer it.",
  };
}

const SOURCE_LABEL: Record<string, string> = { zillow: "Zillow", furnished_finder: "Furnished Finder" };

/** "Zillow" / "Furnished Finder"; any other site is shown as a plain "Listing site". */
export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? "Listing site";
}

/** The letter on the ink square: Z, F, or the first letter of an unknown site. */
export function sourceLetter(source: string): string {
  return source === "zillow" ? "Z" : source === "furnished_finder" ? "F" : (source.trim()[0] ?? "?").toUpperCase();
}

export const NO_MAP_LOCATION = "This listing has no map location";

/**
 * Chips of an outside listing's row, in the order score, source, on this claim, New, location, Stretch.
 * `score` is the number to show (null = no chip); `stretch` comes from `stretchOf` in lib/result-sort.ts.
 */
export function outsideChips(home: OutsideHome, opts: { score?: number | null; stretch?: { by: number | null } | null } = {}): Chip[] {
  const chips: Chip[] = [];
  if (typeof opts.score === "number" && Number.isFinite(opts.score)) chips.push(scoreChip(opts.score));
  chips.push({ key: "source", label: sourceLabel(home.source), tone: "muted", line: true, title: "Not in our database yet" });
  if (home.onClaim) chips.push({ key: "on-claim", label: "On this claim", tone: "ok" });
  if (home.isNew) chips.push({ key: "new", label: "New", tone: "info", title: "New since the last search" });
  if (!hasPin(home)) chips.push({ key: "location", label: "List only", tone: "muted", title: NO_MAP_LOCATION });
  else if (home.precision === "area") chips.push({ key: "location", label: "≈ Area only", tone: "muted", title: "The listing site gives the area, not the street address" });
  if (opts.stretch) chips.push(stretchChip(opts.stretch.by));
  return chips;
}
