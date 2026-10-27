import type { AvailabilityPill as Pill } from "@/lib/availability";
import { cn } from "@/lib/utils";

/** The raised availability pill at the top of the panel header. Styles: .nh-avail in app/globals.css. */
export default function AvailabilityPill({ pill, className }: { pill: Pill; className?: string }) {
  const spoken = `Availability: ${pill.label}${pill.detail ? `, ${pill.detail.split(" · ").join(", ")}` : ""}`;
  return (
    <span
      role="note"
      aria-label={spoken}
      title={pill.stale ? "The next-availability date on the record has passed; confirm with the owner" : undefined}
      className={cn("nh-avail", `nh-avail--${pill.tone}`, pill.stale && "nh-avail--stale", className)}
      data-testid="availability-pill"
    >
      <span className="nh-avail__dot" aria-hidden="true" />
      <span className="nh-avail__label" aria-hidden="true">
        {pill.label}
      </span>
      {pill.detail && (
        <span className="nh-avail__detail" aria-hidden="true">
          {pill.detail}
        </span>
      )}
    </span>
  );
}
