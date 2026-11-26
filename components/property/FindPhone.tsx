"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { toE164List } from "@/lib/contact";
import { PHONE_COPY, PHONE_START, canRetry, checkedLine, foundLine, phoneReducer, type PhoneState } from "@/lib/phone-lookup-ui";
import type { PhoneLookup } from "@/lib/types";
import ContactActions, { btn, pretty, touch } from "./ContactActions";
import { readReporterName } from "./ReportBadLink";

const MAX_BY = 80;
const off = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-surface";
const inkBtn = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-ink px-2.5 text-xs font-medium text-bg hover:brightness-110 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${touch}`;

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * What Find phone shows for one state. No I/O: `FindPhone` below owns the requests. A button that can't be
 * used right now stays focusable (`aria-disabled`) so a screen reader can reach the reason.
 */
export function FindPhoneView({
  state,
  name,
  address,
  save = "idle",
  onFind,
  onDismiss,
  onSave,
}: {
  state: PhoneState;
  /** The contact's name and the home's address, for the Call / Text buttons of a found number. */
  name: string | null;
  address: string | null;
  save?: SaveState;
  onFind?: () => void;
  onDismiss?: () => void;
  /** Left out: no "Save to listing" button. */
  onSave?: () => void;
}) {
  const id = useId();
  const reason = `${id}-why`;

  const findButton = (label: string, blocked: boolean, describedBy?: string) => (
    <span className="ml-auto inline-flex">
      <button
        type="button"
        className={`${btn} ${off}`}
        aria-disabled={blocked || undefined}
        aria-describedby={describedBy}
        onClick={() => !blocked && onFind?.()}
        data-findphone="find"
        data-findphone-focus
      >
        {label === PHONE_COPY.find && <Search className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </button>
    </span>
  );
  const none = <span className="px-1.5 text-[13px] text-muted">{PHONE_COPY.none}</span>;
  const row = "flex min-h-8 flex-wrap items-center gap-1.5";
  const small = "px-1.5 text-xs text-muted";

  let body: React.ReactNode;
  let said = "";
  switch (state.kind) {
    case "loading":
    case "idle":
      body = (
        <div className={row}>
          {none}
          {findButton(PHONE_COPY.find, state.kind === "loading")}
        </div>
      );
      break;
    case "off":
      body = (
        <>
          <div className={row}>
            {none}
            {findButton(PHONE_COPY.find, true, reason)}
          </div>
          <p id={reason} className={small}>
            {PHONE_COPY.off}
          </p>
        </>
      );
      break;
    case "searching":
      body = (
        <>
          <div className={row} role="status">
            <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin text-muted motion-reduce:animate-none" aria-hidden="true" />
            <span className="text-[13px] text-ink">{PHONE_COPY.searching}</span>
            {findButton(PHONE_COPY.find, true, reason)}
          </div>
          <p id={reason} className={small}>
            {PHONE_COPY.searchingHint}
          </p>
        </>
      );
      break;
    case "found": {
      const line = foundLine(state);
      const e164 = toE164List(state.phone)[0];
      said = `Number found: ${e164 ? pretty(e164) : state.phone}. ${line}`;
      const busy = save === "saving" || save === "saved";
      body = (
        <>
          <ContactActions phone={state.phone} name={name} address={address} />
          <p className={small} data-findphone="source">
            {line}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {onSave && (
              <button type="button" className={inkBtn} aria-disabled={busy || undefined} onClick={() => !busy && onSave()} data-findphone="save">
                {save === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {save === "saved" && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {save === "saving" ? PHONE_COPY.saving : save === "saved" ? PHONE_COPY.saved : PHONE_COPY.save}
              </button>
            )}
            <button type="button" className={`${btn} ${off}`} aria-disabled={save === "saving" || undefined} onClick={() => save !== "saving" && onDismiss?.()} data-findphone="dismiss">
              {PHONE_COPY.dismiss}
            </button>
          </div>
          {save === "failed" && (
            <p className="px-1.5 text-xs text-bad-ink" role="alert">
              {PHONE_COPY.saveFailed}
            </p>
          )}
        </>
      );
      break;
    }
    case "not_found": {
      const again = canRetry(state.lookedUpAt, new Date());
      said = PHONE_COPY.notFound;
      body = (
        <>
          <div className={row}>
            <span className="px-1.5 text-[13px] text-ink">{PHONE_COPY.notFound}</span>
            {findButton(PHONE_COPY.retry, !again, reason)}
          </div>
          <p id={reason} className={small}>
            {checkedLine(state.lookedUpAt)}
            {!again && ` ${PHONE_COPY.retryTomorrow}`}
          </p>
        </>
      );
      break;
    }
    case "error":
      body = (
        <>
          <p className="rounded-md border border-bad-line bg-bad-bg px-2.5 py-2 text-[13px] leading-snug text-bad-ink" role="alert">
            <b className="font-semibold">{state.busy ? PHONE_COPY.busyTitle : PHONE_COPY.errorTitle}</b> {state.busy ? PHONE_COPY.busyRest : PHONE_COPY.errorRest}
          </p>
          <div className={row}>
            {none}
            {findButton(PHONE_COPY.find, false)}
          </div>
        </>
      );
      break;
  }

  return (
    <div className="flex flex-col gap-1.5" data-findphone-state={state.kind}>
      {body}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/**
 * Find phone, for a contact with no number (feature `findPhone`): reads the last saved lookup, and looks the
 * number up on request. Nothing is written to the listing here: "Save to listing" hands the number to
 * `onSave` (the Edit form's route). Renders nothing while `enabled` is false.
 */
export default function FindPhone({
  propertyId,
  name,
  address,
  enabled,
  onSave,
}: {
  propertyId: string;
  name: string | null;
  address: string | null;
  enabled: boolean;
  /** Saves the number on the listing. May return a promise: the button waits for it. No button without it. */
  onSave?: (phone: string) => void | Promise<unknown>;
}) {
  const [state, dispatch] = useReducer(phoneReducer, PHONE_START);
  const [save, setSave] = useState<SaveState>("idle");
  const root = useRef<HTMLDivElement>(null);
  /** Set when an action removes the button that had focus, so focus lands on what replaced it. */
  const refocus = useRef(false);
  const alive = useRef(true);
  const url = `/api/properties/${encodeURIComponent(propertyId)}/find-phone`;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PhoneLookup>) : Promise.reject(new Error(String(r.status)))))
      .then((lookup) => dispatch({ type: "answer", lookup }))
      .catch(() => !ctl.signal.aborted && dispatch({ type: "load_failed" }));
    return () => ctl.abort();
  }, [url, enabled]);

  useEffect(() => {
    if (!refocus.current) return;
    if (state.kind !== "searching") refocus.current = false;
    const within = root.current;
    // Only when focus was left behind on a button that is gone, never stolen from elsewhere on the page.
    if (!within || (document.activeElement && document.activeElement !== document.body && !within.contains(document.activeElement))) return;
    within.querySelector<HTMLElement>("[data-findphone-focus], button")?.focus();
  }, [state.kind]);

  if (!enabled) return null;

  async function find() {
    refocus.current = true;
    setSave("idle");
    dispatch({ type: "search" });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: readReporterName().trim().slice(0, MAX_BY) }),
      });
      if (!alive.current) return;
      if (!res.ok) return dispatch({ type: "failed", status: res.status });
      dispatch({ type: "answer", lookup: (await res.json()) as PhoneLookup });
    } catch {
      if (alive.current) dispatch({ type: "failed", status: 0 });
    }
  }

  async function saveNumber(phone: string) {
    if (!onSave) return;
    setSave("saving");
    try {
      await onSave(phone);
      if (alive.current) setSave("saved");
    } catch {
      if (alive.current) setSave("failed");
    }
  }

  return (
    <div ref={root}>
      <FindPhoneView
        state={state}
        name={name}
        address={address}
        save={save}
        onFind={find}
        onDismiss={() => {
          refocus.current = true;
          setSave("idle");
          dispatch({ type: "dismiss" });
        }}
        onSave={onSave && state.kind === "found" ? () => saveNumber(state.phone) : undefined}
      />
    </div>
  );
}
