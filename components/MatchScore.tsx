import { stretchChip } from "@/lib/chips";
import { strengthLabel } from "@/lib/result-sort";
import type { MatchScore as Score } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE = { Strong: "nh-chip--ok", Fair: "nh-chip--info", Weak: "nh-chip--muted" } as const;

interface Props {
  /** The open claim's score for this home; null renders nothing. */
  score: Score | null;
  /** Scores are still being read: one quiet placeholder of the card's size. */
  loading?: boolean;
  className?: string;
}

/**
 * The score card on top of "Fit against this claim": 82 / 100, the strength in words, a 4px ink bar, the
 * matcher's "why" line and, for a stretch, by how much. Nothing at all when the home has no score.
 */
export default function MatchScore({ score, loading = false, className }: Props) {
  if (!score) {
    if (!loading) return null;
    return <div role="status" aria-label="Scoring this home…" className={cn("nh-skeleton mb-2.5 h-[76px]", className)} />;
  }
  const n = Math.max(0, Math.min(100, Math.round(score.score)));
  const band = strengthLabel(n);
  const stretch = score.stretch ? stretchChip(score.stretchBy) : null;
  const why = score.why?.trim();
  return (
    <div data-match-score={n} className={cn("mb-2.5 flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[22px] font-semibold leading-none">{n}</span>
        <span className="text-xs text-muted">/ 100</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {stretch && (
            <span className="nh-chip nh-chip--amber" title={stretch.title}>
              <span>{stretch.label}</span>
            </span>
          )}
          <span className={cn("nh-chip", TONE[band])}>
            <span>{band} match</span>
          </span>
        </span>
      </div>
      <div role="img" aria-label={`Match score ${n} out of 100`} className="h-1 w-full overflow-hidden rounded-full border border-line bg-surface-muted">
        <span className="block h-full bg-ink" style={{ width: `${n}%` }} />
      </div>
      {why ? (
        <p className="m-0 break-words text-[13px]">
          <b className="font-medium">Why:</b> <span className="text-muted">{why}</span>
        </p>
      ) : null}
      {stretch ? (
        <p className="m-0 text-xs text-muted">
          {score.stretchBy != null && score.stretchBy > 0
            ? `$${Math.round(score.stretchBy).toLocaleString("en-US")} a month above the FRV. Ask before you offer it.`
            : "Outside what the claim asked for. Ask before you offer it."}
        </p>
      ) : null}
    </div>
  );
}
