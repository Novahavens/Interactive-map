"use client";

// The browser side of the agent chat: owns the message list for the open claim and every call to
// POST /api/claim/:id/ask. The server keeps no transcript, so the messages live here, in memory, and are
// dropped when another claim is opened. (lib/agent-chat.ts is the server side; this file never imports it.)
import { useCallback, useEffect, useReducer, useRef } from "react";
import { readReporterName } from "@/components/property/ReportBadLink";
import { COPY, TIMEOUT_MS, askBody, canUndo, chatReducer, cleanInput, errorCopy, initialChat, isListingId, type AgentStatus, type Ask, type ChatEntry } from "@/lib/agent-chat-ui";
import type { AskResponse } from "@/lib/types";

/** When the agent says a search is still going, look again after these waits. */
const RECHECK_MS = [15_000, 45_000];

export interface UseAgentChatOptions {
  /** The open claim's Monday item id, or null when none is open. */
  claimId: string | null;
  /** Whether the chat window is open. The first time it is open for a claim, `open` is sent. */
  open: boolean;
  /** False (the `chat` flag is off) makes the hook inert: no requests at all. Default true. */
  enabled?: boolean;
  /** Called after every `ok: true` answer (and again later while a search is still running): re-read /outside. */
  onChanged?: (response: AskResponse) => void;
}

export interface AgentChat {
  messages: ChatEntry[];
  status: AgentStatus;
  /** True while a request is out (same as `status.kind === "running"`). */
  running: boolean;
  /** Homes that fit after the last step, and how many are new. Null until the agent has listed homes. */
  summary: AskResponse["summary"];
  searchId: string | null;
  canUndo: boolean;
  /** New homes found while the window was closed: the bubble badge. */
  badge: number;
  /** Send what the person typed, said or tapped. Ignored when empty, with no claim, or while a search runs. */
  send(text: string): void;
  /** "Not this one" for an outside listing. */
  reject(listingId: string, name?: string): void;
  /** "More like this one". Falls back to a plain message when the home is not an outside listing. */
  moreLike(home: { id: string; name: string }): void;
  undo(): void;
  /** Abort the request that is out. */
  stop(): void;
  /** Resend the last request after an error. */
  retry(): void;
}

export function useAgentChat({ claimId, open, enabled = true, onChanged }: UseAgentChatOptions): AgentChat {
  const [state, dispatch] = useReducer(chatReducer, claimId, initialChat);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(open);
  openRef.current = open;
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const flight = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancel = useCallback(() => {
    flight.current?.abort();
    flight.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(
    async (ask: Ask, again = false) => {
      const id = stateRef.current.claimId;
      if (!enabled || !id || flight.current) return;
      const ctl = new AbortController();
      flight.current = ctl;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        ctl.abort();
      }, TIMEOUT_MS);
      dispatch({ type: "sent", ask, at: Date.now(), again });
      const mine = () => flight.current === ctl;
      try {
        const res = await fetch(`/api/claim/${encodeURIComponent(id)}/ask`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(askBody(ask, readReporterName())),
          signal: ctl.signal,
        });
        const json = (await res.json().catch(() => null)) as AskResponse | null;
        if (!mine()) return;
        if (!res.ok || !json || typeof json.say !== "string") {
          dispatch({ type: "failed", message: errorCopy(res.status) });
          return;
        }
        dispatch({ type: "answered", response: json, at: Date.now(), seen: openRef.current });
        if (json.ok) {
          onChangedRef.current?.(json);
          if (json.running) timers.current = RECHECK_MS.map((ms) => setTimeout(() => onChangedRef.current?.(json), ms));
        }
      } catch {
        // Stop and a claim change abort on purpose and have already said so; only a timeout or a network failure lands here as an error.
        if (mine() && (timedOut || !ctl.signal.aborted)) dispatch({ type: "failed", message: COPY.error });
      } finally {
        clearTimeout(timeout);
        if (mine()) flight.current = null;
      }
    },
    [enabled],
  );

  // Another claim: drop the request that is out, the timers and the messages.
  useEffect(() => {
    if (stateRef.current.claimId === claimId) return;
    cancel();
    stateRef.current = initialChat(claimId);
    dispatch({ type: "reset", claimId });
  }, [claimId, cancel]);

  // Unmount: abort what is out. Deferred one tick so React's development double-mount does not abort the first request.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) cancel();
      }, 0);
    };
  }, [cancel]);

  // First time the window is open for this claim: say hello (`open`). Opening also clears the badge.
  useEffect(() => {
    if (!open) return;
    dispatch({ type: "seen" });
    if (enabled && claimId && state.claimId === claimId && !state.opened && state.status.kind === "idle") void run({ action: "open" });
  }, [open, enabled, claimId, state.claimId, state.opened, state.status.kind, run]);

  const send = useCallback(
    (text: string) => {
      const message = cleanInput(text);
      if (message) void run({ action: "message", message });
    },
    [run],
  );
  const reject = useCallback((listingId: string, name?: string) => void (isListingId(listingId) && run({ action: "reject", listingId, name })), [run]);
  const moreLike = useCallback(
    (home: { id: string; name: string }) => void run(isListingId(home.id) ? { action: "more_like", listingId: home.id, name: home.name } : { action: "message", message: cleanInput(`More like ${home.name}`) }),
    [run],
  );
  const undo = useCallback(() => void run({ action: "undo" }), [run]);
  const stop = useCallback(() => {
    if (!flight.current) return;
    cancel();
    dispatch({ type: "stopped", at: Date.now() });
  }, [cancel]);
  const retry = useCallback(() => {
    const last = stateRef.current.last;
    if (stateRef.current.status.kind === "error" && last) void run(last, true);
  }, [run]);

  return {
    messages: state.messages,
    status: state.status,
    running: state.status.kind === "running",
    summary: state.summary,
    searchId: state.searchId,
    canUndo: canUndo(state),
    badge: state.unseen,
    send,
    reject,
    moreLike,
    undo,
    stop,
    retry,
  };
}
