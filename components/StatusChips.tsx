import type { Chip } from "@/lib/status";
import { cn } from "@/lib/utils";

/** One compact line of state chips; renders nothing when there are none. */
export default function StatusChips({ chips, className }: { chips: Chip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-0.5", className)}>
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={cn("nh-chip", `nh-chip--${c.tone}`, c.outline && "nh-chip--outline", c.strike && "nh-chip--strike")}
        >
          <span>{c.label}</span>
        </span>
      ))}
    </div>
  );
}
