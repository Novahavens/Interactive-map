"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Phone, PhoneMissed } from "lucide-react";
import { callLength, type ContactDigest as Digest, type ContactResponse, type LastCall } from "@/lib/contact";
import { dayMonth } from "@/lib/utils";

type State = { kind: "loading" } | { kind: "done"; res: ContactResponse } | { kind: "error" };

// The panel is mounted twice (desktop rail and phone sheet, one hidden), so both share one request
// per property. Kept for a minute, then the next open asks again.
const inflight = new Map<string, { at: number; req: Promise<ContactResponse> }>();
function load(propertyId: string): Promise<ContactResponse> {
  const hit = inflight.get(propertyId);
  if (hit && Date.now() - hit.at < 60_000) return hit.req;
  const req = fetch(`/api/properties/${propertyId}/contact`).then(async (r) => {
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
              {plus(calls.total, d.truncated)} calls{calls.missed ? ` · ${plus(calls.missed, d.truncated)} unanswered` : ""}
            </span>
          </span>
        )}
        {(texts.sent > 0 || texts.received > 0) && (
          <span className="nh-digest">
            <MessageSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              {plus(texts.sent, d.truncated)} sent · {texts.received ? `${plus(texts.received, d.truncated)} ${texts.received === 1 ? "reply" : "replies"}` : "no reply"}
            </span>
          </span>
        )}
      </div>
      {last?.preview && (
        <p className="text-xs text-muted">
          {last.direction === "incoming" ? "They texted" : `${last.by ?? "We"} texted`} {dayMonth(last.at)}:{" "}
          <span className="text-ink">“{last.preview}”</span>
        </p>
      )}
    </div>
  );
}

/** Calls and texts with the owner and landlord/PM from Quo. Renders nothing when the map has no Quo key. */
export default function ContactDigest({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    load(propertyId).then(
      (res) => live && setState({ kind: "done", res }),
      () => live && setState({ kind: "error" }),
    );
    return () => {
      live = false;
    };
  }, [propertyId]);

  if (state.kind === "done" && (!state.res.enabled || !state.res.numbers.length)) return null;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-2.5 py-2" aria-label="Contact history from Quo" aria-live="polite">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Contact history · Quo</span>
      {state.kind === "loading" && <p className="text-xs text-muted">Checking Quo…</p>}
      {state.kind === "error" && <p className="text-xs text-muted">Couldn't reach Quo right now.</p>}
      {state.kind === "done" && state.res.digest && <DigestView d={state.res.digest} numbers={state.res.numbers.length} />}
    </div>
  );
}
