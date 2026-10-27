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

// 28px tall with a mouse, 44px on a touch screen.
const btn =
  "inline-flex h-8 min-w-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink no-underline hover:bg-surface-muted [@media(pointer:coarse)]:h-[44px]";

/**
 * The number with Call and Text buttons that open Quo on this device, so the call or text goes from
 * the user's own Quo account. One row per number when a Monday cell holds two.
 */
export default function ContactActions({ phone, name, address }: { phone: string; name: string | null; address: string | null }) {
  const numbers = toE164List(phone);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [hint, setHint] = useState<Hint>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Who's texting, from the name saved by "Report bad link". Read after mount so the server and the first
  // client render agree.
  const [from, setFrom] = useState("");
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setFrom(readReporterName());
  }, []);

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  function showHint(h: Hint) {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(h);
    if (h) hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }

  if (!numbers.length) return <span className="font-mono text-[13px] text-ink">{phone}</span>;

  const mobile = platform !== "desktop";

  async function onCall() {
    if (mobile) return; // the openphone:// link does the work; the store opens if Quo isn't installed
    if (!(await quoTookOver())) {
      showHint({
        text: "Quo didn't open?",
        link: { href: CLICK_TO_CALL_HELP, label: "Make Quo your default calling app" },
      });
    }
  }

  async function onText(e164: string) {
    if (mobile) return; // the openphone:// link does the work
    // The desktop app has no sms: handler. The link asks the OS for Quo's own scheme; the number is also
    // held on the clipboard in case the app opens without filling it in, or isn't installed.
    const held = await copy(e164);
    showHint({ text: held ? "Opening Quo · number copied" : "Opening Quo…" });
    if (!(await quoTookOver())) {
      showHint({
        text: held ? "Quo didn't open. Paste the number into Quo:" : "Quo didn't open:",
        link: { href: QUO_WEB, label: "open Quo" },
      });
    }
  }

  async function onCopy(e164: string) {
    if (await copy(e164)) {
      setCopied(e164);
      setTimeout(() => setCopied((c) => (c === e164 ? null : c)), 1500);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {numbers.map((e164) => {
        const draft = draftText({ to: name, address, from });
        return (
          <div key={e164} className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCopy(e164)}
              title="Copy number"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 font-mono text-[13px] text-ink hover:bg-surface-muted [@media(pointer:coarse)]:h-[44px]"
            >
              {pretty(e164)}
              {copied === e164 ? <Check className="h-3 w-3 text-ok-ink" aria-hidden="true" /> : <Copy className="h-3 w-3 text-muted" aria-hidden="true" />}
              <span className="sr-only">{copied === e164 ? "Copied" : "Copy number"}</span>
            </button>
            <span className="ml-auto inline-flex gap-1.5">
              <a href={callHref(e164, platform)} onClick={onCall} className={btn} data-quo="call" aria-label={`Call ${pretty(e164)} with Quo`}>
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                Call
              </a>
              <a href={quoMessageUrl(e164, draft)} onClick={() => onText(e164)} className={btn} data-quo="text" aria-label={`Text ${pretty(e164)} with Quo`}>
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Text
              </a>
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
