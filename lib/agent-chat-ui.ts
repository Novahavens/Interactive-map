// Pure helpers for the agent chat window (components/AgentChat.tsx, lib/use-agent-chat.ts): the copy, the
// suggestion chips, the elapsed-time line, the result summary and the reducer that owns the message list.
// No React and no browser APIs here, so it runs under `node --test`. Not to be confused with
// lib/agent-chat.ts, which is the server side of the same feature.
import type { AskRequest, AskResponse, ChatMessage } from "./types";

/** Exact strings from the UI spec (§3.3). */
export const COPY = {
  title: "Housing agent",
  empty: "Tell me what the family needs, or tap a suggestion.",
  noClaim: "Pick a claim first. The agent searches for one claim at a time.",
  openClaims: "Open claims",
  placeholder: "Ask for homes, or change the search",
  placeholderRunning: "Wait for this search, or stop it",
  placeholderListening: "Listening… speak now",
  hint: "Enter to send",
  hintListening: "Tap the mic to stop",
  micBlocked: "The microphone is blocked here. You can still type.",
  running: "Searching Zillow and Furnished Finder…",
  runningTail: "usually under 90 seconds. You can keep using the map.",
  stop: "Stop",
  stopped: "Search stopped. Nothing changed on the map.",
  errorLead: "The search didn't finish.",
  errorTail: "Nothing changed on the map.",
  error: "The search didn't finish. Nothing changed on the map.",
  rateLimited: "Too many messages. Try again in a few minutes.",
  retry: "Try again",
  updated: "Map and list updated",
  undo: "Undo",
  showOnMap: "Show on map",
  bubbleOpen: "Ask the housing agent",
  bubbleClose: "Close the housing agent",
} as const;

/** The prompt box takes at most this many characters (the route itself allows 1000). */
export const MAX_CHARS = 500;
/** A request that has not answered by now is treated as an error. */
export const TIMEOUT_MS = 120_000;
/** The agent says a search is "usually under 90 seconds": the thin bar fills over this long. */
export const USUAL_MS = 90_000;
/** Messages kept per claim, in memory. */
export const MAX_MESSAGES = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Outside listings have uuid ids; homes from our own database have numeric ids and can't be sent as `listingId`. */
export const isListingId = (id: string | null | undefined): id is string => !!id && UUID_RE.test(id);

// ---------- Suggestion chips ----------

export interface Suggestion {
  key: "within10" | "unfurnished" | "cheaper" | "moreLike";
  /** What the chip says. */
  label: string;
  /** What is sent (and shown as the person's message). */
  text: string;
  /** Set on "More like this one" when the selected home is an outside listing: send `more_like` instead of a message. */
  listingId?: string;
}

/** The chips under the log. "More like this one" exists only while a home is selected. */
export function suggestionsFor(selectedHome: { id: string; name: string } | null): Suggestion[] {
  const list: Suggestion[] = [
    { key: "within10", label: "Within 10 miles", text: "Within 10 miles" },
    { key: "unfurnished", label: "Show unfurnished", text: "Show unfurnished" },
    { key: "cheaper", label: "Cheaper", text: "Cheaper" },
  ];
  const name = selectedHome?.name.trim();
  if (selectedHome && name) {
    list.push({ key: "moreLike", label: "More like this one", text: `More like ${name}`, ...(isListingId(selectedHome.id) ? { listingId: selectedHome.id } : {}) });
  }
  return list;
}

// ---------- Small formatters ----------

/** 34_000 → "0:34", 95_000 → "1:35". Never negative. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "0:34 · usually under 90 seconds. You can keep using the map." */
export const runningLine = (ms: number): string => `${formatElapsed(ms)} · ${COPY.runningTail}`;

/** How full the thin bar is, 4–96 (%). It never reaches the end: the search decides when it is done. */
export function runningPercent(ms: number): number {
  const p = (Math.max(0, ms) / USUAL_MS) * 100;
  return Math.round(Math.min(96, Math.max(4, p)));
}

/** { homes: 12, newHomes: 4 } → "12 homes · 4 new"; "1 home"; nothing new → "7 homes"; null → "". */
export function summaryText(summary: AskResponse["summary"] | undefined): string {
  if (!summary) return "";
  const homes = Math.max(0, Math.round(summary.homes));
  const isNew = Math.max(0, Math.round(summary.newHomes));
  const head = `${homes} ${homes === 1 ? "home" : "homes"}`;
  return isNew > 0 ? `${head} · ${isNew} new` : head;
}

/** "Ramirez family · FRV $3,200" (the line under the title). */
export function claimLine(claim: { name: string; frv: number | null } | null): string {
  if (!claim) return "No claim open";
  const frv = claim.frv != null && Number.isFinite(claim.frv) && claim.frv > 0 ? ` · FRV $${Math.round(claim.frv).toLocaleString("en-US")}` : "";
  return `${claim.name}${frv}`;
}

/** What the person typed, ready to send: trimmed and capped. "" means there is nothing to send. */
export const cleanInput = (text: string): string => text.replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, MAX_CHARS);

/** Spoken words joined onto what was already in the box. */
export function joinSpeech(before: string, spoken: string): string {
  const a = before.replace(/\s+$/g, "");
  const b = spoken.trim();
  return (a && b ? `${a} ${b}` : a || b).slice(0, MAX_CHARS);
}

// ---------- The request ----------

/** What the hook is asked to do; turned into an `AskRequest` body by `askBody`. */
export type Ask =
  | { action: "open" }
  | { action: "message"; message: string }
  | { action: "reject"; listingId: string; name?: string }
  | { action: "more_like"; listingId: string; name?: string }
  | { action: "undo" };

/** The exact JSON body for POST /api/claim/:id/ask. `user` is left out when no name is remembered. */
export function askBody(ask: Ask, user?: string | null): AskRequest {
  const body: AskRequest = { action: ask.action };
  if (ask.action === "message") body.message = ask.message.slice(0, 1000);
  if (ask.action === "reject" || ask.action === "more_like") body.listingId = ask.listingId;
  const name = (user ?? "").trim().slice(0, 80);
  if (name) body.user = name;
  return body;
}

/** The line shown as the person's own message for a request. `open` shows nothing. */
export function askLabel(ask: Ask): string | null {
  switch (ask.action) {
    case "open":
      return null;
    case "message":
      return ask.message;
    case "undo":
      return COPY.undo;
    case "reject":
      return ask.name ? `Not ${ask.name}` : "Not this one";
    case "more_like":
      return ask.name ? `More like ${ask.name}` : "More like this one";
  }
}

/** Error copy for a failed request. 429 gets its own line, because trying again at once would not help. */
export function errorCopy(status: number): string {
  return status === 429 ? COPY.rateLimited : COPY.error;
}

// ---------- State ----------

/** A line in the log. `result` adds the summary card under an agent message; `note` is a system line (Stop). */
export interface ChatEntry extends ChatMessage {
  result?: { homes: number; newHomes: number } | null;
  note?: boolean;
}

export type AgentStatus = { kind: "idle" } | { kind: "running"; startedAt: number } | { kind: "error"; message: string };

export interface ChatState {
  /** The claim these messages belong to. */
  claimId: string | null;
  messages: ChatEntry[];
  status: AgentStatus;
  /** The last `summary` the agent gave for this claim. */
  summary: AskResponse["summary"];
  searchId: string | null;
  versionNo: number | null;
  /** `open` has been sent (and answered or is on its way) for this claim. */
  opened: boolean;
  /** What "Try again" resends. */
  last: Ask | null;
  /** New homes found while the window was closed (the bubble badge). */
  unseen: number;
  /** Counter for message ids. */
  seq: number;
}

export const initialChat = (claimId: string | null = null): ChatState => ({
  claimId,
  messages: [],
  status: { kind: "idle" },
  summary: null,
  searchId: null,
  versionNo: null,
  opened: false,
  last: null,
  unseen: 0,
  seq: 0,
});

export type ChatAction =
  /** Another claim (or none) is open: start clean. */
  | { type: "reset"; claimId: string | null }
  /** A request left the browser. `again` = "Try again": the person's line is already in the log. */
  | { type: "sent"; ask: Ask; at: number; again?: boolean }
  /** The route answered 200. `seen` = the window was open when it landed. */
  | { type: "answered"; response: AskResponse; at: number; seen: boolean }
  /** The route failed, or the request timed out. */
  | { type: "failed"; message: string }
  /** The person pressed Stop. */
  | { type: "stopped"; at: number }
  /** The window was opened: the badge has been seen. */
  | { type: "seen" };

const iso = (at: number) => new Date(at).toISOString();
const trim = (list: ChatEntry[]) => (list.length > MAX_MESSAGES ? list.slice(list.length - MAX_MESSAGES) : list);

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "reset":
      return action.claimId === state.claimId ? state : initialChat(action.claimId);

    case "sent": {
      const label = action.again ? null : askLabel(action.ask);
      const seq = label ? state.seq + 1 : state.seq;
      const messages = label ? trim([...state.messages, { id: `u${seq}`, role: "user" as const, text: label, at: iso(action.at) }]) : state.messages;
      return { ...state, seq, messages, status: { kind: "running", startedAt: action.at }, last: action.ask, opened: state.opened || action.ask.action === "open" };
    }

    case "answered": {
      const r = action.response;
      const seq = state.seq + 1;
      const text = (r.say ?? "").trim();
      const entry: ChatEntry = { id: `a${seq}`, role: "agent", text: text || (r.ok ? "Done." : COPY.error), at: iso(action.at), result: r.ok ? r.summary : null };
      return {
        ...state,
        seq,
        messages: trim([...state.messages, entry]),
        status: { kind: "idle" },
        summary: r.ok ? (r.summary ?? state.summary) : state.summary,
        searchId: r.searchId ?? state.searchId,
        versionNo: r.versionNo ?? state.versionNo,
        unseen: action.seen ? 0 : r.ok && r.summary ? Math.max(0, r.summary.newHomes) : state.unseen,
      };
    }

    case "failed":
      // An `open` that failed may be sent again the next time the window opens.
      return { ...state, status: { kind: "error", message: action.message }, opened: state.last?.action === "open" ? false : state.opened };

    case "stopped": {
      if (state.status.kind !== "running") return state;
      const seq = state.seq + 1;
      return {
        ...state,
        seq,
        messages: trim([...state.messages, { id: `n${seq}`, role: "agent", text: COPY.stopped, at: iso(action.at), note: true }]),
        status: { kind: "idle" },
        opened: state.last?.action === "open" ? false : state.opened,
      };
    }

    case "seen":
      return state.unseen === 0 ? state : { ...state, unseen: 0 };
  }
}

/** Undo has something to go back to once the search is past its first version. */
export const canUndo = (state: Pick<ChatState, "versionNo" | "status">): boolean => state.status.kind !== "running" && (state.versionNo ?? 0) > 1;

/** The id of the newest message that carries a result card (only that one offers Undo / Show on map). */
export function latestResultId(messages: ChatEntry[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].result) return messages[i].id;
  return null;
}
