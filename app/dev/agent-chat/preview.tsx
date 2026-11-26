"use client";

import { useEffect, useState } from "react";
import { AgentBubble } from "@/components/AgentBubble";
import { AgentChat } from "@/components/AgentChat";
import type { SheetSnap } from "@/components/ResultsSheet";
import { COPY, type AgentStatus, type ChatEntry } from "@/lib/agent-chat-ui";
import { useAgentChat } from "@/lib/use-agent-chat";
import type { SpeechControls } from "@/lib/use-speech";

// Fictional data, copied from tests/fixtures/map-agent.mjs.
const CLAIM = { id: "9900000001", name: "Ramirez family", frv: 3200 };
const HOMES = {
  outside: { id: "11111111-1111-4111-8111-111111111101", name: "4100 Sample Ave" },
  db: { id: "9900000101", name: "1418 Juniper Ct" },
};
const TALK: ChatEntry[] = [
  { id: "m1", role: "agent", text: "Found 7 homes that fit.", at: "2026-11-26T15:04:05.000Z", result: { homes: 7, newHomes: 2 } },
  { id: "m2", role: "user", text: "under 3k and a bit wider", at: "2026-11-26T15:05:10.000Z" },
  { id: "m3", role: "agent", text: "Capping rent at $3,000 and widening to 30 miles. Found 9 homes that fit.", at: "2026-11-26T15:05:48.000Z", result: { homes: 9, newHomes: 3 } },
];
const NO_SPEECH: SpeechControls = { supported: false, listening: false, blocked: false, start() {}, stop() {}, toggle() {} };
const IDLE: AgentStatus = { kind: "idle" };
const noop = () => {};

interface Props {
  view: "live" | "states";
  claim?: string;
  home?: string;
  snap?: string;
  panel: boolean;
  hidden: boolean;
}

export function AgentChatPreview(props: Props) {
  return props.view === "states" ? <States /> : <Live {...props} />;
}

function ThemeButton() {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink"
      onClick={() => {
        const el = document.documentElement;
        el.setAttribute("data-theme", el.getAttribute("data-theme") === "dark" ? "light" : "dark");
      }}
    >
      Theme
    </button>
  );
}

const MAP_BG = { backgroundImage: "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)", backgroundSize: "48px 48px" };

/** The bubble and window as the coordinator will wire them: inside the map's `div.relative`, driven by the hook. */
function Live({ claim, home, snap, panel, hidden }: Props) {
  const [open, setOpen] = useState(false);
  const [hasClaim, setHasClaim] = useState(claim !== "none");
  const [changed, setChanged] = useState(0);
  const [claimsOpened, setClaimsOpened] = useState(0);
  const selectedHome = home === "outside" ? HOMES.outside : home === "db" ? HOMES.db : null;
  const sheetSnap: SheetSnap = snap === "half" || snap === "expanded" ? snap : "collapsed";
  const chat = useAgentChat({ claimId: hasClaim ? CLAIM.id : null, open, onChanged: () => setChanged((n) => n + 1) });

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-sm">
        <b className="font-medium">Agent chat preview</b>
        <span className="flex-1" />
        <span data-preview-changed={changed} data-preview-claims={claimsOpened} className="text-xs text-muted">
          re-read {changed}
        </span>
        <button type="button" data-preview-claim="" className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-2.5 text-xs font-medium" onClick={() => setHasClaim((v) => !v)}>
          {hasClaim ? "Close claim" : "Open claim"}
        </button>
        <ThemeButton />
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 border-r border-line bg-surface p-4 text-xs text-muted lg:block">Rail (search, filters, results)</aside>
        <div data-preview-map="" className="relative min-w-0 flex-1 overflow-hidden bg-surface-muted" style={MAP_BG}>
          <span className="absolute top-3 left-3 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted">Map</span>
          <AgentBubble open={open} onOpenChange={setOpen} badge={chat.badge} running={chat.running} noClaim={!hasClaim} sheetSnap={sheetSnap} hidden={hidden} />
          <AgentChat
            open={open}
            onClose={() => setOpen(false)}
            claim={hasClaim ? CLAIM : null}
            selectedHome={selectedHome}
            messages={chat.messages}
            status={chat.status}
            canUndo={chat.canUndo}
            onSend={(text) => chat.send(text)}
            onMoreLike={chat.moreLike}
            onStop={chat.stop}
            onUndo={chat.undo}
            onRetry={chat.retry}
            onOpenClaims={() => setClaimsOpened((n) => n + 1)}
          />
          <div className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-center border-t border-line bg-surface text-xs text-muted lg:hidden" style={sheetSnap === "half" ? { height: "50dvh" } : undefined}>
            Results sheet ({sheetSnap})
          </div>
        </div>
        {panel && <aside data-preview-panel="" className="hidden w-[400px] shrink-0 border-l border-line bg-surface p-4 text-xs text-muted lg:block">Docked property panel</aside>}
      </div>
    </div>
  );
}

function Box({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <figure data-state-box={name} className="flex flex-col gap-2">
      <figcaption className="nh-eyebrow">{name}</figcaption>
      <div className="relative h-[560px] w-full max-w-[384px] overflow-hidden rounded-lg border border-line bg-surface-muted" style={MAP_BG}>
        {children}
      </div>
    </figure>
  );
}

/** Every state from the spec, static (no requests). */
function States() {
  // Mounted only in the browser: the running card shows a clock.
  const [ready, setReady] = useState(false);
  const [startedAt] = useState(() => Date.now() - 34_000);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  const base = { open: true, onClose: noop, claim: CLAIM, messages: TALK, status: IDLE, canUndo: true, onSend: noop, onStop: noop, onUndo: noop, onRetry: noop, onOpenClaims: noop, modal: false, speech: NO_SPEECH, className: "bottom-3 h-[calc(100%-24px)]" };
  const mic = { ...NO_SPEECH, supported: true };
  return (
    // The app locks page scroll (globals.css), so this page scrolls inside its own box.
    <div data-states-scroll="" className="h-dvh overflow-y-auto bg-bg p-4 text-ink">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-sm font-medium">Agent chat: every state</h1>
        <ThemeButton />
      </div>
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,328px),1fr))]">
        <Box name="Empty (claim open)">
          <AgentChat {...base} messages={[]} canUndo={false} speech={mic} />
        </Box>
        <Box name="No claim">
          <AgentChat {...base} claim={null} messages={[]} canUndo={false} speech={mic} />
        </Box>
        <Box name="Result, home selected">
          <AgentChat {...base} selectedHome={HOMES.db} speech={mic} />
        </Box>
        <Box name="Running">
          <AgentChat {...base} messages={[...TALK, { id: "m4", role: "user", text: "Cheaper", at: "2026-11-26T15:06:10.000Z" }]} status={{ kind: "running", startedAt }} speech={mic} />
        </Box>
        <Box name="Error">
          <AgentChat {...base} messages={[...TALK, { id: "m4", role: "user", text: "Cheaper", at: "2026-11-26T15:06:10.000Z" }]} status={{ kind: "error", message: COPY.error }} />
        </Box>
        <Box name="Stopped">
          <AgentChat {...base} messages={[...TALK, { id: "m4", role: "user", text: "Cheaper", at: "2026-11-26T15:06:10.000Z" }, { id: "m5", role: "agent", text: COPY.stopped, at: "2026-11-26T15:06:30.000Z", note: true }]} />
        </Box>
        <Box name="Listening">
          <AgentChat {...base} speech={{ ...mic, listening: true }} />
        </Box>
        <Box name="Mic blocked">
          <AgentChat {...base} speech={{ ...NO_SPEECH, blocked: true }} />
        </Box>
        <Box name="First result (nothing to undo)">
          <AgentChat {...base} canUndo={false} messages={TALK.slice(0, 1)} />
        </Box>
        <Box name="Bubble: closed · badge · running · open · no claim">
          <div className="absolute inset-0 flex flex-wrap content-start items-start gap-6 p-6">
            {[
              { open: false },
              { open: false, badge: 4 },
              { open: false, running: true },
              { open: false, running: true, badge: 12 },
              { open: true },
              { open: false, noClaim: true },
              { open: false, disabled: true },
            ].map((p, i) => (
              <span key={i} className="relative h-12 w-12">
                <AgentBubble {...p} onOpenChange={noop} className="relative right-0 bottom-0 lg:bottom-0 max-lg:bottom-0" />
              </span>
            ))}
          </div>
        </Box>
      </div>
    </div>
  );
}
