"use client";

import { ChevronDown, MessageCircle } from "lucide-react";
import { COPY } from "@/lib/agent-chat-ui";
import { cn } from "@/lib/utils";
import type { SheetSnap } from "@/components/ResultsSheet";

/** The chat window's element id: the bubble's `aria-controls`, and how the window finds the bubble to hand focus back. */
export const AGENT_CHAT_ID = "nh-agent-chat";
export const AGENT_BUBBLE_ID = "nh-agent-bubble";

export interface AgentBubbleProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** New homes found while the chat was closed. Shown top-right while closed; 0 hides it. */
  badge?: number;
  /** A search is running: spinner ring, so it shows with the chat closed. */
  running?: boolean;
  /** No claim is open. The bubble still opens the chat (which says "Pick a claim first"), drawn outlined instead of filled. */
  noClaim?: boolean;
  disabled?: boolean;
  /** Phones: where the results sheet is, so the bubble sits above it. Ignored on lg+. */
  sheetSnap?: SheetSnap;
  /** Phones with the sheet expanded or the property panel open: not drawn at all. */
  hidden?: boolean;
  className?: string;
}

/**
 * The round button at the bottom right of the MAP container. Render it inside the map's `div.relative`
 * (it is `position: absolute`), so it can never sit over the docked panel.
 */
export function AgentBubble({ open, onOpenChange, badge = 0, running = false, noClaim = false, disabled = false, sheetSnap = "collapsed", hidden = false, className }: AgentBubbleProps) {
  if (hidden) return null;
  const count = Math.max(0, Math.round(badge));
  const showBadge = count > 0 && !open;
  // "expanded" hides the bubble on phones only; on lg+ there is no sheet.
  const phonePlace = sheetSnap === "expanded" ? "max-lg:hidden" : sheetSnap === "half" ? "max-lg:bottom-[calc(50dvh+12px)]" : "max-lg:bottom-[68px]";
  return (
    <button
      type="button"
      id={AGENT_BUBBLE_ID}
      data-agent-bubble=""
      data-state={open ? "open" : "closed"}
      aria-label={open ? COPY.bubbleClose : COPY.bubbleOpen}
      aria-expanded={open}
      aria-controls={AGENT_CHAT_ID}
      aria-describedby={showBadge || running || noClaim ? `${AGENT_BUBBLE_ID}-note` : undefined}
      title={noClaim && !open ? "Pick a claim first" : undefined}
      disabled={disabled}
      onClick={() => onOpenChange(!open)}
      className={cn(
        "absolute right-[12px] z-20 inline-flex h-[48px] w-[48px] items-center justify-center rounded-full border border-ink shadow-[0_6px_20px_rgba(0,0,0,.28)]",
        "transition-[bottom,filter] duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        "lg:bottom-[24px]",
        phonePlace,
        noClaim ? "bg-surface text-ink" : "bg-ink text-bg",
        className,
      )}
    >
      {open ? <ChevronDown className="h-[20px] w-[20px]" aria-hidden="true" /> : <MessageCircle className="h-[20px] w-[20px]" aria-hidden="true" />}
      {running && (
        <span
          data-agent-bubble-ring=""
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[5px] rounded-full border-2 border-line2 border-t-ink motion-safe:animate-spin"
        />
      )}
      {showBadge && (
        <span
          data-agent-bubble-badge=""
          aria-hidden="true"
          className="absolute -top-[4px] -right-[4px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-ink bg-surface px-[5px] text-[11px] leading-none font-semibold text-ink"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span id={`${AGENT_BUBBLE_ID}-note`} className="sr-only">
        {[running ? "Searching." : "", showBadge ? `${count} new ${count === 1 ? "home" : "homes"}.` : "", noClaim ? "Pick a claim first." : ""].filter(Boolean).join(" ")}
      </span>
    </button>
  );
}

export default AgentBubble;
