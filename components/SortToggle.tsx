"use client";

import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SortMode } from "@/lib/result-sort";
import { cn } from "@/lib/utils";

const STORE_KEY = "nh-sort";

/** The person's remembered choice; "best" until they pick otherwise (the list falls back to Nearest by itself). */
export function readSortChoice(): SortMode {
  try {
    return localStorage.getItem(STORE_KEY) === "nearest" ? "nearest" : "best";
  } catch {
    return "best";
  }
}

export function saveSortChoice(mode: SortMode): void {
  try {
    localStorage.setItem(STORE_KEY, mode);
  } catch {}
}

interface Props {
  /** The person's choice. Shown as Nearest whenever Best match has nothing to sort by. */
  value: SortMode;
  onChange: (mode: SortMode) => void;
  /** A claim is open and at least one home has a score. False = Best match is disabled and the list is in Nearest order. */
  bestAvailable: boolean;
  /** Scores are on their way: the choice stays as it is and a line says so. */
  loading?: boolean;
  /** "50 within 10 mi", on the left of the toggle. Leave out where the count is shown elsewhere (the phone sheet). */
  countLabel?: string;
  /** False = no claim open, which is why Best match is disabled. Default true. */
  claimOpen?: boolean;
  /** The scores could not be read. */
  error?: boolean;
  onRetry?: () => void;
  className?: string;
}

const ITEM =
  "h-7 min-w-0 flex-none whitespace-nowrap rounded-[5px] px-2 text-[12px] font-medium text-muted hover:bg-transparent hover:text-ink first:rounded-l-[5px] last:rounded-r-[5px] " +
  "data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,0.12)] " +
  "focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 " +
  "[@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:text-[13px]";

/**
 * The count row above the results: "50 within 10 mi" and the Best match | Nearest switch, with one line under
 * it when there is something to say (scoring, no claim, no scores, an error). Controlled; it never sorts by itself.
 */
export default function SortToggle({ value, onChange, bestAvailable, loading = false, countLabel, claimOpen = true, error = false, onRetry, className }: Props) {
  const hintId = useId();
  const canBest = bestAvailable || (loading && claimOpen);
  const shown: SortMode = canBest ? value : "nearest";
  const hint = !claimOpen
    ? "Pick a claim to sort by best match."
    : error
      ? "Couldn't score these homes. Showing nearest first."
      : loading
        ? "Scoring homes for this claim…"
        : !bestAvailable
          ? "No match scores for this claim yet. Showing nearest first."
          : null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        {countLabel != null && <span className="text-[13px] text-muted">{countLabel}</span>}
        <ToggleGroup
          type="single"
          role="radiogroup"
          aria-label="Sort homes"
          aria-describedby={hint ? hintId : undefined}
          value={shown}
          onValueChange={(v) => (v === "best" || v === "nearest") && v !== shown && onChange(v)}
          // A radio group picks as the arrows move; Radix's toggle group only moves the focus.
          onKeyDown={(e) => {
            if (!canBest || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
            onChange(shown === "best" ? "nearest" : "best");
          }}
          className="ml-auto gap-0 rounded-[7px] border border-line bg-surface-muted p-0.5"
        >
          <ToggleGroupItem value="best" disabled={!canBest} title={canBest ? "Highest match score first" : (hint ?? undefined)} className={ITEM}>
            Best match
          </ToggleGroupItem>
          <ToggleGroupItem value="nearest" title="Green first, then nearest" className={ITEM}>
            Nearest
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {hint && (
        <p id={hintId} data-sort-hint role="status" className="m-0 text-xs text-muted">
          {hint}
          {error && claimOpen && onRetry ? (
            <>
              {" "}
              <button type="button" onClick={onRetry} className="font-medium text-ink underline underline-offset-2 [@media(pointer:coarse)]:min-h-[44px]">
                Try again
              </button>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
