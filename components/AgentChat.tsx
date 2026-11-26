"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Mic, Square, Undo2, X } from "lucide-react";
import { AGENT_BUBBLE_ID, AGENT_CHAT_ID } from "@/components/AgentBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { COPY, MAX_CHARS, claimLine, cleanInput, joinSpeech, latestResultId, runningLine, runningPercent, suggestionsFor, summaryText, type AgentStatus, type ChatEntry } from "@/lib/agent-chat-ui";
import { useSpeech, type SpeechControls } from "@/lib/use-speech";
import { cn } from "@/lib/utils";

export type { AgentStatus, ChatEntry } from "@/lib/agent-chat-ui";

export interface AgentChatProps {
  open: boolean;
  onClose(): void;
  /** The open claim, or null: then the window says "Pick a claim first" and the prompt box is disabled. */
  claim: { id: string; name: string; frv: number | null } | null;
  /** The home open in the panel, if any: adds the "More like this one" chip. */
  selectedHome?: { id: string; name: string } | null;
  messages: ChatEntry[];
  status: AgentStatus;
  canUndo: boolean;
  onSend(text: string, via: "typed" | "voice" | "chip"): void;
  /** "More like this one". Without it the chip sends its text through `onSend`. */
  onMoreLike?(home: { id: string; name: string }): void;
  onStop(): void;
  onUndo(): void;
  onRetry(): void;
  /** "Open claims" in the no-claim state. */
  onOpenClaims(): void;
  /** Phone sheet only: "Show on map" on the newest result card. Default: close the window. */
  onShowOnMap?(): void;
  /** true = full-width modal bottom sheet, false = window anchored in the map. Default: modal under 1024 px. */
  modal?: boolean;
  /** For previews and tests: stand-in for the browser's speech-to-text. */
  speech?: SpeechControls;
  className?: string;
}

const NARROW = "(max-width: 1023.98px)";
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

const focusBubble = () => document.getElementById(AGENT_BUBBLE_ID)?.focus();

const TOUCH_H = "[@media(pointer:coarse)]:h-[44px]";
const SMALL_BTN = cn(
  "inline-flex h-[28px] shrink-0 items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px] font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface [@media(pointer:coarse)]:px-2.5",
  TOUCH_H,
);
const ROUND_BTN =
  "inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border disabled:cursor-not-allowed disabled:opacity-45 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]";

/**
 * The chat window for the open claim. Desktop: a window anchored bottom-right of the MAP container (render it
 * inside the map's `div.relative`, right after <AgentBubble>), not modal. Under 1024 px: a modal bottom sheet.
 * It keeps only the text being typed; the messages and the requests belong to `useAgentChat`.
 */
export function AgentChat({
  open,
  onClose,
  claim,
  selectedHome = null,
  messages,
  status,
  canUndo,
  onSend,
  onMoreLike,
  onStop,
  onUndo,
  onRetry,
  onOpenClaims,
  onShowOnMap,
  modal: modalProp,
  speech: speechProp,
  className,
}: AgentChatProps) {
  const narrow = useNarrow();
  const modal = modalProp ?? narrow;
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const spokenBase = useRef("");
  const spoken = useRef(false);

  const ownSpeech = useSpeech(
    useCallback((text: string) => {
      spoken.current = true;
      setValue(joinSpeech(spokenBase.current, text));
    }, []),
  );
  const speech = speechProp ?? ownSpeech;
  const stopSpeech = speech.stop;

  const running = status.kind === "running";
  const listening = speech.listening && !!claim;
  const text = cleanInput(value);
  const canSend = !!claim && !running && text.length > 0;

  // Another claim: what was being typed belonged to the last one.
  const claimId = claim?.id ?? null;
  useEffect(() => {
    setValue("");
    spoken.current = false;
  }, [claimId]);

  // Closed: the mic goes off.
  useEffect(() => {
    if (!open) stopSpeech();
  }, [open, stopSpeech]);

  // Desktop: focus the box on open. (The phone sheet does it in onOpenAutoFocus.)
  useEffect(() => {
    if (open && !modal) inputRef.current?.focus({ preventScroll: true });
  }, [open, modal]);

  // Keep the newest line in view.
  useEffect(() => {
    if (!open) return;
    const view = scrollRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (view) view.scrollTop = view.scrollHeight;
  }, [open, messages.length, status.kind]);

  // Browsers without `field-sizing: content` (Firefox): grow the box by hand, 1–5 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || typeof CSS === "undefined" || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 102)}px`;
  }, [value, open]);

  function submit() {
    if (!canSend) return;
    const via = spoken.current ? "voice" : "typed";
    stopSpeech();
    spoken.current = false;
    setValue("");
    onSend(text, via);
  }

  function toggleMic() {
    if (!speech.listening) spokenBase.current = value;
    speech.toggle();
    inputRef.current?.focus({ preventScroll: true });
  }

  function close() {
    stopSpeech();
    onClose();
  }

  const chips = claim ? suggestionsFor(selectedHome) : [];
  const newestResult = latestResultId(messages);

  const body = (
    <>
      <div className="flex items-center gap-2 border-b border-line py-2.5 pr-2.5 pl-3.5">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          {modal ? <SheetTitle className="text-[14px] font-semibold text-ink">{COPY.title}</SheetTitle> : <h2 className="text-[14px] font-semibold text-ink">{COPY.title}</h2>}
          <span data-agent-claim="" className="truncate text-[12px] text-muted">
            {claimLine(claim)}
          </span>
        </div>
        {claim && (
          <button type="button" data-agent-undo="" className={SMALL_BTN} disabled={!canUndo || running} onClick={onUndo} title={canUndo ? "Go back to the search before" : "There is no earlier search to go back to"}>
            <Undo2 className="h-[14px] w-[14px]" aria-hidden="true" />
            {COPY.undo}
          </button>
        )}
        <button type="button" data-agent-close="" aria-label="Close chat" className={cn(SMALL_BTN, "w-[28px] px-0 [@media(pointer:coarse)]:w-[44px] [@media(pointer:coarse)]:px-0")}
          onClick={() => {
            close();
            // The window is not modal on desktop, so nothing else hands focus back. (The phone sheet does it itself.)
            if (!modal) focusBubble();
          }}
        >
          <X className="h-[16px] w-[16px]" aria-hidden="true" />
        </button>
      </div>

      <ScrollArea ref={scrollRef} className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-2 px-3.5 py-3">
          <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-2">
            {!claim ? (
              <div data-agent-noclaim="" className="flex flex-col items-start gap-2 text-[13px] leading-snug text-muted">
                <p>{COPY.noClaim}</p>
                <button type="button" className={cn(SMALL_BTN, "h-[32px] px-3 text-[13px]")} onClick={onOpenClaims}>
                  {COPY.openClaims}
                </button>
              </div>
            ) : (
              <>
                {messages.length === 0 && <Bubble who="agent" text={COPY.empty} />}
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    action={
                      m.id !== newestResult ? null : modal ? (
                        <button type="button" data-agent-show="" className={cn(SMALL_BTN, "ml-auto")} onClick={onShowOnMap ?? close}>
                          {COPY.showOnMap}
                        </button>
                      ) : canUndo ? (
                        <button type="button" className={cn(SMALL_BTN, "ml-auto h-[26px]")} disabled={running} onClick={onUndo}>
                          <Undo2 className="h-[14px] w-[14px]" aria-hidden="true" />
                          {COPY.undo}
                        </button>
                      ) : null
                    }
                  />
                ))}
              </>
            )}
          </div>
          {claim && status.kind === "running" && <RunningCard startedAt={status.startedAt} onStop={onStop} />}
          {claim && status.kind === "error" && (
            <div role="alert" data-agent-error="" className="flex items-center gap-2 rounded-md border border-bad-line bg-bad-bg p-2 text-[12px] text-bad-ink">
              <span className="min-w-0 flex-1">
                {status.message === COPY.error ? (
                  <>
                    <b className="font-semibold">{COPY.errorLead}</b> {COPY.errorTail}
                  </>
                ) : (
                  status.message
                )}
              </span>
              <button type="button" data-agent-retry="" className={cn(SMALL_BTN, "h-[26px]")} onClick={onRetry}>
                {COPY.retry}
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      {speech.blocked && (
        <p data-agent-mic-blocked="" role="status" className="px-3.5 pb-2 text-[12px] text-muted">
          {COPY.micBlocked}
        </p>
      )}

      {chips.length > 0 && (
        <div role="group" aria-label="Suggestions" data-agent-chips="" className={cn("flex flex-wrap gap-1.5 px-2.5 pb-2", running && "opacity-50")}>
          {chips.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={running}
              title={s.key === "moreLike" ? s.text : undefined}
              onClick={() => {
                stopSpeech();
                if (s.key === "moreLike" && onMoreLike && selectedHome) onMoreLike(selectedHome);
                else onSend(s.text, "chip");
              }}
              className={cn(
                "inline-flex h-[28px] items-center rounded-full border border-line2 bg-surface px-2.5 text-[12px] font-medium whitespace-nowrap text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:hover:bg-surface [@media(pointer:coarse)]:px-3.5",
                TOUCH_H,
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form
        data-agent-prompt=""
        data-listening={listening ? "true" : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "mx-2.5 mb-2.5 rounded-2xl border bg-surface pt-2 pr-2 pb-1.5 pl-3",
          listening ? "border-ink" : "border-line2 focus-within:border-focus focus-within:shadow-[0_0_0_1px_var(--focus)]",
          !claim && "opacity-60",
        )}
      >
        <Textarea
          ref={inputRef}
          rows={1}
          value={value}
          maxLength={MAX_CHARS}
          disabled={!claim}
          aria-label="Message the housing agent"
          placeholder={listening ? COPY.placeholderListening : running ? COPY.placeholderRunning : COPY.placeholder}
          onChange={(e) => {
            // Typing takes over from the mic: what is heard after this would overwrite the edit.
            spoken.current = false;
            stopSpeech();
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="block max-h-[102px] min-h-[22px] resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-0.5 text-[14px] leading-[1.4] text-ink shadow-none placeholder:text-muted focus-visible:border-0 focus-visible:ring-0 md:text-[14px] dark:bg-transparent [@media(pointer:coarse)]:text-base"
        />
        <div className="mt-1 flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
            {listening ? COPY.hintListening : <span className="[@media(pointer:coarse)]:hidden">{claim && !running ? COPY.hint : ""}</span>}
          </span>
          {speech.supported && claim && (
            <button
              type="button"
              data-agent-mic=""
              aria-label="Speak"
              aria-pressed={listening}
              title={listening ? COPY.hintListening : "Speak instead of typing"}
              onClick={toggleMic}
              className={cn(ROUND_BTN, listening ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink hover:bg-surface-muted")}
            >
              <Mic className="h-[16px] w-[16px]" aria-hidden="true" />
            </button>
          )}
          <button type="submit" data-agent-send="" aria-label="Send" disabled={!canSend} className={cn(ROUND_BTN, "border-ink bg-ink text-bg hover:brightness-110")}>
            <ArrowUp className="h-[16px] w-[16px]" aria-hidden="true" />
          </button>
        </div>
      </form>
    </>
  );

  if (modal) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && close()}>
        <SheetContent
          id={AGENT_CHAT_ID}
          side="bottom"
          showCloseButton={false}
          aria-label={COPY.title}
          aria-describedby={undefined}
          data-agent-chat="sheet"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            focusBubble();
          }}
          className={cn("h-[88dvh] gap-0 overflow-hidden rounded-t-[14px] border-line2 bg-surface text-ink motion-reduce:animate-none! motion-reduce:transition-none", className)}
        >
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;
  return (
    <section
      id={AGENT_CHAT_ID}
      role="dialog"
      aria-label={COPY.title}
      data-agent-chat="window"
      onKeyDown={(e) => {
        // Esc closes only from inside the window, so it does not fight the panel and the drawer.
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.stopPropagation();
        close();
        focusBubble();
      }}
      className={cn(
        "absolute right-[12px] bottom-[84px] z-20 flex h-[min(520px,calc(100%-96px))] w-[min(360px,calc(100%-24px))] flex-col overflow-hidden rounded-[14px] border border-line2 bg-surface text-ink shadow-[0_12px_40px_rgba(0,0,0,.25)]",
        className,
      )}
    >
      {body}
    </section>
  );
}

function Bubble({ who, text, note = false }: { who: "user" | "agent"; text: string; note?: boolean }) {
  const me = who === "user";
  return (
    <div
      data-agent-msg={who}
      className={cn(
        "max-w-[86%] rounded-[14px] px-[11px] py-2 text-[13px] leading-[1.4] break-words whitespace-pre-wrap",
        me ? "self-end rounded-br-[4px] bg-ink text-bg" : "self-start rounded-bl-[4px] border border-line bg-surface-muted text-ink",
        note && "text-muted",
      )}
    >
      <span className="mb-0.5 block text-[11px] font-semibold opacity-75">{me ? "You" : "Agent"}</span>
      {text}
    </div>
  );
}

function MessageRow({ m, action }: { m: ChatEntry; action: React.ReactNode }) {
  const summary = m.role === "agent" ? summaryText(m.result) : "";
  return (
    <>
      <Bubble who={m.role} text={m.text} note={m.note} />
      {summary && (
        <div data-agent-result="" className="flex items-center gap-2 self-stretch rounded-[10px] border border-line2 px-2.5 py-2 text-[13px]">
          {/* Summary and "Map and list updated" wrap inside their own column, so the button stays on the right. */}
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <b className="font-semibold whitespace-nowrap">{summary}</b>
            <span className="text-[12px] whitespace-nowrap text-muted">{COPY.updated}</span>
          </span>
          {action}
        </div>
      )}
    </>
  );
}

function RunningCard({ startedAt, onStop }: { startedAt: number; onStop(): void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const ms = Math.max(0, now - startedAt);
  return (
    <div data-agent-running="" className="flex flex-col gap-2 self-stretch rounded-[10px] border border-line2 bg-surface-muted px-2.5 py-2 text-[13px]">
      <div role="status" className="flex items-center gap-2">
        <Loader2 className="h-[14px] w-[14px] shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        <b className="font-medium">{COPY.running}</b>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-line" aria-hidden="true">
        <i className="block h-full rounded-full bg-ink transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${runningPercent(ms)}%` }} />
      </div>
      <div className="flex items-center gap-2">
        <span data-agent-elapsed="" className="min-w-0 flex-1 text-[12px] text-muted">
          {runningLine(ms)}
        </span>
        <button type="button" data-agent-stop="" className={cn(SMALL_BTN, "h-[32px] px-2.5")} onClick={onStop}>
          <Square className="h-3 w-3" aria-hidden="true" />
          {COPY.stop}
        </button>
      </div>
    </div>
  );
}

export default AgentChat;
