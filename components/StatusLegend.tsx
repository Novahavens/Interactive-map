"use client";

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
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dot colours">
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
    </div>
  );
}
