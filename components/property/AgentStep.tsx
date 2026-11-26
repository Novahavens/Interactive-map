"use client";

import { useState } from "react";
import { Check, MessageSquare, RotateCcw, X as XIcon } from "lucide-react";
import { homeActions, type AgentHome } from "@/lib/agent-graph";
import { cn } from "@/lib/utils";

export type AgentSend = (ev: Record<string, unknown>) => Promise<boolean>;

interface Props {
  home: AgentHome | null;
  /** Monday item id of the property (the agent's home key). */
  homeKey: string;
  /** The listing page the landlord is messaged on (Furnished Finder and the like). */
  listingUrl: string | null;
  send: AgentSend;
}

const EXT_ID = process.env.NEXT_PUBLIC_NH_EXTENSION_ID ?? "";

type ChromeExt = { runtime?: { sendMessage?: (id: string, msg: unknown, cb: (r: { ok?: boolean } | undefined) => void) => void } };

/** Opens the listing beside the map with the agent's draft in its message box. A person still presses Send. */
function openInExtension(url: string, homeId: string, draft: string): Promise<boolean> {
  const chrome = (globalThis as { chrome?: ChromeExt }).chrome;
  if (!EXT_ID || !chrome?.runtime?.sendMessage) return Promise.resolve(false);
  return new Promise((resolve) => chrome.runtime!.sendMessage!(EXT_ID, { type: "open-listing", url, homeId, draft }, (r) => resolve(!!r?.ok)));
}

/**
 * Where the claims agent has this home (flag `agentGraph`): its step, what it waits on, and the one thing a
 * person can do here. Tick or X only when the agent suggested it; Message landlord once it is accepted.
 */
export default function AgentStep({ home, homeKey, listingUrl, send }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!home) return <p className="text-xs text-muted">The agent isn&apos;t working this home.</p>;
  const can = homeActions(home.status);

  const act = async (ev: Record<string, unknown>, done: string) => {
    setBusy(true);
    setNote(null);
    const ok = await send({ homeKey, ...ev });
    setBusy(false);
    setNote(ok ? done : "That didn't go through. Try again.");
  };

  const message = async () => {
    if (!listingUrl || !home.draft) return;
    const ok = await openInExtension(listingUrl, homeKey, home.draft);
    if (!ok) {
      try {
        await navigator.clipboard.writeText(home.draft);
        setNote("Message copied. Paste it on the listing.");
      } catch {
        setNote("Couldn't open the listing. Install the Nova Havens extension.");
      }
    }
  };

  const btn = "inline-flex h-8 [@media(pointer:coarse)]:h-[44px] items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium disabled:opacity-50";
  return (
    <div className="flex flex-col gap-2" data-agent-step={home.status}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{home.label}</span>
        {home.waitingOn && <span className="truncate text-xs text-muted">Waiting on {home.waitingOn}</span>}
      </div>
      {(can.pick || can.message || can.sendBack) && (
        <div className="flex flex-wrap gap-1.5">
          {can.pick && (
            <>
              <button type="button" disabled={busy} className={cn(btn, "border-ok-line bg-ok-bg text-ok-ink")} onClick={() => act({ type: "human_pick", decision: "accept" }, "Ticked. The agent will message the landlord.")}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Use this home
              </button>
              <button type="button" disabled={busy} className={cn(btn, "border-line2 text-ink")} onClick={() => act({ type: "human_pick", decision: "decline" }, "Crossed off.")}>
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" /> Not this one
              </button>
            </>
          )}
          {can.message && home.draft && listingUrl && (
            <button type="button" className={cn(btn, "border-line2 text-ink")} onClick={message}>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Message landlord
            </button>
          )}
          {can.sendBack && (
            <>
              <button type="button" disabled={busy} className={cn(btn, "border-line2 text-ink")} onClick={() => act({ type: "person_action", action: "resume", resumeTo: "messaged" }, "Sent back to the agent.")}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Hand back to agent
              </button>
              <button type="button" disabled={busy} className={cn(btn, "border-line2 text-ink")} onClick={() => act({ type: "person_action", action: "drop" }, "Dropped.")}>
                Drop
              </button>
            </>
          )}
        </div>
      )}
      {note && (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
