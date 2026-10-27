// Contact history with an owner, from Quo calls and texts. Pure: no I/O and no imports, so
// `node --test tests/unit` covers every rule here.

export type Direction = "incoming" | "outgoing";

/** The fields of a Quo call the digest needs (GET /v1/calls). */
export interface QuoCall {
  createdAt: string;
  direction: Direction;
  status: string;
  duration: number | null;
  answeredAt: string | null;
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
  calls: { total: number; outgoing: number; incoming: number; missed: number; last: LastCall | null };
  texts: { sent: number; received: number; last: LastText | null };
  lastContactAt: string | null;
  /** Quo had more history than was read: the counts are lower bounds. */
  truncated: boolean;
}

export interface ContactNumber {
  label: string;
  phone: string;
}

/** GET /api/properties/:id/contact */
export interface ContactResponse {
  /** False when the map has no Quo key: the panel shows nothing. */
  enabled: boolean;
  numbers: ContactNumber[];
  digest: ContactDigest | null;
}

export const PREVIEW_MAX = 90;

const US = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})(?!\d)/g;

/** Every phone number in a free-text Monday cell, as E.164. A cell can hold two ("918-555-0100 / 918-555-0200"). */
export function toE164List(raw: string | null | undefined): string[] {
  const out = new Set<string>();
  const text = raw ?? "";
  // Outside the US/Canada (+1 is the pattern below): keep the digits as written.
  for (const m of text.matchAll(/\+([2-9][\d\s.-]{6,17}\d)/g)) {
    const digits = m[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) out.add(`+${digits}`);
  }
  for (const m of text.matchAll(US)) out.add(`+1${m[1]}${m[2]}${m[3]}`);
  return [...out];
}

// A call counts as missed when it rang and nobody picked up, in either direction.
const NOT_FINISHED = new Set(["queued", "initiated", "ringing", "in-progress"]);

export function isAnswered(c: QuoCall): boolean {
  return !!c.answeredAt || (c.status === "completed" && (c.duration ?? 0) > 0);
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
  truncated = false,
): ContactDigest {
  const who = (id: string | null) => (id ? (names[id] ?? null) : null);
  const finished = calls.filter((c) => !NOT_FINISHED.has(c.status));
  const lastCall = newest(finished);
  const lastText = newest(messages);
  const times = [lastCall?.createdAt, lastText?.createdAt].filter((t): t is string => !!t);
  return {
    calls: {
      total: finished.length,
      outgoing: finished.filter((c) => c.direction === "outgoing").length,
      incoming: finished.filter((c) => c.direction === "incoming").length,
      missed: finished.filter((c) => !isAnswered(c)).length,
      last: lastCall
        ? {
            at: lastCall.createdAt,
            direction: lastCall.direction,
            by: who(lastCall.userId),
            answered: isAnswered(lastCall),
            durationSec: Math.max(0, Math.round(lastCall.duration ?? 0)),
          }
        : null,
    },
    texts: {
      sent: messages.filter((m) => m.direction === "outgoing").length,
      received: messages.filter((m) => m.direction === "incoming").length,
      last: lastText ? { at: lastText.createdAt, direction: lastText.direction, by: who(lastText.userId), preview: preview(lastText) } : null,
    },
    lastContactAt: times.length ? times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null,
    truncated,
  };
}

/** "45 s", "3 min", "1 h 5 min". */
export function callLength(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}
