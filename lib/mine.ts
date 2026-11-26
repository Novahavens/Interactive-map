// Mine / All in the claims drawer, and the wording of a Nearsite row. Pure: no DOM, no storage.
//
// Matching rules (spec §3.6: "case-insensitive, trimmed; a typed first name alone matches the first word"):
//   1. Names are compared after clean-up: case, accents, dots and extra spaces don't matter, and
//      "Whitfield, Dana" reads as "Dana Whitfield".
//   2. A typed full name (two words or more) must equal the owner's whole name.
//   3. A typed single word matches an owner whose FIRST name is that word (so "Dana" finds every Dana;
//      it never matches a last name or the middle of a word).
//   4. An owner field can hold several people ("Dana Whitfield, Theo Brandt"): any one of them matching counts.
//   5. No name, or no owner, never matches.

export type ClaimsScope = "mine" | "all";

export const SCOPE_KEY = "nh-claims-scope";
export const NAME_KEY = "nh-reporter-name";

const clean = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (s: string) => (s ? s.split(" ") : []);

/** One person's name, cleaned up for comparing: lower case, single spaces, "Last, First" → "first last". */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw.split(",").map(clean).filter(Boolean);
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return parts.join(" ");
}

/**
 * The people named in an owner field, each normalised. "Whitfield, Dana" is one person (two single words
 * around one comma); "Dana Whitfield, Theo Brandt", "A; B", "A / B", "A & B" and "A and B" are several.
 */
export function ownerNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const chunk of raw.split(/[;/&\n]|\s+and\s+/i)) {
    const parts = chunk.split(",").map(clean).filter(Boolean);
    if (parts.length === 2 && parts.every((p) => !p.includes(" "))) out.push(`${parts[1]} ${parts[0]}`);
    else out.push(...parts);
  }
  return [...new Set(out)];
}

/** Does the name remembered on this device belong to this owner field? See the rules at the top. */
export function nameMatches(typed: string | null | undefined, owner: string | null | undefined): boolean {
  const mine = normalizeName(typed);
  if (!mine) return false;
  const single = !mine.includes(" ");
  return ownerNames(owner).some((o) => (single ? words(o)[0] === mine : o === mine));
}

/** The first name to show in "Showing 5 claims for Dana", in the case the person typed it. */
export function firstName(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const ordered = parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(" ");
  return ordered.split(" ")[0] ?? "";
}

/** What to keep when the person saves their name: trimmed, single spaces, at most 80 characters. */
export function tidyName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The scope to start in: the remembered choice, else Mine once a name is known, else All. */
export function initialScope(stored: string | null | undefined, name: string | null | undefined): ClaimsScope {
  if (stored === "mine" || stored === "all") return stored;
  return normalizeName(name) ? "mine" : "all";
}

/**
 * The rows to show. All, or Mine before a name is known, shows everything. Mine keeps the rows the name
 * owns, plus rows nobody owns when `unowned` is set (Nearsite: "Mine = mine + free for all").
 */
export function filterByScope<T>(
  rows: readonly T[],
  scope: ClaimsScope,
  name: string | null | undefined,
  owner: (row: T) => string | null | undefined,
  opts: { unowned?: boolean } = {},
): T[] {
  if (scope === "all" || !normalizeName(name)) return [...rows];
  return rows.filter((r) => {
    const o = owner(r);
    if (ownerNames(o).length === 0) return opts.unowned === true;
    return nameMatches(name, o);
  });
}

/** "Showing 5 claims for Dana" (the "· Change name" link is the component's). */
export function showingLine(count: number, name: string, kind: "claims" | "nearsite" = "claims"): string {
  const noun = kind === "nearsite" ? `Nearsite ${count === 1 ? "claim" : "claims"}` : count === 1 ? "claim" : "claims";
  const tail = kind === "nearsite" ? " and free for all" : "";
  return `Showing ${count} ${noun} for ${firstName(name)}${tail}`;
}

export interface DaysLeft {
  label: string;
  /** bad = due today (or past), amber = 5 days or fewer, muted = more. */
  tone: "bad" | "amber" | "muted";
}

/** The days-left chip of a Nearsite claim. Null when Nearsite gave no deadline (no chip). */
export function daysLeftChip(days: number | null | undefined): DaysLeft | null {
  if (days == null || !Number.isFinite(days)) return null;
  const d = Math.floor(days);
  if (d <= 0) return { label: "Due today", tone: "bad" };
  return { label: `${d} ${d === 1 ? "day" : "days"} left`, tone: d <= 5 ? "amber" : "muted" };
}

interface NearsiteLike {
  title: string;
  daysLeft: number | null;
}

/** Soonest first; claims with no deadline last; ties by title. Does not change the input. */
export function sortNearsite<T extends NearsiteLike>(claims: readonly T[]): T[] {
  const key = (c: T) => (c.daysLeft == null || !Number.isFinite(c.daysLeft) ? Infinity : Math.max(0, Math.floor(c.daysLeft)));
  return [...claims].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** "4 bd · 2 ba · budget $3,600/mo" ("budget not set" when Nearsite has none). */
export function nearsiteNeeds(c: { beds: number | null; baths: number | null; budgetMonthly: number | null }): string {
  const parts: string[] = [];
  if (c.beds != null) parts.push(`${n(c.beds)} bd`);
  if (c.baths != null) parts.push(`${n(c.baths)} ba`);
  parts.push(c.budgetMonthly != null && c.budgetMonthly > 0 ? `budget $${Math.round(c.budgetMonthly).toLocaleString("en-US")}/mo` : "budget not set");
  return parts.join(" · ");
}

/** "Fee group B · 3 homes found". Parts Nearsite did not give are left out; "" when it gave neither. */
export function nearsiteMeta(c: { feeGroup: string | null; homesFound: number | null }): string {
  const parts: string[] = [];
  if (c.feeGroup?.trim()) parts.push(`Fee group ${c.feeGroup.trim()}`);
  if (c.homesFound != null) parts.push(`${c.homesFound} ${c.homesFound === 1 ? "home" : "homes"} found`);
  return parts.join(" · ");
}

/** "Tulsa, OK", "Tulsa" or "" */
export function cityState(c: { city: string | null; state: string | null }): string {
  return [c.city?.trim(), c.state?.trim()].filter(Boolean).join(", ");
}
