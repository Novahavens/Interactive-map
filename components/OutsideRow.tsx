"use client";

import { memo } from "react";
import { NO_MAP_LOCATION, outsideChips, sourceLabel, sourceLetter, type Chip } from "@/lib/chips";
import { hasPin, stretchOf } from "@/lib/result-sort";
import type { MatchScore, OutsideHome } from "@/lib/types";
import { cn, money, num, petsAllowed } from "@/lib/utils";
import type { HoverSource } from "./ResultRow";

interface Props {
  home: OutsideHome;
  /** Set when this listing is also a scored home of ours; otherwise the search's own `home.score` is shown. */
  score?: MatchScore | null;
  selected: boolean;
  hovered: boolean;
  /** The claim's FRV: rent up to 10% above it shows "Stretch +$N" when the matcher has not said so itself. */
  frv?: number | null;
  /** One short reason under the chips (the list shows it for the top three outside rows only). */
  why?: string | null;
  /** Called with the listing id (a uuid; our own homes use Monday item ids, so the two never clash). */
  onSelect: (id: string) => void;
  onHover: (id: string | null, from?: HoverSource) => void;
}

/** The Z / F letter on an ink square, in the slot where our homes have their status dot. Dashed when the home has no pin. */
function SourceLetter({ source, listOnly }: { source: string; listOnly: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // 16px wide in a 9px slot, so names and chips line up with ResultRow's
        "-mx-[3.5px] inline-flex size-[16px] flex-none items-center justify-center rounded-[4px] font-mono text-[10px] font-bold leading-none",
        listOnly ? "border border-dashed border-line2 bg-transparent text-muted" : "bg-ink text-surface",
      )}
    >
      {sourceLetter(source)}
    </span>
  );
}

/** Same line as StatusChips, plus the outlined "line" look of the source chip. */
function Chips({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="flex w-full flex-wrap items-center gap-x-1 gap-y-0.5 pl-[19px]">
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          data-chip={c.key}
          className={cn("nh-chip", c.line ? "nh-chip--line !border-line2 !text-ink" : `nh-chip--${c.tone}`, c.outline && "nh-chip--outline")}
        >
          <span>{c.label}</span>
        </span>
      ))}
    </span>
  );
}

function distanceText(home: OutsideHome, pinned: boolean): string {
  if (!pinned) return "no pin";
  if (home.distanceMiles == null || !Number.isFinite(home.distanceMiles)) return "—";
  return home.precision === "area" || home.precision === "approx" ? `≈ ${Math.round(home.distanceMiles)} mi` : `${home.distanceMiles.toFixed(1)} mi`;
}

/**
 * A results-list row for a listing that is not in our database yet. A sibling of ResultRow: same size, hover,
 * selected and focus behaviour; the source letter stands where the status dot is. Memoised the same way.
 */
export default memo(function OutsideRow({ home, score = null, selected, hovered, frv, why, onSelect, onHover }: Props) {
  const id = home.listingId;
  const pinned = hasPin(home);
  const shown = score?.score ?? home.score;
  const value = typeof shown === "number" && Number.isFinite(shown) ? Math.round(shown) : null;
  const stretch = stretchOf({ score, rent: home.rent, frv });
  const chips = outsideChips(home, { score: value, stretch });
  // The street address when we have it; the listing's own title, marked approximate, when the site gives only an area.
  const name = pinned && !home.addressKnown ? `≈ ${home.title}` : home.title;
  const pets = petsAllowed(home.pets) === true || /^(pets? )?(allowed|ok|welcome)\b/i.test((home.pets ?? "").trim());
  const facts = [`${num(home.beds)} bd`, `${num(home.baths)} ba`, pets ? "pets ok" : "", home.source === "furnished_finder" ? "furnished" : ""].filter(Boolean).join(" · ");
  const label = [
    home.title,
    `outside listing from ${sourceLabel(home.source)}`,
    home.rent == null ? "no rent" : money(home.rent),
    value == null ? "" : `match ${value}`,
    stretch ? (stretch.by ? `stretch, ${money(stretch.by)} over` : "stretch") : "",
    home.isNew ? "new" : "",
    home.onClaim ? "on this claim" : "",
    !pinned ? "no map location" : home.precision === "area" || home.precision === "approx" ? "approximate location" : "",
  ]
    .filter(Boolean)
    .join(", ");
  // A home with no pin has nothing to point at on the map, so its hover stays in the list.
  const hover = pinned ? onHover : null;

  return (
    <li>
      <button
        type="button"
        id={`row-out-${id}`}
        data-outside={home.source}
        onClick={() => onSelect(id)}
        onMouseEnter={hover ? () => hover(id, "list") : undefined}
        onMouseLeave={hover ? () => hover(null) : undefined}
        onFocus={hover ? (e) => e.currentTarget.matches(":focus-visible") && hover(id, "focus") : undefined}
        onBlur={hover ? () => hover(null) : undefined}
        aria-pressed={selected}
        aria-label={label}
        title={pinned ? undefined : NO_MAP_LOCATION}
        className={cn(
          "flex min-h-[44px] w-full flex-col gap-1 rounded-lg border px-2 py-2 text-left",
          selected ? "border-line bg-surface-muted" : "border-transparent hover:bg-surface-muted",
          hovered && "nh-row--hover",
        )}
      >
        <span className="flex w-full items-center gap-2.5">
          <SourceLetter source={home.source} listOnly={!pinned} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="break-words font-medium max-lg:line-clamp-2 lg:truncate">{name}</span>
            <span className="text-[13px] text-muted max-lg:line-clamp-2 lg:truncate">{facts}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end leading-tight">
            <span className="font-mono text-[13px] font-semibold">{home.rent == null ? "no rent" : money(home.rent)}</span>
            <span className="text-xs text-muted">{distanceText(home, pinned)}</span>
          </span>
        </span>
        <Chips chips={chips} />
        {why ? <span className="w-full truncate pl-[19px] text-xs text-muted">{why}</span> : null}
      </button>
    </li>
  );
});

/** The divider above the listings with no pin, in Nearest order: "No map location (3)". See `noLocationStart`. */
export function NoLocationDivider({ count }: { count: number }) {
  return (
    <li role="presentation" className="mt-1 border-t border-line px-2 pb-1 pt-2 text-xs font-medium text-muted" title={NO_MAP_LOCATION}>
      No map location ({count})
    </li>
  );
}
