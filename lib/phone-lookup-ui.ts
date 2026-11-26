// Wording and state for the Contacts extras: Find phone, the Text templates menu and the outreach line.
// Pure: no I/O, so `npm run test:unit` covers every rule here.
import { draftText } from "./quo-links.ts";
import { shortDate, templateText, type TemplateOpts } from "./text-templates.ts";
import type { OutreachStatus, PhoneLookup, TextTemplate } from "./types";

// ---------- dates ----------

/** "2026-11-26T15:10:00Z" → "Nov 26" in `timeZone` (the device's own when left out); "" when it is not a date. */
export function dayLabel(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(timeZone && { timeZone }) }).format(d);
}

/** True when both moments fall on the same calendar day in `timeZone` (the device's own when left out). */
export function sameDay(a: string | null | undefined, now: Date, timeZone?: string): boolean {
  if (!a) return false;
  const d = new Date(a);
  if (Number.isNaN(d.getTime())) return false;
  const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone && { timeZone }) });
  return day.format(d) === day.format(now);
}

// ---------- find phone: wording ----------

export const PHONE_COPY = {
  none: "No phone number yet",
  find: "Find phone",
  off: "Not set up yet.",
  searching: "Looking for a number…",
  searchingHint: "Takes up to 30 seconds.",
  notFound: "No number found.",
  notFoundHint: "Try the listing page, or text through the listing site.",
  retry: "Try again",
  retryTomorrow: "You can try again tomorrow.",
  errorTitle: "Couldn't look that up.",
  errorRest: "Nothing was saved. Try again in a minute.",
  busyTitle: "Too many lookups right now.",
  busyRest: "Nothing was saved. Try again in a few minutes.",
  save: "Save to listing",
  saving: "Saving…",
  saved: "Saved",
  saveFailed: "Couldn't save the number. Try again.",
  dismiss: "Not right",
} as const;

const CONFIDENCE: Record<NonNullable<PhoneLookup["confidence"]>, string> = {
  high: "likely right",
  medium: "may be right",
  low: "a guess: check before you call",
};

/** "likely right (high)"; "" when the lookup gave no confidence. */
export function confidenceWords(confidence: PhoneLookup["confidence"] | undefined): string {
  return confidence && CONFIDENCE[confidence] ? `${CONFIDENCE[confidence]} (${confidence})` : "";
}

/** Where the number came from, in plain words. The lookup service's own default ("lookup") reads "Public records". */
export function sourceWords(source: string | null | undefined): string {
  const s = (source ?? "").trim();
  if (!s || /^lookup$/i.test(s)) return "Public records";
  return s.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The line under a found number: "Public records · likely right (high)". */
export function foundLine(lookup: Pick<PhoneLookup, "source" | "confidence">): string {
  return [sourceWords(lookup.source), confidenceWords(lookup.confidence)].filter(Boolean).join(" · ");
}

/** The line under "No number found.": "Checked Nov 26. Try the listing page, or text through the listing site." */
export function checkedLine(lookedUpAt: string | null | undefined, timeZone?: string): string {
  const day = dayLabel(lookedUpAt, timeZone);
  return `${day ? `Checked ${day}. ` : ""}${PHONE_COPY.notFoundHint}`;
}

/** Try again is offered once a day: not on the day the last lookup ran. */
export function canRetry(lookedUpAt: string | null | undefined, now: Date, timeZone?: string): boolean {
  return !sameDay(lookedUpAt, now, timeZone);
}

// ---------- find phone: state ----------

export type PhoneState =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; phone: string; source: string | null; confidence: PhoneLookup["confidence"]; lookedUpAt: string | null }
  | { kind: "not_found"; lookedUpAt: string | null }
  /** `busy` = the server said 429. */
  | { kind: "error"; busy: boolean };

export type PhoneAction =
  /** The answer of GET or POST. */
  | { type: "answer"; lookup: PhoneLookup }
  /** GET failed: the person can still press Find phone. */
  | { type: "load_failed" }
  | { type: "search" }
  /** POST failed, with its HTTP status (0 = no answer at all). */
  | { type: "failed"; status: number }
  /** "Not right": back to idle; nothing was saved. */
  | { type: "dismiss" };

export const PHONE_START: PhoneState = { kind: "loading" };

/** What a `PhoneLookup` from the route means on screen. */
export function stateOf(lookup: PhoneLookup | null | undefined): PhoneState {
  if (!lookup || typeof lookup !== "object") return { kind: "idle" };
  if (lookup.state === "off") return { kind: "off" };
  if (lookup.state === "found" && typeof lookup.phone === "string" && lookup.phone.trim()) {
    return { kind: "found", phone: lookup.phone.trim(), source: lookup.source ?? null, confidence: lookup.confidence ?? null, lookedUpAt: lookup.lookedUpAt ?? null };
  }
  // Never looked (no date) is the idle state; a dated miss is "No number found."
  return lookup.lookedUpAt ? { kind: "not_found", lookedUpAt: lookup.lookedUpAt } : { kind: "idle" };
}

export function phoneReducer(state: PhoneState, action: PhoneAction): PhoneState {
  switch (action.type) {
    case "answer":
      return stateOf(action.lookup);
    case "load_failed":
      return state.kind === "loading" ? { kind: "idle" } : state;
    case "search":
      // Nothing to look up while off, already found, or already looking.
      return state.kind === "off" || state.kind === "found" || state.kind === "searching" || state.kind === "loading" ? state : { kind: "searching" };
    case "failed":
      return state.kind === "searching" ? { kind: "error", busy: action.status === 429 } : state;
    case "dismiss":
      return state.kind === "found" ? { kind: "idle" } : state;
    default:
      return state;
  }
}

// ---------- text templates menu ----------

export interface TemplateContext {
  beds?: number | null;
  city?: string | null;
  /** Move-in date, YYYY-MM-DD. */
  moveIn?: string | null;
  /** Monthly rent to confirm, in dollars. */
  rent?: number | null;
}

export type TemplateChoice = TextTemplate["key"] | "blank";

/** The Text menu, in order, with the labels of the UI spec. "blank" opens Quo with an empty composer. */
export const TEMPLATE_MENU: readonly { key: TemplateChoice; label: string }[] = [
  { key: "availability", label: "Ask availability" },
  { key: "address", label: "Ask for the address" },
  { key: "rate", label: "Confirm the rate" },
  { key: "blank", label: "Blank text" },
];

export type MenuTextOpts = TemplateOpts & { rent?: number | null };

/**
 * The text a menu choice pre-fills in Quo. The same as `templateText`, except "Confirm the rate" names the
 * rent when it is known (`templateText` has no rent and asks what the rate is instead).
 */
export function menuText(key: TemplateChoice, opts: MenuTextOpts = {}): string {
  if (key === "blank") return "";
  const rent = typeof opts.rent === "number" && Number.isFinite(opts.rent) && opts.rent > 0 ? Math.round(opts.rent) : null;
  if (key === "rate" && rent !== null) {
    const when = shortDate(opts.moveIn);
    const stay = when ? ` for a stay starting ${when}` : "";
    return `${draftText(opts)}Can you confirm $${rent.toLocaleString("en-US")} a month${stay}, and what the deposit is? `;
  }
  return templateText(key, opts);
}

// ---------- outreach line ----------

export type OutreachLine = { kind: "asked" | "replied"; text: string } | null;

const REPLIED = new Set(["replied", "address_found"]);

/** "Asked Nov 24 · no reply yet" / "Replied Nov 25"; null when nothing has gone out yet. */
export function outreachLine(outreach: OutreachStatus | null | undefined, timeZone?: string): OutreachLine {
  if (!outreach) return null;
  const replied = dayLabel(outreach.repliedAt, timeZone);
  if (replied || REPLIED.has(outreach.status)) return { kind: "replied", text: replied ? `Replied ${replied}` : "Replied" };
  const asked = dayLabel(outreach.sentAt, timeZone);
  return asked ? { kind: "asked", text: `Asked ${asked} · no reply yet` } : null;
}
