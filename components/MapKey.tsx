"use client";

import { Check, Loader2 } from "lucide-react";
import { STATUS, STATUS_ORDER, type MapStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

type Props =
  | { variant: "rail"; counts: Record<MapStatus, number>; hidden: Record<MapStatus, boolean>; onToggle: (s: MapStatus) => void; touch?: boolean }
  | { variant: "floating"; attachedCount: number; loading: boolean };

/**
 * The map key in its two places. In the rail each colour is also a filter that counts the pins in view;
 * floating over the map it is a plain legend. The two trailing entries are never clickable.
 */
export default function MapKey(props: Props) {
  if (props.variant === "rail") {
    const { counts, hidden, onToggle, touch } = props;
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dot colours">
        {STATUS_ORDER.map((s) => {
          const on = !hidden[s];
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              title={`${STATUS[s].help}. Click to ${on ? "hide" : "show"}.`}
              onClick={() => onToggle(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 text-[13px]",
                touch ? "min-h-[44px] px-3" : "h-7",
                on ? "border-line2 bg-surface text-ink" : "border-line bg-surface-muted text-muted line-through",
              )}
            >
              <StatusDot status={s} />
              <span>{STATUS[s].label}</span>
              <span className="font-mono text-xs text-muted">{counts[s].toLocaleString("en-US")}</span>
            </button>
          );
        })}
        <OnClaimKey label="On this claim" />
        <GroupedKey />
      </div>
    );
  }
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted">
      {props.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--loss)" }} />
        <span>Loss</span>
      </span>
      {STATUS_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <StatusDot status={s} />
          <span>{STATUS[s].label}</span>
        </span>
      ))}
      <OnClaimKey label={`On this claim (${props.attachedCount})`} />
      <GroupedKey />
    </div>
  );
}

/** Black check: what an option already on this claim looks like on the map. */
function OnClaimKey({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink text-bg" aria-hidden="true">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span>{label}</span>
    </span>
  );
}

/** A numbered circle is several nearby properties grouped. */
function GroupedKey() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-line2 bg-surface px-1 font-mono text-[10px] font-semibold text-ink"
        aria-hidden="true"
      >
        7
      </span>
      <span>Nearby grouped · zoom in to split</span>
    </span>
  );
}
