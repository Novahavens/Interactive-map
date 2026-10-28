// Quo webhook events (API version 2026-03-30) → what the map does with them: which properties a call or text
// belongs to, whether it moves Last Contact Date, and the one-line note it leaves in Monday. Pure: no I/O and
// type-only imports, so `npm run test:unit` covers every rule here. The route is app/api/quo/webhook/route.ts;
// the design is docs/QUO-INTEGRATION.md "Calls and texts log themselves".

import type { QuoCall, QuoMessage } from "./contact";

/** "45 s", "3 min", "1 h 5 min": callLength in lib/contact.ts (repeated so this file stays import-free). */
function callLength(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

/** The events the webhook subscribes to (lib/quo.ts QUO_EVENTS). Anything else is acknowledged and ignored. */
export const HANDLED = ["call.completed", "message.received", "message.delivered", "call.summary.completed"] as const;
export type HandledType = (typeof HANDLED)[number];

export type Kind = "call" | "text_in" | "text_out" | "summary";
export type Direction = "incoming" | "outgoing";

/** One Quo event, reduced to what the map uses. Message text is never kept. */
export interface QuoEvent {
  eventId: string;
  type: HandledType;
  kind: Kind;
  /** The call id (AC…) for calls and summaries, the message id for texts. */
  resourceId: string;
  /** When the call or text happened (ISO). */
  at: string;
  direction: Direction | null;
  /** The other party's numbers, E.164: never one of ours. Empty when Quo couldn't resolve them. */
  numbers: string[];
  inboxId: string | null;
  /** The Quo user on our side (the caller, the texter, or who answered). */
  userId: string | null;
  status: string | null;
  answered: boolean | null;
  durationSec: number | null;
  hasVoicemail: boolean;
  /** Summaries only: Quo's sentences and next steps (empty unless processingStatus is "completed"). */
  summary: string[];
  nextSteps: string[];
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : []);
const E164 = /^\+[1-9]\d{7,14}$/;
const phones = (v: unknown): string[] => [...new Set(strs(v).filter((s) => E164.test(s)))];
const iso = (v: unknown): string | null => {
  const s = str(v);
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;
};

/** Reads a webhook body. `ignore` is an event the map doesn't use (acknowledge it); `invalid` is malformed. */
export function parseEvent(body: unknown): { ok: true; event: QuoEvent } | { ok: false; reason: "ignore" | "invalid" } {
  const root = obj(body);
  const type = str(root?.type);
  const eventId = str(root?.id);
  if (!root || !type || !eventId || eventId.length > 100) return { ok: false, reason: "invalid" };
  if (!(HANDLED as readonly string[]).includes(type)) return { ok: false, reason: "ignore" };
  const data = obj(root.data);
  const resource = obj(data?.resource);
  const context = obj(data?.context) ?? {};
  if (!resource) return { ok: false, reason: "invalid" };

  const base = {
    eventId,
    type: type as HandledType,
    inboxId: str(context.phoneNumberId),
    userId: str(context.userId),
    summary: [] as string[],
    nextSteps: [] as string[],
    hasVoicemail: false,
  };

  if (type === "message.received" || type === "message.delivered") {
    const id = str(resource.id);
    const at = iso(resource.createdAt) ?? iso(root.createdAt);
    if (!id || !at) return { ok: false, reason: "invalid" };
    const incoming = type === "message.received";
    return {
      ok: true,
      event: {
        ...base, kind: incoming ? "text_in" : "text_out", resourceId: id, at, direction: incoming ? "incoming" : "outgoing",
        numbers: incoming ? phones([context.senderIdentifier]) : phones(context.recipientIdentifiers),
        status: str(resource.status), answered: null, durationSec: null,
      },
    };
  }

  const participants = obj(context.participants);
  // "unavailable" means unknown, not none: no numbers, so nothing is matched (and a summary falls back to its call).
  const external = participants?.resolution === "unavailable" ? [] : phones(participants?.external);

  if (type === "call.summary.completed") {
    const callId = str(resource.callId);
    if (!callId) return { ok: false, reason: "invalid" };
    const done = resource.processingStatus === "completed";
    return {
      ok: true,
      event: {
        ...base, kind: "summary", resourceId: callId, at: iso(root.createdAt) ?? new Date(0).toISOString(), direction: null,
        numbers: external, userId: str(resource.answeredByUserId) ?? base.userId, status: str(resource.processingStatus),
        answered: null, durationSec: null,
        summary: done ? strs(resource.summary) : [], nextSteps: done ? strs(resource.nextSteps) : [],
      },
    };
  }

  // call.completed
  const id = str(resource.id);
  const at = iso(resource.createdAt) ?? iso(root.createdAt);
  const direction = resource.direction === "incoming" || resource.direction === "outgoing" ? resource.direction : null;
  if (!id || !at || !direction) return { ok: false, reason: "invalid" };
  const status = str(resource.status);
  const duration = typeof resource.duration === "number" && Number.isFinite(resource.duration) ? Math.max(0, Math.round(resource.duration)) : null;
  return {
    ok: true,
    event: {
      ...base, kind: "call", resourceId: id, at, direction, numbers: external, status, durationSec: duration,
      answered: status === "answered" || (status === "forwarded" && (duration ?? 0) > 0),
      hasVoicemail: resource.hasVoicemail === true,
    },
  };
}

/** What a call was, for the note and the date. `other` (failed, unknown) leaves nothing behind. */
export type CallOutcome = "answered" | "attempt" | "missed" | "ai" | "other";

export function callOutcome(e: Pick<QuoEvent, "direction" | "status" | "answered">): CallOutcome {
  if (e.answered) return "answered";
  if (e.status === "ai-handled") return e.direction === "incoming" ? "ai" : "other";
  if (e.status === "unanswered" || e.status === "abandoned" || e.status === "forwarded") return e.direction === "outgoing" ? "attempt" : "missed";
  return "other";
}

/** Answered calls and every text move Last Contact Date; attempts, missed calls and summaries don't. */
export function movesDate(e: QuoEvent): boolean {
  if (e.kind === "text_in" || e.kind === "text_out") return true;
  return e.kind === "call" && callOutcome(e) === "answered";
}

/**
 * The note's slot for the one-per-property-per-day rule: every answered call gets its own note; attempts,
 * missed calls and texts each collapse to one a day (eight texts back and forth make two notes, one each way).
 * Null: no note.
 */
export function noteSlot(e: QuoEvent): string | null {
  if (e.kind === "text_in" || e.kind === "text_out") return e.kind;
  if (e.kind !== "call") return null;
  const o = callOutcome(e);
  if (o === "answered") return `call:${e.resourceId}`;
  if (o === "attempt" || o === "missed" || o === "ai") return o;
  return null;
}

/** A property behind a number, as quo_match returns it (sorted: active-claim options, then latest contact). */
export interface Match {
  number: string;
  id: string;
  /** The number is the owner's (else the landlord/PM's). */
  owner: boolean;
  onClaim: boolean;
  lastContact: string | null;
  /** First part of the address ("123 Main St"), when there is one. */
  street?: string | null;
}

export const NOTE_MAX = 5;

function unique(matches: Match[]): Match[] {
  const seen = new Set<string>();
  return matches.filter((m) => !seen.has(m.id) && seen.add(m.id));
}

/**
 * Smart pick (decided 28 Oct): the note goes on the properties that are options on an active claim; when none
 * are, on up to five of the owner's properties, the most recently contacted first. One property: that one.
 */
export function noteTargets(matches: Match[], max = NOTE_MAX): string[] {
  const all = unique(matches);
  const onClaim = all.filter((m) => m.onClaim);
  return (onClaim.length ? onClaim : all).slice(0, max).map((m) => m.id);
}

const SUFFIX = /^(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|pl|place|way|ter|terrace|pkwy|parkway|hwy|highway|trl|trail|n|s|e|w|ne|nw|se|sw|north|south|east|west|apt|unit|#)\.?$/i;

const STREET_WORD = "(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|pl|place|way|ter|terrace|pkwy|parkway|trl|trail)";

/**
 * The matched properties a call summary names by street: the house number with the name ("4512 Harvard"),
 * the name with a street word ("Elm Street"), or a name of four letters or more on its own ("Harvard"). Used
 * to put "Owner said" on the right one of an owner's properties.
 */
export function namedInText(matches: Match[], text: string): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return unique(matches)
    .filter((m) => {
      const words = (m.street ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
      const number = /^\d+[a-z]?$/.test(words[0] ?? "") ? words[0] : null;
      const name = words.slice(number ? 1 : 0).filter((w) => !SUFFIX.test(w)).join(" ");
      if (!name) return false;
      if (number && hay.includes(` ${number} ${name} `)) return true;
      if (new RegExp(` ${name} ${STREET_WORD} `).test(hay)) return true; // name is letters, digits and spaces only
      return name.replace(/ /g, "").length >= 4 && !/^\d+(st|nd|rd|th)?$/.test(name) && hay.includes(` ${name} `);
    })
    .map((m) => m.id);
}

/** The properties a call summary shows on: the ones it names by street, else the smart pick. */
export function summaryTargets(matches: Match[], text: string): string[] {
  const named = namedInText(matches, text);
  return named.length ? named.slice(0, NOTE_MAX) : noteTargets(matches);
}

/** The properties whose Last Contact Date this moves: every match, unless it already shows that day or later. */
export function dateTargets(matches: Match[], day: string): string[] {
  return unique(matches).filter((m) => !m.lastContact || m.lastContact < day).map((m) => m.id);
}

export const DEFAULT_TZ = "America/Chicago";

/** The calendar day of an instant in the team's time zone, YYYY-MM-DD. */
export function localDay(at: string, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/** "Oct 27, 2:14 PM" in the team's time zone. */
export function localWhen(at: string, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

/** "(918) 555-0100" for a US number, the E.164 string otherwise. */
export function displayPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The Monday note (HTML, as create_update takes it). Line one says what happened, line two when, with which
 * number, and that Quo logged it, so a note on the wrong one of an owner's properties is obvious at a glance.
 * Never quotes a text.
 */
export function noteHtml(e: QuoEvent, o: { teammate: string | null; owner: boolean; number: string; tz?: string }): string | null {
  const who = o.owner ? "the owner" : "the landlord / PM";
  const Who = o.owner ? "The owner" : "The landlord / PM";
  const we = o.teammate ?? "We";
  const mins = e.durationSec ? ` · ${callLength(e.durationSec)}` : "";
  let head: string;
  if (e.kind === "text_out") head = `💬 <b>${escapeHtml(we)} texted ${who}</b>`;
  else if (e.kind === "text_in") head = `💬 <b>${Who} texted</b>`;
  else if (e.kind === "call") {
    const out = callOutcome(e);
    if (out === "answered") {
      head = e.direction === "outgoing"
        ? `📞 <b>${escapeHtml(we)} called ${who}</b>${mins}`
        : `📞 <b>${Who} called</b> · ${o.teammate ? `${escapeHtml(o.teammate)} answered` : "answered"}${mins}`;
    } else if (out === "attempt") head = `📞 <b>${escapeHtml(we)} tried to call ${who}</b> · no answer`;
    else if (out === "missed") head = `📞 <b>${Who} called</b> · missed${e.hasVoicemail ? " · left a voicemail" : ""}`;
    else if (out === "ai") head = `📞 <b>${Who} called</b> · Quo's AI agent answered`;
    else return null;
  } else return null;
  return `${head}<br>${escapeHtml(localWhen(e.at, o.tz))} · ${escapeHtml(displayPhone(o.number))} · logged from Quo`;
}

/**
 * Pilot rollout: QUO_LIVE_USERS (comma-separated Quo user ids or first names) limits live writes to those
 * teammates. Empty: everyone.
 */
export function liveFor(liveUsers: string, userId: string | null, teammate: string | null): boolean {
  const list = liveUsers.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  return list.includes((userId ?? "").toLowerCase()) || list.includes((teammate ?? "").toLowerCase());
}

/**
 * Backfill: the newest contact that would have moved Last Contact Date (an answered call or any text), or null.
 * `names` maps a Quo user id to a first name.
 */
export function lastLoggable(
  calls: QuoCall[],
  messages: QuoMessage[],
  isAnswered: (c: QuoCall) => boolean,
  names: Record<string, string> = {},
): { at: string; kind: "call" | "text_in" | "text_out"; teammate: string | null } | null {
  const candidates = [
    ...calls.filter(isAnswered).map((c) => ({ at: c.createdAt, kind: "call" as const, user: c.userId ?? c.answeredBy })),
    ...messages.map((m) => ({ at: m.createdAt, kind: m.direction === "incoming" ? ("text_in" as const) : ("text_out" as const), user: m.userId })),
  ].filter((c) => Number.isFinite(Date.parse(c.at)));
  if (!candidates.length) return null;
  const newest = candidates.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
  return { at: newest.at, kind: newest.kind, teammate: newest.user ? names[newest.user] || null : null };
}
