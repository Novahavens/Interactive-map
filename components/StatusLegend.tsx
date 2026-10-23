"use client";

import { Check } from "lucide-react";
import { STATUS_HELP, STATUS_LABEL, STATUS_ORDER, type MapStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

/** Legend and filter in one: each chip says what a colour means, counts the pins in view, and hides or shows them. */
export default function StatusLegend({
  counts,
  hidden,
  onToggle,
}: {
  counts: Record<MapStatus, number>;
  hidden: Record<MapStatus, boolean>;
  onToggle: (s: MapStatus) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dot colours">
      {STATUS_ORDER.map((s) => {
        const on = !hidden[s];
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            title={`${STATUS_HELP[s]}. Click to ${on ? "hide" : "show"}.`}
            onClick={() => onToggle(s)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px]",
              on ? "border-line2 bg-surface text-ink" : "border-line bg-surface-muted text-muted line-through",
            )}
          >
            <StatusDot status={s} />
            <span>{STATUS_LABEL[s]}</span>
            <span className="font-mono text-xs text-muted">{counts[s].toLocaleString("en-US")}</span>
          </button>
        );
      })}
      <OnClaimKey />
      <GroupedKey />
    </div>
  );
}

/** Black check: what an option already on this claim looks like on the map. Not a filter. */
export function OnClaimKey({ label = "On this claim" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink text-bg" aria-hidden="true">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span>{label}</span>
    </span>
  );
}

/** A numbered circle is several nearby properties grouped. Not a filter. */
export function GroupedKey() {
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
