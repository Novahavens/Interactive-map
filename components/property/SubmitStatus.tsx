import { Ban } from "lucide-react";
import type { SubmitStatus as Status } from "@/lib/types";
import { blockedText, submitAriaLabel, submitLine, submitSteps } from "@/lib/submit-status";
import { cn } from "@/lib/utils";

interface Props {
  /** The option's row from GET /api/claim/:id/submit-status. Null = not known: nothing is drawn. */
  status: Status | null;
  /** Still reading: one skeleton bar. */
  loading?: boolean;
  className?: string;
}

/**
 * Where a home on the claim is on its way to the adjuster: To Do → Ready to Submit → Option Submitted,
 * or a red note when it is blocked. Read-only: the step is set on Monday.
 */
export default function SubmitStatus({ status, loading, className }: Props) {
  if (loading && !status) {
    return <div className={cn("nh-skeleton h-[20px]", className)} role="status" aria-label="Loading submit status" data-submit="loading" />;
  }
  if (!status) return null;

  if (status.state === "blocked") {
    const { head, body } = blockedText(status);
    return (
      <div
        data-submit="blocked"
        className={cn("flex items-start gap-2 rounded-md border border-bad-line bg-bad-bg p-2 text-xs text-bad-ink", className)}
      >
        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">
          <span className="font-semibold">{head}</span> {body}
        </span>
      </div>
    );
  }

  const steps = submitSteps(status.state);
  if (!steps) return null;
  const line = submitLine(status);

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-submit={status.state}>
      <ol className="m-0 flex list-none items-start p-0" aria-label={submitAriaLabel(status.state) ?? undefined}>
        {steps.map((s, i) => (
          <li
            key={s.key}
            aria-current={s.phase === "now" ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[11.5px] leading-tight",
              s.phase === "later" ? "text-muted" : "text-ink",
              s.phase === "now" && "font-semibold",
            )}
          >
            {/* The line from the step before; ink once that stretch has been walked. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn("absolute top-[9px] right-1/2 h-[1.5px] w-full", s.phase === "later" ? "bg-line2" : "bg-ink")}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-[1] inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold",
                s.phase === "now"
                  ? "border-ink bg-ink text-bg"
                  : s.phase === "done"
                    ? "border-ink bg-surface text-ink"
                    : "border-line2 bg-surface text-muted",
              )}
            >
              {s.mark}
            </span>
            <span className="max-w-full break-words px-0.5">
              {s.label}
              <span className="sr-only">{s.phase === "done" ? " (done)" : s.phase === "now" ? " (current step)" : " (not yet)"}</span>
            </span>
          </li>
        ))}
      </ol>
      {line && <p className="text-center text-xs text-muted">{line}</p>}
    </div>
  );
}
