// The availability pill at the top of the property panel. Pure and import-free so `npm run test:unit` can load it.
// The labels match the availability chips in lib/chips.ts (list rows); keep the two in step.

export type AvailabilityTone = "ok" | "info" | "muted" | "bad" | "removed";

export interface AvailabilityPill {
  label: string;
  /** "from Nov 1 · checked Oct 22" (or "next availability was Sep 1" for a settled status), null when there is nothing to add. */
  detail: string | null;
  tone: AvailabilityTone;
  /** next_availability has passed while the status still says the place is coming free. */
  stale: boolean;
}

export interface AvailabilitySource {
  availability?: string | null;
  availability_checked?: string | null;
  next_availability?: string | null;
}

const STATES: Record<string, { label: string; tone: AvailabilityTone; settled: boolean }> = {
  "available now": { label: "Available now", tone: "ok", settled: true },
  "available soon": { label: "Available soon", tone: "info", settled: false },
  "available (unverified)": { label: "Unverified", tone: "muted", settled: false },
  unavailable: { label: "Unavailable", tone: "bad", settled: true },
  "listing removed": { label: "Listing removed", tone: "removed", settled: true },
};
/** "Check Failed", blank and anything unrecognised: the monitor said nothing useful. */
const UNKNOWN = { label: "Availability unknown", tone: "muted" as const, settled: false };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-01" -> "Nov 1"; the year is added when it isn't this year (or `withYear`). Null for anything else. */
function shortDate(iso: string, today: string, withYear = false): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  const day = `${month} ${Number(m[3])}`;
  return withYear || m[1] !== today.slice(0, 4) ? `${day}, ${m[1]}` : day;
}

const day = (s: string | null | undefined) => (s ?? "").trim().slice(0, 10);

/**
 * Label, detail line and tone for the pill. `today` is the viewer's local date, YYYY-MM-DD. Null only when
 * there is nothing at all to say: no status, no check date and no next-availability date.
 */
export function availabilityPill(src: AvailabilitySource, today: string): AvailabilityPill | null {
  const status = (src.availability ?? "").trim();
  const checked = day(src.availability_checked);
  const next = day(src.next_availability);
  if (!status && !checked && !next) return null;

  const state = STATES[status.toLowerCase()] ?? UNKNOWN;
  const parts: string[] = [];
  let stale = false;
  const nextText = next ? shortDate(next, today) : null;
  if (nextText) {
    if (next >= today) parts.push(`from ${nextText}`);
    else if (!state.settled) {
      stale = true;
      parts.push(`date passed (${shortDate(next, today, true)})`);
    } else parts.push(`next availability was ${nextText}`); // a settled status: the old date is only information
  }
  const checkedText = checked ? shortDate(checked, today) : null;
  if (checkedText) parts.push(`checked ${checkedText}`);
  return { label: state.label, detail: parts.length ? parts.join(" · ") : null, tone: state.tone, stale };
}

/** The viewer's local date as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
