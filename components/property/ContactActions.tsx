"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, MessageSquare, Phone } from "lucide-react";
import { toE164List } from "@/lib/contact";
import { callHref, detectPlatform, draftText, quoMessageUrl, type Platform } from "@/lib/quo-links";
import { readReporterName } from "./ReportBadLink";

const CLICK_TO_CALL_HELP = "https://support.quo.com/core-concepts/calling/click-to-call";
const QUO_WEB = "https://my.quo.com";
/** How long we give Quo to take focus before assuming it didn't open. */
const OPEN_GRACE_MS = 1500;
const HINT_MS = 9000;
const COPIED_MS = 1500;

type Hint = { text: string; link?: { href: string; label: string } } | null;

/** Resolves true when the window loses focus within the grace period (an app took over), else false. */
function quoTookOver(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (opened: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
      resolve(opened);
    };
    const onBlur = () => finish(true);
    const onHide = () => document.visibilityState === "hidden" && finish(true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHide);
    setTimeout(() => finish(false), OPEN_GRACE_MS);
  });
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The numbers to act on: E.164 when the cell parses; else the digits as typed, so Call still works (no draft then). */
function numbersIn(phone: string): { numbers: string[]; parsed: boolean } {
  const parsed = toE164List(phone);
  if (parsed.length) return { numbers: parsed, parsed: true };
  const raw = phone.replace(/[^+\d]/g, "");
  return { numbers: raw.replace(/\D/g, "").length >= 7 ? [raw] : [], parsed: false };
}

// 28px tall with a mouse (root font is 14px), 44px on a touch screen.
const touch = "[@media(pointer:coarse)]:h-[44px]";
const btn = `inline-flex h-8 min-w-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink no-underline hover:bg-surface-muted ${touch}`;

/**
 * The number with Call and Text buttons that open Quo on this device, so the call or text goes from
 * the user's own Quo account. One row per number when a Monday cell holds two.
 */
export default function ContactActions({ phone, name, address }: { phone: string; name: string | null; address: string | null }) {
  const { numbers, parsed } = numbersIn(phone);
  // The platform and the sender name are read after mount, so the server render and the first client
  // render agree; an iPad reports itself as a Mac with touch.
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [from, setFrom] = useState("");
  const [hint, setHint] = useState<Hint>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const alive = useRef(true);
  const timers = useRef<{ hint?: ReturnType<typeof setTimeout>; copied?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    alive.current = true;
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setFrom(readReporterName());
    const t = timers.current;
    return () => {
      alive.current = false;
      clearTimeout(t.hint);
      clearTimeout(t.copied);
    };
  }, []);

  function showHint(h: Hint) {
    if (!alive.current) return;
    clearTimeout(timers.current.hint);
    setHint(h);
    if (h) timers.current.hint = setTimeout(() => alive.current && setHint(null), HINT_MS);
  }

  if (!numbers.length) return <span className="font-mono text-[13px] text-ink">{phone}</span>;

  const mobile = platform !== "desktop";
  const draft = draftText({ to: name, address, from });

  async function onCall() {
    if (mobile) return; // the openphone:// link does the work; the store opens if Quo isn't installed
    if (!(await quoTookOver())) {
      showHint({ text: "Quo didn't open?", link: { href: CLICK_TO_CALL_HELP, label: "Make Quo your default calling app" } });
    }
  }

  async function onText(number: string) {
    if (mobile) return; // the openphone:// link does the work
    // Quo documents its deep links for the mobile apps only. On a laptop the link is still tried (the
    // desktop app registers the scheme), the number is held on the clipboard for pasting, and Quo on
    // the web is offered when nothing takes over.
    const took = quoTookOver();
    const held = await copy(number);
    showHint({ text: held ? "Opening Quo · number copied" : "Opening Quo…" });
    if (await took) showHint(null);
    else showHint({ text: held ? "Quo didn't open. Paste the number into Quo:" : "Quo didn't open:", link: { href: QUO_WEB, label: "open Quo" } });
  }

  async function onCopy(number: string) {
    if (!(await copy(number)) || !alive.current) return;
    setCopied(number);
    clearTimeout(timers.current.copied);
    timers.current.copied = setTimeout(() => alive.current && setCopied((c) => (c === number ? null : c)), COPIED_MS);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {numbers.map((number) => {
        const shown = parsed ? pretty(number) : phone;
        return (
          <div key={number} className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCopy(number)}
              title="Copy number"
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 font-mono text-[13px] text-ink hover:bg-surface-muted ${touch}`}
            >
              {shown}
              {copied === number ? <Check className="h-3 w-3 text-ok-ink" aria-hidden="true" /> : <Copy className="h-3 w-3 text-muted" aria-hidden="true" />}
              <span className="sr-only" role="status">
                {copied === number ? "Copied" : "Copy number"}
              </span>
            </button>
            <span className="ml-auto inline-flex gap-1.5">
              <a href={callHref(number, platform)} onClick={onCall} className={btn} data-quo="call" aria-label={`Call ${shown} with Quo`}>
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                Call
              </a>
              {parsed && (
                <a href={quoMessageUrl(number, draft)} onClick={() => onText(number)} className={btn} data-quo="text" aria-label={`Text ${shown} with Quo`}>
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Text
                </a>
              )}
            </span>
          </div>
        );
      })}
      <p className="text-xs text-muted empty:hidden" aria-live="polite">
        {hint && (
          <>
            {hint.text}
            {hint.link && (
              <>
                {" "}
                <a href={hint.link.href} target="_blank" rel="noreferrer" className="text-brand underline">
                  {hint.link.label}
                </a>
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}

/** "+19187409628" → "(918) 740-9628"; other countries stay as E.164. */
function pretty(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
