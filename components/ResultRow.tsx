"use client";

import { memo } from "react";
import { chipsFor } from "@/lib/chips";
import { asMapStatus } from "@/lib/status";
import type { Pin } from "@/lib/types";
import { cn, money, num, petsAllowed } from "@/lib/utils";
import StatusChips from "./StatusChips";
import { StatusDot } from "./StatusDot";

/** Where a hover came from: only the pointer over a row pans the map; keyboard focus and map hover do not. */
export type HoverSource = "list" | "focus" | "map";

interface Props {
  pin: Pin;
  selected: boolean;
  hovered: boolean;
  claimId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null, from?: HoverSource) => void;
}

// Memoised with stable callbacks so a hover change re-renders only the row that lost it and the row that got it.
export default memo(function ResultRow({ pin, selected, hovered, claimId, onSelect, onHover }: Props) {
  const id = pin.monday_item_id;
  const { chips } = chipsFor(pin, claimId);
  return (
    <li>
      <button
        type="button"
        id={`row-${id}`}
        onClick={() => onSelect(id)}
        onMouseEnter={() => onHover(id, "list")}
        onMouseLeave={() => onHover(null)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && onHover(id, "focus")}
        onBlur={() => onHover(null)}
        aria-pressed={selected}
        className={cn(
          "flex min-h-[44px] w-full flex-col gap-1 rounded-lg border px-2 py-2 text-left",
          selected ? "border-line bg-surface-muted" : "border-transparent hover:bg-surface-muted",
          hovered && "nh-row--hover",
        )}
      >
        <span className="flex w-full items-center gap-2.5">
          <StatusDot status={asMapStatus(pin.map_status)} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="break-words font-medium max-lg:line-clamp-2 lg:truncate">{pin.name}</span>
            <span className="text-[13px] text-muted max-lg:line-clamp-2 lg:truncate">
              {num(pin.bedrooms)} bd · {num(pin.bathrooms)} ba
              {petsAllowed(pin.pet_status) ? " · pets ok" : ""}
              {pin.has_photos ? " · photos" : ""}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end leading-tight">
            <span className="font-mono text-[13px] font-semibold">{pin.monthly_rate == null ? "no rent" : money(pin.monthly_rate)}</span>
            <span className="text-xs text-muted">{pin.distance_miles.toFixed(1)} mi</span>
          </span>
        </span>
        <StatusChips chips={chips} className="w-full pl-[19px]" />
      </button>
    </li>
  );
});
