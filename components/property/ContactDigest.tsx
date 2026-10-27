"use client";

import { useEffect, useState } from "react";
import { ChevronDown, MessageSquare, Phone, PhoneMissed } from "lucide-react";
import { callLength, type ContactDigest as Digest, type ContactResponse, type LastCall } from "@/lib/contact";
import type { HealthResponse } from "@/lib/types";
import { dayMonth } from "@/lib/utils";

type State = { kind: "closed" } | { kind: "loading" } | { kind: "done"; res: ContactResponse } | { kind: "error" };

// Whether the map has a Quo key, asked once per page. Without one the drawer isn't shown at all.
let quoOn: Promise<boolean> | null = null;
function quoEnabled(): Promise<boolean> {
  quoOn ??= fetch("/api/health", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
    .then((h) => !!h?.quo)
    .catch(() => false);
  return quoOn;
}

// The panel is mounted twice (desktop rail and phone sheet, one hidden), so both share one request
// per property. Kept for a minute, then the next open asks again.
const inflight = new Map<string, { at: number; req: Promise<ContactResponse> }>();
function load(propertyId: string): Promise<ContactResponse> {
  const hit = inflight.get(propertyId);
  if (hit && Date.now() - hit.at < 60_000) return hit.req;
  const req = fetch(`/api/properties/${propertyId}/contact`, { signal: AbortSignal.timeout(30_000) }).then(async (r) => {
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as ContactResponse;
  });
  req.catch(() => inflight.delete(propertyId));
  inflight.set(propertyId, { at: Date.now(), req });
  return req;
}

function callLine(c: LastCall): string {
  const when = dayMonth(c.at);
  if (c.direction === "incoming") return c.answered ? `They called ${when} · ${callLength(c.durationSec)}` : `Missed their call ${when}`;
  const who = c.by ? ` · ${c.by}` : "";
  return c.answered ? `Last call ${when}${who} · ${callLength(c.durationSec)}` : `Called ${when}${who} · no answer`;
}

const plus = (n: number, truncated: boolean) => `${n}${truncated && n > 0 ? "+" : ""}`;

function textLine(t: Digest["texts"]): string {
  const sent = plus(t.sent, t.truncated);
  const got = plus(t.received, t.truncated);
  if (!t.sent) return `${got} received`;
  return `${sent} sent · ${t.received ? `${got} ${t.received === 1 ? "reply" : "replies"}` : "no reply"}`;
}

function DigestView({ d, numbers }: { d: Digest; numbers: number }) {
  const { calls, texts } = d;
  if (!calls.total && !texts.sent && !texts.received) {
    return <p className="text-xs text-muted">No calls or texts in Quo yet{numbers > 1 ? ` with these ${numbers} numbers` : ""}.</p>;
  }
  const last = texts.last;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {calls.last && (
          <span className="nh-digest">
            {calls.last.answered ? <Phone className="h-3 w-3 shrink-0" aria-hidden="true" /> : <PhoneMissed className="h-3 w-3 shrink-0" aria-hidden="true" />}
            <span>{callLine(calls.last)}</span>
          </span>
        )}
        {calls.total > 1 && (
          <span className="nh-digest nh-digest--quiet">
            <span>
              {plus(calls.total, calls.truncated)} calls{calls.missed ? ` · ${plus(calls.missed, calls.truncated)} unanswered` : ""}
            </span>
          </span>
        )}
        {(texts.sent > 0 || texts.received > 0) && (
          <span className="nh-digest">
            <MessageSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{textLine(texts)}</span>
          </span>
        )}
      </div>
      {last?.preview && (
        <p className="text-xs text-muted [overflow-wrap:anywhere]">
          {last.direction === "incoming" ? "They texted" : `${last.by ?? "We"} texted`} {dayMonth(last.at)}:{" "}
          <span className="text-ink">“{last.preview}”</span>
        </p>
      )}
    </div>
  );
}

/** Calls and texts with the owner and landlord/PM from Quo, in a drawer that asks Quo only when opened.
 *  Renders nothing when the map has no Quo key. */
export default function ContactDigest({ propertyId }: { propertyId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<State>({ kind: "closed" });

  useEffect(() => {
    let live = true;
    void quoEnabled().then((on) => live && setEnabled(on));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (state.kind !== "loading") return;
    let live = true;
    load(propertyId).then(
      (res) => live && setState({ kind: "done", res }),
      () => live && setState({ kind: "error" }),
    );
    return () => {
      live = false;
    };
  }, [propertyId, state.kind]);

  if (!enabled) return null;

  return (
    <details
      className="group rounded-lg border border-line bg-surface-muted"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && state.kind === "closed") setState({ kind: "loading" });
      }}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Phone className="h-3 w-3" aria-hidden="true" />
          Contact history · Quo
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line px-2.5 py-2" aria-live="polite">
        {state.kind === "loading" && <p className="text-xs text-muted">Checking Quo…</p>}
        {state.kind === "error" && <p className="text-xs text-muted">Couldn't reach Quo right now.</p>}
        {state.kind === "done" && !state.res.enabled && <p className="text-xs text-muted">Quo isn't connected right now.</p>}
        {state.kind === "done" && state.res.enabled && !state.res.numbers.length && (
          <p className="text-xs text-muted">No phone number Quo can look up on this property.</p>
        )}
        {state.kind === "done" && state.res.digest && <DigestView d={state.res.digest} numbers={state.res.numbers.length} />}
      </div>
    </details>
  );
}
