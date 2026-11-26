"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { STATUS, STATUS_ORDER, type MapStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

interface RailProps {
  variant: "rail";
  counts: Record<MapStatus, number>;
  hidden: Record<MapStatus, boolean>;
  onToggle: (s: MapStatus) => void;
  touch?: boolean;
  /** Outside homes found for the open claim. Leave out (feature off, no claim) and the pill is not rendered. */
  outsideCount?: number;
  outsideHidden?: boolean;
  onToggleOutside?: () => void;
}

interface FloatingProps {
  variant: "floating";
  attachedCount: number;
  loading: boolean;
  /** Outside homes found for the open claim. Leave out and the entry is not rendered. */
  outsideCount?: number;
  /** The rail toggle is off: the entry is struck through, as the pins are off the map. */
  outsideHidden?: boolean;
  /** Phones: short labels, and the key stops 84 px short of the map's right edge so the chat bubble is clear. */
  short?: boolean;
  /** The chat window is open over the map (lg+): the key stops 396 px short and wraps; under 200 px it shows glyphs only. */
  chatOpen?: boolean;
}

type Props = RailProps | FloatingProps;

const OUTSIDE_HELP = "Zillow and Furnished Finder listings that are not in our database yet";
/** Room the floating key leaves on the right: the chat window (360 + gutters), or the bubble on a phone (48 + gutters). */
const CHAT_ROOM = 396;
const BUBBLE_ROOM = 84;
const GLYPHS_BELOW = 200;

/**
 * The map key in its two places. In the rail each colour is also a filter that counts the pins in view;
 * floating over the map it is a plain legend. "On this claim" and "Nearby grouped" are never clickable.
 */
export default function MapKey(props: Props) {
  return props.variant === "rail" ? <RailKey {...props} /> : <FloatingKey {...props} />;
}

function RailKey({ counts, hidden, onToggle, touch, outsideCount, outsideHidden = false, onToggleOutside }: RailProps) {
  const pill = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 text-[13px]",
      touch ? "min-h-[44px] px-3" : "h-7",
      on ? "border-line2 bg-surface text-ink" : "border-line bg-surface-muted text-muted line-through",
    );
  const outsideOn = !outsideHidden;
  const outsideNone = outsideCount === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dot colours">
      {STATUS_ORDER.map((s) => {
        const on = !hidden[s];
        return (
          <button key={s} type="button" aria-pressed={on} title={`${STATUS[s].help}. Click to ${on ? "hide" : "show"}.`} onClick={() => onToggle(s)} className={pill(on)}>
            <StatusDot status={s} />
            <span>{STATUS[s].label}</span>
            <span className="font-mono text-xs text-muted">{counts[s].toLocaleString("en-US")}</span>
          </button>
        );
      })}
      {outsideCount !== undefined && onToggleOutside && (
        <button
          type="button"
          data-key="outside"
          aria-pressed={outsideOn}
          disabled={outsideNone}
          title={outsideNone ? `${OUTSIDE_HELP}. None found for this claim yet.` : `${OUTSIDE_HELP}. Click to ${outsideOn ? "hide" : "show"}.`}
          onClick={onToggleOutside}
          className={cn(pill(outsideOn), "disabled:cursor-not-allowed disabled:opacity-60")}
        >
          <SourcePair />
          <span>Outside</span>
          <span className="font-mono text-xs text-muted">{outsideCount.toLocaleString("en-US")}</span>
        </button>
      )}
      <OnClaimKey label="On this claim" />
      <GroupedKey label="Nearby grouped · zoom in to split" />
    </div>
  );
}

function FloatingKey({ attachedCount, loading, outsideCount, outsideHidden = false, short = false, chatOpen = false }: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const room = chatOpen ? CHAT_ROOM : short ? BUBBLE_ROOM : 0;
  const mapWidth = useMapWidth(ref, room > 0);
  // Nothing is reserved unless asked for, so without the new props the key is laid out exactly as before.
  const maxWidth = room > 0 && mapWidth != null ? Math.max(mapWidth - room, 44) : undefined;
  const glyphs = chatOpen && maxWidth !== undefined && maxWidth < GLYPHS_BELOW;

  const text = (label: string) => <span className={cn(glyphs && "sr-only")}>{label}</span>;
  const entry = "inline-flex items-center gap-1.5";
  const onClaim = short ? `On claim (${attachedCount})` : `On this claim (${attachedCount})`;
  const grouped = short ? "Grouped" : "Nearby grouped · zoom in to split";
  const outside = outsideCount === undefined ? null : short ? `Outside (${outsideCount})` : `Outside listing (${outsideCount})`;

  return (
    <div
      ref={ref}
      data-key="floating"
      style={maxWidth !== undefined ? { maxWidth } : undefined}
      className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted"
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className={entry} title={glyphs ? "Loss" : undefined}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--loss)" }} />
        {text("Loss")}
      </span>
      {STATUS_ORDER.map((s) => (
        <span key={s} className={entry} title={glyphs ? STATUS[s].label : undefined}>
          <StatusDot status={s} />
          {text(STATUS[s].label)}
        </span>
      ))}
      <OnClaimKey label={onClaim} hideLabel={glyphs} />
      <GroupedKey label={grouped} hideLabel={glyphs} />
      {outside && (
        <span
          data-key="outside"
          className={cn(entry, outsideHidden ? "line-through" : "text-ink")}
          title={glyphs ? outside : outsideHidden ? `${OUTSIDE_HELP}. Hidden.` : `${OUTSIDE_HELP}.`}
        >
          <SourcePair />
          {text(outsideHidden ? `${outside}, hidden` : outside)}
        </span>
      )}
    </div>
  );
}

/**
 * Width of the map area the key floats over: the positioned ancestor of the key's own absolute wrapper.
 * Measured only while the key has to keep clear of the chat bubble or window.
 */
function useMapWidth(ref: React.RefObject<HTMLDivElement | null>, active: boolean): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      setWidth(null);
      return;
    }
    const wrapper = el.offsetParent as HTMLElement | null;
    const host = (wrapper?.offsetParent as HTMLElement | null) ?? wrapper ?? el.parentElement;
    if (!host) return;
    const read = () => setWidth(host.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ref, active]);
  return width;
}

/** The Z and F squares, overlapping by 3 px: what an outside listing's pin carries instead of a status dot. */
function SourcePair() {
  return (
    <span className="inline-flex flex-none items-center" aria-hidden="true">
      <span className="nh-src nh-src--sm">Z</span>
      <span className="nh-src nh-src--sm nh-src--overlap">F</span>
    </span>
  );
}

/** Black check: what an option already on this claim looks like on the map. */
function OnClaimKey({ label, hideLabel = false }: { label: string; hideLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={hideLabel ? label : undefined}>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink text-bg" aria-hidden="true">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span className={cn(hideLabel && "sr-only")}>{label}</span>
    </span>
  );
}

/** A numbered circle is several nearby properties grouped. */
function GroupedKey({ label, hideLabel = false }: { label: string; hideLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={hideLabel ? label : undefined}>
      <span
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-line2 bg-surface px-1 font-mono text-[10px] font-semibold text-ink"
        aria-hidden="true"
      >
        7
      </span>
      <span className={cn(hideLabel && "sr-only")}>{label}</span>
    </span>
  );
}
