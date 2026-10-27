// Contact history with an owner, from Quo calls and texts. Pure: no I/O and no imports, so
// `npm run test:unit` covers every rule here.

export type Direction = "incoming" | "outgoing";

/** The fields of a Quo call the digest needs (GET /v1/calls). */
export interface QuoCall {
  createdAt: string;
  direction: Direction;
  status: string;
  duration: number | null;
  answeredAt: string | null;
  answeredBy: string | null;
  userId: string | null;
}

/** The fields of a Quo message the digest needs (GET /v1/messages). */
export interface QuoMessage {
  createdAt: string;
  direction: Direction;
  text: string | null;
  hasMedia: boolean;
  userId: string | null;
}

export interface LastCall {
  at: string;
  direction: Direction;
  /** Teammate's first name, when Quo names one. */
  by: string | null;
  answered: boolean;
  durationSec: number;
}

export interface LastText {
  at: string;
  direction: Direction;
  by: string | null;
  /** First line of the text, at most PREVIEW_MAX characters; "(photo)" for a picture with no words. */
  preview: string | null;
}

export interface ContactDigest {
  /** `truncated`: Quo had more history than was read (or a number couldn't be read), so the counts are lower bounds. */
  calls: { total: number; outgoing: number; incoming: number; missed: number; last: LastCall | null; truncated: boolean };
  texts: { sent: number; received: number; last: LastText | null; truncated: boolean };
  lastContactAt: string | null;
  /** Numbers Quo couldn't read this time; the counts cover the others only. */
  unread: number;
}

export interface ContactNumber {
  label: string;
  phone: string;
}

/** GET /api/properties/:id/contact */
export interface ContactResponse {
  /** False when the map has no Quo key (or Quo refuses it): the panel shows nothing. */
  enabled: boolean;
  numbers: ContactNumber[];
  digest: ContactDigest | null;
}

export const PREVIEW_MAX = 90;

// North American numbers: area code and exchange never start with 0 or 1. The lookbehind stops a match
// starting inside a longer run of digits (an extension with no separator, or a number from another country).
const NANP = /(?<![\d+])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]*([2-9]\d{2})[\s.-]*(\d{4})(?!\d)/g;
// Outside the US/Canada: "+" and a country code other than 1, digits as written. A run that's too long to be
// one number is ignored (and left for the US pattern) rather than guessed at.
const INTL = /\+([2-9][\d\s.()-]{6,24}\d)(?!\d)/g;

/** Every phone number in a free-text Monday cell, as E.164. A cell can hold two ("918-555-0100 / 918-555-0200"). */
export function toE164List(raw: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(/[\/,;|]|\s{2,}|\bor\b/i)) {
    let rest = part;
    for (const m of part.matchAll(INTL)) {
      const digits = m[1].replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) continue;
      out.add(`+${digits}`);
      rest = rest.replace(m[0], " ");
    }
    for (const m of rest.matchAll(NANP)) out.add(`+1${m[1]}${m[2]}${m[3]}`);
  }
  return [...out];
}

// Calls still in progress, and ones that never connected on our side (failed, cancelled before ringing),
// aren't contact; they're left out of every count.
const NOT_CONTACT = new Set(["queued", "initiated", "ringing", "in-progress", "failed", "canceled"]);

/** Someone picked up. Incoming: Quo names who answered. Outgoing: Quo stamps answeredAt, or the call ran. */
export function isAnswered(c: QuoCall): boolean {
  if (c.answeredAt || c.answeredBy || c.status === "answered" || c.status === "forwarded") return true;
  return c.direction === "outgoing" && c.status === "completed" && (c.duration ?? 0) > 0;
}

const newest = <T extends { createdAt: string }>(items: T[]): T | undefined =>
  items.reduce<T | undefined>((a, b) => (!a || Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a), undefined);

export function preview(m: QuoMessage): string | null {
  const text = (m.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return m.hasMedia ? "(photo)" : null;
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : text;
}

/** One digest across every number and inbox. `names` maps a Quo user id to a first name. */
export function summarise(
  calls: QuoCall[],
  messages: QuoMessage[],
  names: Record<string, string> = {},
  truncated: { calls: boolean; texts: boolean } = { calls: false, texts: false },
): ContactDigest {
  const who = (id: string | null) => (id ? (names[id] || null) : null);
  const counted = calls.filter((c) => !NOT_CONTACT.has(c.status));
  const lastCall = newest(counted);
  const lastText = newest(messages);
  const times = [lastCall?.createdAt, lastText?.createdAt].filter((t): t is string => !!t);
  return {
    calls: {
      total: counted.length,
      outgoing: counted.filter((c) => c.direction === "outgoing").length,
      incoming: counted.filter((c) => c.direction === "incoming").length,
      missed: counted.filter((c) => !isAnswered(c)).length,
      last: lastCall
        ? {
            at: lastCall.createdAt,
            direction: lastCall.direction,
            by: who(lastCall.userId ?? lastCall.answeredBy),
            answered: isAnswered(lastCall),
            durationSec: Math.max(0, Math.round(lastCall.duration ?? 0)),
          }
        : null,
      truncated: truncated.calls,
    },
    texts: {
      sent: messages.filter((m) => m.direction === "outgoing").length,
      received: messages.filter((m) => m.direction === "incoming").length,
      last: lastText ? { at: lastText.createdAt, direction: lastText.direction, by: who(lastText.userId), preview: preview(lastText) } : null,
      truncated: truncated.texts,
    },
    lastContactAt: times.length ? times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null,
    unread: 0,
  };
}

/** "45 s", "3 min", "1 h 5 min". */
export function callLength(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}
