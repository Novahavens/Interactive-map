"use client";

import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, MessageSquareQuote, Pencil } from "lucide-react";
import { localToday } from "@/lib/availability";
import { callLength } from "@/lib/contact";
import { FIELD_BY_KEY, currentValue, displayValue, normaliseValue, sameValue, type EditField, type EditValue } from "@/lib/listing-edit";
import { sentences } from "@/lib/owner-said";
import type { OwnerSaidCall, OwnerSaidResponse, PropertyDetail } from "@/lib/types";
import { cn, dayMonth } from "@/lib/utils";
import type { EditSession, Prefill } from "./edit-session";

// The panel is mounted twice (desktop rail and phone sheet, one hidden), so both share one request per
// property, kept for a minute. A save asks again: `after` is the save (its time), and only a request made
// for that save or a later one will do. The last answer is kept too, so a card mounted again (the edit form
// closing) shows at once.
type Loaded = { after: number; res: OwnerSaidResponse };
const inflight = new Map<string, { at: number; after: number; req: Promise<Loaded> }>();
const last = new Map<string, Loaded>();
function load(propertyId: string, after: number): Promise<Loaded> {
  const hit = inflight.get(propertyId);
  if (hit && hit.after >= after && Date.now() - hit.at < 60_000) return hit.req;
  // The route lets the browser keep an answer for 30 s; the ask after a save goes past that copy.
  const req = fetch(`/api/properties/${propertyId}/owner-said`, { cache: after ? "reload" : "default", signal: AbortSignal.timeout(30_000) }).then(async (r) => {
    if (!r.ok) throw new Error(String(r.status));
    const loaded = { after, res: (await r.json()) as OwnerSaidResponse };
    last.set(propertyId, loaded);
    return loaded;
  });
  req.catch(() => inflight.get(propertyId)?.req === req && inflight.delete(propertyId));
  inflight.set(propertyId, { at: Date.now(), after, req });
  return req;
}

type Fact = { field: EditField; value: EditValue; evidence: string };

/** The facts the form can take: a known field, and a value that passes that field's checks. */
function factsOf(call: OwnerSaidCall): Fact[] {
  return call.facts.flatMap((f) => {
    const field = FIELD_BY_KEY.get(f.key);
    const v = field ? normaliseValue(field, f.value) : null;
    return field && v?.ok && v.value !== null ? [{ field, value: v.value, evidence: f.evidence }] : [];
  });
}

function chipLabel({ field, value }: Fact, callDay: string): string {
  const amount = displayValue(field, value);
  switch (field.key) {
    case "next_availability":
      return value === callDay ? "Available now" : `Available ${dayMonth(String(value))}`;
    case "monthly_rate":
      return `${amount}/mo`;
    case "security_deposit":
      return `Deposit ${amount}`;
    case "pet_status":
      return value === "Yes" ? "Pets OK" : "No pets";
    case "pet_deposit":
      return `Pet deposit ${amount}`;
    case "pet_fee":
      return `Pet fee ${amount}`;
    case "pet_rent":
      return `Pet rent ${amount}/mo`;
    case "furnished":
      return value === "Yes" ? "Furnished" : "Unfurnished";
    default:
      return `${field.label} ${amount}`;
  }
}

/** "Oct 27 · Will's call · 3 min". */
function metaLine(c: OwnerSaidCall): string {
  const length = c.durationSec != null ? callLength(Math.max(0, Math.round(c.durationSec))) : null;
  return [dayMonth(c.at), c.by ? `${c.by}'s call` : "call", length].filter(Boolean).join(" · ");
}

function Chips({ call }: { call: OwnerSaidCall }) {
  const facts = factsOf(call);
  if (!facts.length) return null;
  // "Available now" is a date equal to the call's own day.
  const callDay = localToday(new Date(call.at));
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Facts from the call">
      {facts.map((f) => (
        <li key={f.field.key} className="nh-digest" title={f.evidence}>
          <span>{chipLabel(f, callDay)}</span>
        </li>
      ))}
    </ul>
  );
}

const disclosure =
  "-ml-1 inline-flex h-6 items-center gap-1 rounded px-1 text-xs font-medium text-info-ink [@media(pointer:coarse)]:h-[44px]";

interface Props {
  detail: PropertyDetail;
  session: EditSession;
  /** Listing edits are on, and the panel has its own read of the property. */
  canEdit: boolean;
  /** When this property was last saved from the panel (ms; 0 for never): the card asks again, to show the call applied. */
  savedAt: number;
}

/** What owners said on recent answered calls (Quo's AI summaries), with Update Monday to put the values in
 *  the Edit form. Renders nothing while loading, on an error, or with no calls. */
export default function OwnerSaid({ detail, session, canEdit, savedAt }: Props) {
  const propertyId = detail.monday_item_id;
  const uid = useId();
  const [data, setData] = useState<Loaded | null>(() => last.get(propertyId) ?? null);
  const [more, setMore] = useState(false);
  const [earlier, setEarlier] = useState(false);

  useEffect(() => {
    let live = true;
    load(propertyId, savedAt).then(
      (d) => live && setData(d),
      () => undefined, // an error changes nothing: no card, or the one already showing
    );
    return () => {
      live = false;
    };
  }, [propertyId, savedAt]);

  if (!data?.res.enabled || !data.res.calls.length) return null;
  const [call, ...older] = data.res.calls;
  const lines = sentences(call.summary);
  const rest = lines.slice(2);
  const facts = factsOf(call);
  const row = detail as unknown as Record<string, unknown>;
  const differs = facts.some((f) => !sameValue(f.value, currentValue(f.field, row)));
  // Until the answer asked for after a save is in, the card may not know the call was applied.
  const refreshing = data.after < savedAt;
  const canUpdate = differs && canEdit && !session.draft && !refreshing;

  function update() {
    const prefill: Prefill = {
      values: Object.fromEntries(facts.map((f) => [f.field.key, f.value])),
      evidence: Object.fromEntries(facts.map((f) => [f.field.key, f.evidence])),
      source: { callId: call.callId, label: `${call.by ? `${call.by}'s call` : "the call"} on ${dayMonth(call.at)}` },
    };
    session.guard(() => session.open(detail, prefill));
  }

  return (
    <div role="group" aria-labelledby={`${uid}-title`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted px-2.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h4 id={`${uid}-title`} className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <MessageSquareQuote className="h-3 w-3" aria-hidden="true" />
          Owner said
        </h4>
        <span className="text-xs text-muted">{metaLine(call)}</span>
      </div>

      {(lines.length > 0 || call.nextSteps.length > 0) && (
        <div className="text-[13px] [overflow-wrap:anywhere]">
          {lines.length > 0 && <p>{lines.slice(0, 2).join(" ")}</p>}
          {(rest.length > 0 || call.nextSteps.length > 0) && (
            <>
              <div id={`${uid}-more`} hidden={!more} className="mt-1.5">
                {rest.length > 0 && <p>{rest.join(" ")}</p>}
                {call.nextSteps.length > 0 && (
                  <>
                    <p className="mt-1.5 text-xs font-medium text-muted">Next steps</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {call.nextSteps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <button type="button" aria-expanded={more} aria-controls={`${uid}-more`} onClick={() => setMore((v) => !v)} className={cn(disclosure, "mt-0.5")}>
                More
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}

      <Chips call={call} />

      {call.propertyCount != null && call.propertyCount > 1 && (
        <p className="text-xs text-muted">This number is on {call.propertyCount} properties. Check the call was about this one.</p>
      )}

      {call.applied ? (
        <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--ok-ink)" }}>
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Applied to Monday by {call.applied.by} · {dayMonth(call.applied.at)}
        </p>
      ) : facts.length > 0 && !differs ? (
        <p className="text-xs text-muted">Monday already has these.</p>
      ) : canUpdate ? (
        <button
          type="button"
          onClick={update}
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-surface-muted [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:px-3"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Update Monday
        </button>
      ) : null}

      {older.length > 0 && (
        <div className="border-t border-line pt-1">
          <button type="button" aria-expanded={earlier} aria-controls={`${uid}-earlier`} onClick={() => setEarlier((v) => !v)} className={disclosure}>
            {older.length} earlier {older.length === 1 ? "call" : "calls"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", earlier && "rotate-180")} aria-hidden="true" />
          </button>
          <ul id={`${uid}-earlier`} hidden={!earlier} className="mt-1 flex flex-col gap-2.5">
            {older.map((c) => {
              const first = sentences(c.summary)[0];
              return (
                <li key={c.callId} className="flex flex-col gap-1">
                  <span className="text-xs text-muted">{metaLine(c)}</span>
                  {first && <p className="text-[13px] [overflow-wrap:anywhere]">{first}</p>}
                  <Chips call={c} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
