"use client";

import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SheetSnap = "collapsed" | "half" | "expanded";

// Snap heights. Collapsed is a peek bar; half and expanded follow the dynamic viewport, so the iOS toolbar never hides the list.
const SNAP_CSS: Record<SheetSnap, string> = { collapsed: "56px", half: "50dvh", expanded: "92dvh" };
const COLLAPSED_PX = 56;
const snapPx = (s: SheetSnap) => (s === "collapsed" ? COLLAPSED_PX : window.innerHeight * (s === "half" ? 0.5 : 0.92));
const SLOP = 6; // px a finger travels before a touch counts as a drag
const ORDER: SheetSnap[] = ["collapsed", "half", "expanded"];

interface Props {
  snap: SheetSnap;
  onSnap: (s: SheetSnap) => void;
  /** Hidden (not unmounted) while a property panel covers the map. */
  hidden: boolean;
  countLabel: string;
  /** One-line family cheat-sheet; shown in the bar whatever the snap. */
  glance: string;
  headerOpen: boolean;
  onHeaderOpen: (open: boolean) => void;
  /** What the compact row says when the header is folded: "Loss address · 10 mi · 2 filters". */
  compactSummary: string;
  /** Search, radius, filters, legend, claim information: the collapsible header. */
  header: ReactNode;
  /** The <li> rows of the results list. */
  rows: ReactNode;
  sheetRef: RefObject<HTMLDivElement | null>;
}

/**
 * Mobile bottom sheet: one flex column (`h-full max-h-[100dvh]` of whatever height the snap gives it).
 *   handle bar   (shrink-0) drag target: grip, "N within R mi", family one-liner, filters + close
 *   compact row  (shrink-0) expanded only: folded search/radius/filters, one tap opens the header
 *   header       (shrink-0) search, radius, filters, legend, family needs, claim information
 *   results      (flex-1 min-h-0 flex flex-col) the only scroller
 *
 * Gestures: the handle bar and the compact row drag the sheet (pointer events, touch-action none). The list scrolls
 * natively (touch-action pan-y, overscroll contained). A touch that starts on the list drags the sheet only when the
 * sheet is not fully open and the finger moves up, or when the list is at its top and the finger moves down.
 */
export default function ResultsSheet({ snap, onSnap, hidden, countLabel, glance, headerOpen, onHeaderOpen, compactSummary, header, rows, sheetRef }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const drag = useRef({ startY: 0, startH: 0, h: 0, v: 0, lastY: 0, lastT: 0, active: false, moved: false });
  const justDragged = useRef(false);

  const begin = (y: number) => {
    const el = sheetRef.current;
    const d = drag.current;
    d.startY = d.lastY = y;
    d.startH = d.h = el ? el.getBoundingClientRect().height : 0;
    d.v = 0;
    d.lastT = performance.now();
    d.active = false;
    d.moved = false;
  };
  const move = (y: number) => {
    const el = sheetRef.current;
    const d = drag.current;
    if (!el) return;
    const now = performance.now();
    if (now > d.lastT) d.v = (d.lastY - y) / (now - d.lastT); // px/ms, up is positive
    d.lastY = y;
    d.lastT = now;
    d.h = Math.min(snapPx("expanded"), Math.max(COLLAPSED_PX, d.startH + (d.startY - y)));
    d.active = true;
    d.moved = true;
    el.style.transition = "none";
    el.style.height = `${d.h}px`;
  };
  const finish = useCallback(() => {
    const el = sheetRef.current;
    const d = drag.current;
    if (!d.active || !el) {
      d.active = false;
      return;
    }
    d.active = false;
    const projected = d.h + d.v * 140;
    const next = ORDER.reduce((best, s) => (Math.abs(snapPx(s) - projected) < Math.abs(snapPx(best) - projected) ? s : best), "half" as SheetSnap);
    el.style.transition = "";
    el.style.height = SNAP_CSS[next];
    if (next !== snapRef.current) onSnap(next);
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 60);
  }, [onSnap, sheetRef]);

  // Touches that start on the list: native listeners, because deciding to take over the gesture needs preventDefault.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let mode: "list" | "sheet" | null = null;
    const list = () => body.querySelector<HTMLElement>("ul");
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      mode = null;
      begin(e.touches[0].clientY);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      if (mode === null) {
        const dy = y - drag.current.startY;
        if (Math.abs(dy) < SLOP) return;
        const top = (list()?.scrollTop ?? 0) <= 0;
        if (dy < 0 && snapRef.current !== "expanded") mode = "sheet";
        else if (dy > 0 && top) mode = "sheet";
        else mode = "list";
      }
      if (mode === "sheet") {
        if (e.cancelable) e.preventDefault();
        move(y);
      }
    };
    const onEnd = () => {
      if (mode === "sheet") finish();
      mode = null;
    };
    body.addEventListener("touchstart", onStart, { passive: true });
    body.addEventListener("touchmove", onMove, { passive: false });
    body.addEventListener("touchend", onEnd);
    body.addEventListener("touchcancel", onEnd);
    return () => {
      body.removeEventListener("touchstart", onStart);
      body.removeEventListener("touchmove", onMove);
      body.removeEventListener("touchend", onEnd);
      body.removeEventListener("touchcancel", onEnd);
    };
    // begin/move are stable closures over refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish, snap === "collapsed"]);

  // Pointer drag on the handle bar and compact row (mouse, pen and touch).
  const dragProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      begin(e.clientY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!(e.buttons & 1) && e.pointerType === "mouse") return;
      const d = drag.current;
      if (!d.active) {
        if (d.startH === 0 || Math.abs(e.clientY - d.startY) < SLOP) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
      move(e.clientY);
    },
    onPointerUp: () => finish(),
    onPointerCancel: () => finish(),
    style: { touchAction: "none" } as React.CSSProperties,
  };

  const cycle = () => {
    if (justDragged.current) return;
    onSnap(snap === "collapsed" ? "half" : snap === "half" ? "expanded" : "half");
  };
  const toggleHeader = () => {
    if (justDragged.current) return;
    const next = !headerOpen;
    onHeaderOpen(next);
    if (next && snap !== "expanded") onSnap("expanded"); // the header needs the room
  };

  const open = snap !== "collapsed";

  return (
    <div
      className={cn("pointer-events-none fixed inset-0 z-40 lg:hidden", hidden && "hidden")}
      // The wrapper only exists so the scrim can sit behind the sheet; only the scrim and the sheet take touches, the map stays live above a half sheet.
    >
      {snap === "expanded" && <div className="pointer-events-auto absolute inset-0" style={{ background: "var(--scrim)" }} onClick={() => onSnap("half")} aria-hidden />}
      <div
        ref={sheetRef}
        role="region"
        data-snap={snap}
        aria-label="Search and results"
        style={{ height: SNAP_CSS[snap] }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 flex h-full max-h-[100dvh] flex-col overflow-hidden rounded-t-xl border-t border-line bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.18)] transition-[height] duration-200 ease-out motion-reduce:transition-none"
      >
        {/* handle bar */}
        <div {...dragProps} className="relative flex h-[56px] shrink-0 cursor-grab items-stretch select-none">
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-line2" />
          <button
            type="button"
            onClick={cycle}
            aria-expanded={open}
            aria-label={`${countLabel}. ${snap === "expanded" ? "Show less" : "Show more"}`}
            className="flex min-w-0 flex-1 flex-col justify-center px-3 pt-2.5 text-left"
          >
            <span className="truncate text-sm font-medium leading-5">{countLabel}</span>
            {glance && (
              <span className="truncate text-xs leading-4 text-muted" data-testid="sheet-glance">
                {glance}
              </span>
            )}
          </button>
          {snap === "half" && (
            <button
              type="button"
              onClick={toggleHeader}
              aria-expanded={headerOpen}
              aria-label="Search, radius and filters"
              className="mt-1.5 inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center self-center rounded-md text-ink"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}
          {open && (
            <button
              type="button"
              onClick={() => !justDragged.current && onSnap("collapsed")}
              aria-label="Close"
              className="mr-1 mt-1.5 inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center self-center rounded-md text-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {open && (
          <>
            {/* compact row: the header folded into one line (expanded) */}
            {snap === "expanded" && (
              <div {...dragProps} className="shrink-0 border-y border-line">
                <button
                  type="button"
                  onClick={toggleHeader}
                  aria-expanded={headerOpen}
                  aria-label="Search, radius and filters"
                  className="flex h-[44px] w-full items-center gap-2 px-3 text-left text-[13px]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{compactSummary}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", headerOpen && "rotate-180")} aria-hidden />
                </button>
              </div>
            )}

            {headerOpen && (
              <div className="nh-scroll max-h-[60%] shrink-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]" data-testid="sheet-header">
                {header}
              </div>
            )}

            {/* results: the only scroller; touch-action pan-y so vertical swipes are the browser's, sheet takeover is ours */}
            <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
              <ul
                aria-label="Results"
                className="nh-scroll flex min-h-0 flex-1 touch-pan-y flex-col gap-0.5 overflow-y-auto overscroll-y-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 [-webkit-overflow-scrolling:touch]"
              >
                {rows}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
