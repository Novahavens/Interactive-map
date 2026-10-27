import "server-only";
import { summarise, type ContactDigest, type QuoCall, type QuoMessage } from "./contact";

// Quo (formerly OpenPhone) public API: https://www.quo.com/docs. Read-only use here.
// QUO_API_BASE exists for the mock server in tests/api; production uses the default.
const BASE = process.env.QUO_API_BASE ?? "https://api.quo.com/v1";
const PAGE = 100;
/** Pages read per number, inbox and kind. An owner with more history than this shows counts as "N+". */
const MAX_PAGES = 2;
const DIGEST_TTL_MS = 10 * 60_000;
const DIRECTORY_TTL_MS = 60 * 60_000;

export const quoEnabled = () => !!process.env.QUO_API_KEY;

export class QuoError extends Error {}

async function quo<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  // Quo wants array params repeated without brackets: participants=%2B15555555555.
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.append(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: process.env.QUO_API_KEY ?? "" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new QuoError(`Quo ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

type Page<T> = { data: T[]; nextPageToken?: string | null };

async function all<T>(path: string, params: Record<string, string | number>): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let token: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await quo<Page<T>>(path, { ...params, maxResults: PAGE, pageToken: token });
    items.push(...(page.data ?? []));
    token = page.nextPageToken ?? undefined;
    if (!token) return { items, truncated: false };
  }
  return { items, truncated: true };
}

// Per-instance caches. Vercel instances don't share them, which only costs an extra Quo read.
let directory: { at: number; inboxes: string[]; names: Record<string, string> } | null = null;
type History = { calls: QuoCall[]; messages: QuoMessage[]; truncated: boolean };
// Promises, so two requests for the same phone at once share one Quo read.
const history = new Map<string, { at: number; value: Promise<History> }>();

/** The workspace's Quo numbers and teammates' first names, refreshed hourly. */
async function getDirectory() {
  if (directory && Date.now() - directory.at < DIRECTORY_TTL_MS) return directory;
  const [numbers, users] = await Promise.all([
    quo<{ data: { id: string }[] }>("/phone-numbers"),
    quo<{ data: { id: string; firstName?: string | null; email?: string }[] }>("/users", { maxResults: 50 }).catch(() => ({ data: [] })),
  ]);
  const names: Record<string, string> = {};
  for (const u of users.data ?? []) names[u.id] = u.firstName?.trim() || u.email?.split("@")[0] || "";
  directory = { at: Date.now(), inboxes: (numbers.data ?? []).map((n) => n.id), names };
  return directory;
}

type RawCall = { createdAt: string; direction: QuoCall["direction"]; status: string; duration?: number | null; answeredAt?: string | null; userId?: string | null };
type RawMessage = { createdAt: string; direction: QuoMessage["direction"]; text?: string | null; media?: unknown[] | null; userId?: string | null };

/** Every call and text between our Quo numbers and one phone (E.164). */
function historyWith(phone: string, inboxes: string[]): Promise<History> {
  const hit = history.get(phone);
  if (hit && Date.now() - hit.at < DIGEST_TTL_MS) return hit.value;
  const value = readHistory(phone, inboxes);
  value.catch(() => history.delete(phone));
  if (history.size > 500) history.delete(history.keys().next().value!);
  history.set(phone, { at: Date.now(), value });
  return value;
}

async function readHistory(phone: string, inboxes: string[]): Promise<History> {
  const calls: QuoCall[] = [];
  const messages: QuoMessage[] = [];
  let truncated = false;
  for (const phoneNumberId of inboxes) {
    const q = { phoneNumberId, participants: phone };
    const [c, m] = await Promise.all([all<RawCall>("/calls", q), all<RawMessage>("/messages", q)]);
    truncated ||= c.truncated || m.truncated;
    for (const x of c.items) {
      calls.push({ createdAt: x.createdAt, direction: x.direction, status: x.status, duration: x.duration ?? null, answeredAt: x.answeredAt ?? null, userId: x.userId ?? null });
    }
    for (const x of m.items) {
      messages.push({ createdAt: x.createdAt, direction: x.direction, text: x.text ?? null, hasMedia: !!x.media?.length, userId: x.userId ?? null });
    }
  }
  return { calls, messages, truncated };
}

/** One digest across all the given numbers and every Quo inbox. Throws QuoError when Quo can't be read. */
export async function contactDigest(phones: string[]): Promise<ContactDigest> {
  const { inboxes, names } = await getDirectory();
  const calls: QuoCall[] = [];
  const messages: QuoMessage[] = [];
  let truncated = false;
  for (const phone of phones) {
    const h = await historyWith(phone, inboxes);
    calls.push(...h.calls);
    messages.push(...h.messages);
    truncated ||= h.truncated;
  }
  return summarise(calls, messages, names, truncated);
}
