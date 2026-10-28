import "server-only";
import { summarise, type ContactDigest, type QuoCall, type QuoMessage } from "./contact";

// Quo (formerly OpenPhone) public API: https://www.quo.com/docs. Read-only use here.
// QUO_API_BASE exists for the mock server in tests/api; production uses the default.
const BASE = process.env.QUO_API_BASE ?? "https://api.quo.com/v1";
const PAGE = 100;
/** Pages read per number, inbox and kind. An owner with more history than this shows counts as "N+".
 *  summarise() sorts by date itself; reading only the first pages assumes Quo lists newest first, as its
 *  app and MCP server do (the spec doesn't say), so check "last call" against Quo once the key is live. */
const MAX_PAGES = 2;
const DIGEST_TTL_MS = 10 * 60_000;
const DIRECTORY_TTL_MS = 60 * 60_000;
/** A /users failure only drops teammate names; retry it soon rather than in an hour. */
const NAMES_RETRY_MS = 60_000;

export const quoEnabled = () => !!process.env.QUO_API_KEY;

export class QuoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Quo allows 10 requests a second per key. Every read on this instance goes through one queue: at most
// 3 at once and one start every 120 ms, which keeps a burst of panel opens under the limit.
const MAX_CONCURRENT = 3;
const SPACING_MS = 120;
let active = 0;
let nextStart = 0;
const waiting: (() => void)[] = [];

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  const wait = Math.max(0, nextStart - Date.now());
  nextStart = Math.max(Date.now(), nextStart) + SPACING_MS;
  try {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function quo<T>(path: string, params: Record<string, string | number | undefined>, signal: AbortSignal): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  // Quo wants array params repeated without brackets: participants=%2B15555555555.
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.append(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await slot(() =>
      fetch(url, {
        headers: { Authorization: process.env.QUO_API_KEY ?? "" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        cache: "no-store",
      }),
    );
    if (res.status === 429 && attempt === 0) {
      const after = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 1000, 3000)));
      continue;
    }
    if (!res.ok) throw new QuoError(`Quo ${path} returned ${res.status}`, res.status);
    return (await res.json()) as T;
  }
}

type Page<T> = { data: T[]; nextPageToken?: string | null };

async function all<T>(path: string, params: Record<string, string | number>, signal: AbortSignal): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let token: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await quo<Page<T>>(path, { ...params, maxResults: PAGE, pageToken: token }, signal);
    items.push(...(page.data ?? []));
    token = page.nextPageToken ?? undefined;
    if (!token) return { items, truncated: false };
  }
  return { items, truncated: true };
}

// Per-instance caches. Vercel instances don't share them, which only costs an extra Quo read. Both hold
// promises, so concurrent opens share one read.
type Directory = { inboxes: string[]; numbers: string[]; names: Record<string, string>; ttl: number };
let directory: { at: number; value: Promise<Directory> } | null = null;
type History = { calls: QuoCall[]; messages: QuoMessage[]; callsTruncated: boolean; textsTruncated: boolean };
const history = new Map<string, { at: number; value: Promise<History> }>();

async function readDirectory(signal: AbortSignal): Promise<Directory> {
  const numbers = quo<{ data: { id: string; number?: string | null }[] }>("/phone-numbers", {}, signal);
  // Observed now, so a failure while /users is still paging isn't an unhandled rejection; rethrown below.
  numbers.catch(() => undefined);
  const names: Record<string, string> = {};
  let ttl = DIRECTORY_TTL_MS;
  try {
    let token: string | undefined;
    do {
      const page = await quo<Page<{ id: string; firstName?: string | null; email?: string }>>("/users", { maxResults: 50, pageToken: token }, signal);
      for (const u of page.data ?? []) names[u.id] = u.firstName?.trim() || u.email?.split("@")[0] || "";
      token = page.nextPageToken ?? undefined;
    } while (token);
  } catch (e) {
    if (e instanceof QuoError && (e.status === 401 || e.status === 403)) throw e;
    ttl = NAMES_RETRY_MS;
  }
  const inboxes = (await numbers).data ?? [];
  return { inboxes: inboxes.map((n) => n.id), numbers: inboxes.flatMap((n) => (n.number ? [n.number] : [])), names, ttl };
}

/** The workspace's Quo numbers and teammates' first names. */
async function getDirectory(signal: AbortSignal): Promise<Directory> {
  if (directory) {
    const d = await directory.value.catch(() => null);
    if (d && Date.now() - directory.at < d.ttl) return d;
  }
  const entry = { at: Date.now(), value: readDirectory(signal) };
  directory = entry;
  entry.value.catch(() => {
    if (directory === entry) directory = null;
  });
  return entry.value;
}

type RawCall = {
  createdAt: string; direction: QuoCall["direction"]; status: string; duration?: number | null;
  answeredAt?: string | null; answeredBy?: string | null; userId?: string | null;
};
type RawMessage = { createdAt: string; direction: QuoMessage["direction"]; text?: string | null; media?: unknown[] | null; userId?: string | null };

/** Every call and text between our Quo numbers and one phone (E.164). */
function historyWith(phone: string, inboxes: string[], signal: AbortSignal): Promise<History> {
  const hit = history.get(phone);
  if (hit && Date.now() - hit.at < DIGEST_TTL_MS) return hit.value;
  const entry = { at: Date.now(), value: readHistory(phone, inboxes, signal) };
  entry.value.catch(() => {
    if (history.get(phone) === entry) history.delete(phone);
  });
  history.delete(phone);
  for (const [k, v] of history) {
    if (history.size < 500 && Date.now() - v.at < DIGEST_TTL_MS) break;
    history.delete(k);
  }
  history.set(phone, entry);
  return entry.value;
}

async function readHistory(phone: string, inboxes: string[], signal: AbortSignal): Promise<History> {
  const calls: QuoCall[] = [];
  const messages: QuoMessage[] = [];
  let callsTruncated = false;
  let textsTruncated = false;
  for (const phoneNumberId of inboxes) {
    const q = { phoneNumberId, participants: phone };
    const [c, m] = await Promise.all([all<RawCall>("/calls", q, signal), all<RawMessage>("/messages", q, signal)]);
    callsTruncated ||= c.truncated;
    textsTruncated ||= m.truncated;
    for (const x of c.items) {
      calls.push({
        createdAt: x.createdAt, direction: x.direction, status: x.status, duration: x.duration ?? null,
        answeredAt: x.answeredAt ?? null, answeredBy: x.answeredBy ?? null, userId: x.userId ?? null,
      });
    }
    for (const x of m.items) {
      messages.push({ createdAt: x.createdAt, direction: x.direction, text: x.text ?? null, hasMedia: !!x.media?.length, userId: x.userId ?? null });
    }
  }
  return { calls, messages, callsTruncated, textsTruncated };
}

/**
 * One digest across the given numbers and every Quo inbox. A number Quo can't read is skipped and the counts
 * marked as lower bounds; throws QuoError only when none could be read (or the key is refused).
 */
export async function contactDigest(phones: string[], signal: AbortSignal): Promise<ContactDigest> {
  const { inboxes, names } = await getDirectory(signal);
  const settled = await Promise.allSettled(phones.map((p) => historyWith(p, inboxes, signal)));
  const read = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const refused = settled.find((s) => s.status === "rejected" && s.reason instanceof QuoError && (s.reason.status === 401 || s.reason.status === 403));
  if (refused) throw (refused as PromiseRejectedResult).reason;
  if (!read.length) throw (settled[0] as PromiseRejectedResult).reason;
  const unread = phones.length - read.length;
  return {
    ...summarise(
      read.flatMap((h) => h.calls),
      read.flatMap((h) => h.messages),
      names,
      { calls: unread > 0 || read.some((h) => h.callsTruncated), texts: unread > 0 || read.some((h) => h.textsTruncated) },
    ),
    unread,
  };
}

// ---------- Webhook support (calls and texts log themselves; docs/QUO-INTEGRATION.md) ----------

/** Webhooks use Quo's dated API; the classic v1 reads above stay as they are. */
const ROOT = BASE.replace(/\/v1\/?$/, "");
export const QUO_API_VERSION = "2026-03-30";
/** What the one webhook subscribes to; lib/quo-events.ts handles exactly these. */
export const QUO_EVENTS = ["call.completed", "message.received", "message.delivered", "call.summary.completed"];

async function quoDated<T>(method: "GET" | "POST", path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const res = await slot(() =>
    fetch(`${ROOT}${path}`, {
      method,
      headers: {
        Authorization: process.env.QUO_API_KEY ?? "",
        "Quo-Api-Version": QUO_API_VERSION,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      cache: "no-store",
    }),
  );
  if (!res.ok) throw new QuoError(`Quo ${method} ${path} returned ${res.status}`, res.status);
  return (await res.json()) as T;
}

type Webhook = { id: string; url: string; status: string; events: string[]; apiVersion?: string; key?: string };

/**
 * Makes sure one enabled webhook sends QUO_EVENTS for every number to `url`, and returns its signing key when
 * Quo hands one out: on create, or on a rotation when the webhook exists but `haveKey` is false (Quo shows a
 * key only then). Idempotent: a matching webhook is left alone.
 */
export async function ensureWebhook(
  url: string,
  haveKey: boolean,
  signal: AbortSignal,
): Promise<{ id: string; key: string | null; action: "created" | "rotated" | "existing" }> {
  const list = await quoDated<{ data: Webhook[] }>("GET", "/webhooks", undefined, signal);
  const found = (list.data ?? []).find(
    (w) => w.url === url && w.status === "enabled" && QUO_EVENTS.every((e) => w.events?.includes(e)) && (w.apiVersion ?? QUO_API_VERSION) === QUO_API_VERSION,
  );
  if (found) {
    if (haveKey) return { id: found.id, key: null, action: "existing" };
    const rotated = await quoDated<{ data: Webhook }>("POST", `/webhooks/${encodeURIComponent(found.id)}/rotate`, undefined, signal);
    return { id: found.id, key: rotated.data?.key ?? null, action: "rotated" };
  }
  const made = await quoDated<{ data: Webhook }>(
    "POST",
    "/webhooks",
    { url, events: QUO_EVENTS, resourceIds: ["*"], label: "Property map: log calls and texts in Monday", status: "enabled" },
    signal,
  );
  return { id: made.data.id, key: made.data.key ?? null, action: "created" };
}

/** A teammate's first name from their Quo user id (null when Quo doesn't name them). */
export async function teammateName(userId: string | null, signal: AbortSignal): Promise<string | null> {
  if (!userId) return null;
  try {
    return (await getDirectory(signal)).names[userId] || null;
  } catch {
    return null;
  }
}

/**
 * The other party of a call, for a summary whose event couldn't name them: GET /v1/calls/:id lists both
 * numbers, ours included. Also returns when it happened, how long it ran and who took it.
 */
export async function callDetails(
  callId: string,
  signal: AbortSignal,
): Promise<{ numbers: string[]; at: string | null; durationSec: number | null; userId: string | null } | null> {
  const [{ numbers: ours }, call] = await Promise.all([
    getDirectory(signal),
    quo<{ data: { participants?: string[]; createdAt?: string; duration?: number | null; userId?: string | null; answeredBy?: string | null } }>(
      `/calls/${encodeURIComponent(callId)}`, {}, signal,
    ).catch((e) => {
      if (e instanceof QuoError && e.status === 404) return null;
      throw e;
    }),
  ]);
  if (!call?.data) return null;
  const c = call.data;
  return {
    numbers: (c.participants ?? []).filter((n) => !ours.includes(n)),
    at: c.createdAt ?? null,
    durationSec: typeof c.duration === "number" ? c.duration : null,
    userId: c.answeredBy ?? c.userId ?? null,
  };
}

/** One page of every conversation in the workspace (GET /v1/conversations), for the one-off backfill. */
export async function conversationsPage(
  pageToken: string | undefined,
  signal: AbortSignal,
): Promise<{ items: { phoneNumberId: string; participants: string[]; lastActivityAt: string | null }[]; next: string | null }> {
  const page = await quo<Page<{ phoneNumberId?: string; participants?: string[]; lastActivityAt?: string | null }>>(
    "/conversations",
    { maxResults: PAGE, pageToken },
    signal,
  );
  return {
    items: (page.data ?? []).flatMap((c) =>
      c.phoneNumberId ? [{ phoneNumberId: c.phoneNumberId, participants: c.participants ?? [], lastActivityAt: c.lastActivityAt ?? null }] : [],
    ),
    next: page.nextPageToken ?? null,
  };
}

/** The newest page of calls and texts in one conversation (one inbox, one number), with teammates' names. */
export async function conversationHistory(
  phoneNumberId: string,
  phone: string,
  signal: AbortSignal,
): Promise<{ calls: QuoCall[]; messages: QuoMessage[]; names: Record<string, string> }> {
  const q = { phoneNumberId, participants: phone, maxResults: PAGE };
  const [{ names }, c, m] = await Promise.all([
    getDirectory(signal),
    quo<Page<RawCall>>("/calls", q, signal),
    quo<Page<RawMessage>>("/messages", q, signal),
  ]);
  return {
    calls: (c.data ?? []).map((x) => ({
      createdAt: x.createdAt, direction: x.direction, status: x.status, duration: x.duration ?? null,
      answeredAt: x.answeredAt ?? null, answeredBy: x.answeredBy ?? null, userId: x.userId ?? null,
    })),
    messages: (m.data ?? []).map((x) => ({ createdAt: x.createdAt, direction: x.direction, text: null, hasMedia: !!x.media?.length, userId: x.userId ?? null })),
    names,
  };
}
