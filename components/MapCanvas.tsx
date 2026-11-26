"use client";

import { useEffect, useRef, useState } from "react";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import type { Pin, AttachedPin, OutsideHome } from "@/lib/types";
import { STATUS, asMapStatus, passesFilters, type MapStatus, type PinFilters } from "@/lib/status";
import { loadGoogleMaps } from "@/lib/google";
import { hasCoords, outsidePassesFilters, outsideStyleKey, outsideZIndex, OUTSIDE_PIN_CAP } from "@/lib/outside-pins";
import { buildOutsidePin } from "./map/outside-pin";

// Semantic colours — must match the --loss/--database/--preferred/--dnu/--focus
// tokens in globals.css. Identical in light and dark, so plain hex is fine here;
// the chip surface itself (bg/border/text) comes from CSS custom properties so
// it flips with the theme automatically.
// Property dots take their colour and shape from lib/status.ts (green / yellow / red, never anything else).
const PIN_COLORS = {
  loss: "#f5a623",
  attached: "#111111",
} as const;

const METERS_PER_MILE = 1609.344;
const HOVER_Z = 3500; // above every pin, below the selected pin (4000) and the loss pin (5000)

interface Props {
  apiKey: string;
  mapId: string;
  center: { lat: number; lng: number } | null;
  radiusMiles: number;
  pins: Pin[];
  attachedPins: AttachedPin[];
  attachedIds: Set<string>;
  selectedId: string | null;
  /** Property under the pointer or keyboard focus in the list (or on the map). */
  hoveredId: string | null;
  /** Pan to the hovered pin when it is off screen. Only pointer hover over a list row asks for this. */
  panToHovered: boolean;
  filters: PinFilters;
  onSelect: (id: string) => void;
  /** Must be stable: pin elements keep the callback they were built with. */
  onHover: (id: string | null) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  /**
   * Homes found outside our database, each drawn as an ink-outline pin with its source letter. Pass only homes
   * that should have a pin (see pinnableOutside in lib/outside-pins.ts); homes without coordinates are skipped
   * and at most 50 are drawn. Absent or empty = no outside layer, the map is exactly as before.
   */
  outside?: OutsideHome[];
  selectedOutsideId?: string | null;
  hoveredOutsideId?: string | null;
  /** The key's "Outside" toggle is off: the pins are removed, not dimmed. */
  outsideHidden?: boolean;
  onSelectOutside?: (listingId: string) => void;
  onHoverOutside?: (listingId: string | null) => void;
  /** Move Google's zoom control to the top right, so the chat bubble can sit bottom right. */
  zoomTopRight?: boolean;
  /**
   * Pixels on the map's right / bottom edge covered by something floating over it (the open chat window on lg+).
   * Fitting the radius pads by it, and a newly selected pin that lands under it is panned clear once (pan, no zoom).
   * Absent or null = today's behaviour.
   */
  avoid?: { right: number; bottom: number } | null;
}

type AdvMarker = google.maps.marker.AdvancedMarkerElement;

function chipMoney(n: number | null): string {
  if (n == null) return "—";
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
}

/**
 * Imperative Google Maps layer. The map is created exactly once and mutated
 * afterwards (E4-T1); React state changes only touch markers, the circle and the viewport.
 */
export default function MapCanvas({
  apiKey,
  mapId,
  center,
  radiusMiles,
  pins,
  attachedPins,
  attachedIds,
  selectedId,
  hoveredId,
  panToHovered,
  filters,
  onSelect,
  onHover,
  onReady,
  onError,
  outside,
  selectedOutsideId = null,
  hoveredOutsideId = null,
  outsideHidden = false,
  onSelectOutside,
  onHoverOutside,
  zoomTopRight = false,
  avoid = null,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const libsRef = useRef<{ marker: google.maps.MarkerLibrary } | null>(null);
  const lossMarkerRef = useRef<AdvMarker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const propertyMarkersRef = useRef<Map<string, AdvMarker>>(new Map());
  const attachedMarkersRef = useRef<Map<string, AdvMarker>>(new Map());
  const outsideMarkersRef = useRef<Map<string, AdvMarker>>(new Map());
  // Outside markers and the map's own listeners keep the callbacks they were built with, so they read the latest here.
  const outsideCbRef = useRef({ onSelectOutside, onHoverOutside });
  outsideCbRef.current = { onSelectOutside, onHoverOutside };
  const zoomMovedRef = useRef(false);
  const avoidRef = useRef(avoid);
  avoidRef.current = avoid;
  const [ready, setReady] = useState(false);
  const lastFitKeyRef = useRef<string>("");

  // ---- create the map once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGoogleMaps(apiKey);
        if (cancelled || !divRef.current) return;
        const { Map } = (await g.importLibrary("maps")) as google.maps.MapsLibrary;
        const marker = (await g.importLibrary("marker")) as google.maps.MarkerLibrary;
        libsRef.current = { marker };

        const map = new Map(divRef.current, {
          center: center ?? { lat: 39.5, lng: -98.35 },
          zoom: center ? 11 : 4,
          mapId,
          // Chrome stripped to zoom + attribution. Clickable POIs off (E5).
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          keyboardShortcuts: false,
        });
        mapRef.current = map;
        // A pin the clusterer swallows (zoom, radius change) is removed from under the pointer without a mouseleave.
        map.addListener("zoom_changed", () => {
          onHover(null);
          outsideCbRef.current.onHoverOutside?.(null);
        });

        clustererRef.current = new MarkerClusterer({
          map,
          markers: [],
          algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 14 }),
          renderer: {
            render: ({ count, position }) => {
              const el = document.createElement("div");
              el.className = "nh-cluster";
              el.textContent = String(count);
              return new marker.AdvancedMarkerElement({
                position,
                content: el,
                zIndex: 1000 + count,
              });
            },
          },
        });

        setReady(true);
        onReady?.();
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Google Maps failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId]);

  // ---- loss pin + radius circle ----
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;

    if (!center) {
      lossMarkerRef.current && (lossMarkerRef.current.map = null);
      circleRef.current?.setMap(null);
      return;
    }

    if (!lossMarkerRef.current) {
      lossMarkerRef.current = new libs.marker.AdvancedMarkerElement({
        map,
        position: center,
        content: buildLossPin(),
        title: "Loss address",
        zIndex: 5000,
      });
    } else {
      lossMarkerRef.current.position = center;
      lossMarkerRef.current.map = map;
    }

    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        map,
        center,
        radius: radiusMiles * METERS_PER_MILE,
        strokeColor: "#b8860b",
        strokeOpacity: 0.7,
        strokeWeight: 1,
        fillColor: PIN_COLORS.loss,
        fillOpacity: 0.06,
        clickable: false,
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radiusMiles * METERS_PER_MILE);
      circleRef.current.setMap(map);
    }

    // Fit the viewport to the circle whenever the centre or radius changes.
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${radiusMiles}`;
    if (key !== lastFitKeyRef.current) {
      lastFitKeyRef.current = key;
      const bounds = circleRef.current.getBounds();
      const a = avoidRef.current;
      if (bounds) map.fitBounds(bounds, a ? { top: 24, left: 24, right: 24 + a.right, bottom: 24 + a.bottom } : 24);
    }
  }, [ready, center, radiusMiles]);

  // ---- property pins (clustered) ----
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    const clusterer = clustererRef.current;
    if (!map || !libs || !clusterer) return;

    const existing = propertyMarkersRef.current;
    const next = new Map<string, AdvMarker>();
    const toAdd: AdvMarker[] = [];
    const toRemove: AdvMarker[] = [];

    for (const p of pins) {
      if (attachedIds.has(p.monday_item_id)) continue; // drawn by the attached layer instead — always visible, never faded
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;

      let m = existing.get(p.monday_item_id);
      // The address was edited on the map: the pin gets a new marker, because the clusterer rebuilds its index
      // only when the set of markers changes, not when one of them moves.
      if (m && !atPosition(m, p.lat, p.lng)) {
        toRemove.push(m);
        m = undefined;
      }
      const status = asMapStatus(p.map_status);
      const selected = selectedId === p.monday_item_id;
      const shown = passesFilters(p, filters);
      if (!m) {
        m = new libs.marker.AdvancedMarkerElement({
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          gmpClickable: true,
        });
        m.addListener("click", () => onSelect(p.monday_item_id));
        toAdd.push(m);
      }
      const approx = p.approximate === true;
      const hovered = hoveredId === p.monday_item_id;
      const chip = chipMoney(p.monthly_rate);
      const key = `${status}:${selected ? 1 : 0}:${hovered ? 1 : 0}:${shown ? 1 : 0}:${approx ? 1 : 0}:${chip}`;
      const z = selected ? 4000 : hovered ? HOVER_Z : status === "green" ? 300 : status === "red" ? 100 : 200;
      if (setPinContent(m, key, p.monday_item_id, onHover, () => buildPropertyPin(status, selected, hovered, shown, chip, p.name, approx))) m.zIndex = z;
      next.set(p.monday_item_id, m);
    }

    for (const [id, m] of existing) {
      if (!next.has(id)) toRemove.push(m);
    }
    if (toRemove.length) clusterer.removeMarkers(toRemove, true);
    if (toAdd.length) clusterer.addMarkers(toAdd, true);
    if (toRemove.length || toAdd.length) clusterer.render();
    propertyMarkersRef.current = next;
  }, [ready, pins, attachedIds, selectedId, hoveredId, filters, onSelect, onHover]);

  // ---- attached options (black chip, never clustered, regardless of radius) ----
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;

    const existing = attachedMarkersRef.current;
    const next = new Map<string, AdvMarker>();
    for (const a of attachedPins) {
      if (typeof a.lat !== "number" || typeof a.lng !== "number") continue;
      let m = existing.get(a.monday_item_id);
      const selected = selectedId === a.monday_item_id;
      if (!m) {
        m = new libs.marker.AdvancedMarkerElement({
          map,
          position: { lat: a.lat, lng: a.lng },
          title: a.name,
          gmpClickable: true,
        });
        m.addListener("click", () => onSelect(a.monday_item_id));
      } else if (!atPosition(m, a.lat, a.lng)) {
        m.position = { lat: a.lat, lng: a.lng }; // the address was edited on the map; not clustered, so a move is enough
      }
      const hovered = hoveredId === a.monday_item_id;
      const chip = chipMoney(a.monthly_rate);
      const key = `attached:${selected ? 1 : 0}:${hovered ? 1 : 0}:${chip}`;
      if (setPinContent(m, key, a.monday_item_id, onHover, () => buildAttachedPin(selected, hovered, chip, a.name))) {
        m.zIndex = selected ? 4000 : hovered ? HOVER_Z : 900;
      }
      m.map = map;
      next.set(a.monday_item_id, m);
    }
    for (const [id, m] of existing) {
      if (!next.has(id)) m.map = null;
    }
    attachedMarkersRef.current = next;
  }, [ready, attachedPins, selectedId, hoveredId, onSelect, onHover]);

  // ---- outside homes (ink outline + source letter; their own layer, never clustered with ours) ----
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;

    const existing = outsideMarkersRef.current;
    const next = new Map<string, AdvMarker>();
    if (!outsideHidden) {
      for (const h of outside ?? []) {
        if (next.size >= OUTSIDE_PIN_CAP) break;
        if (!hasCoords(h) || next.has(h.listingId)) continue;
        const id = h.listingId;
        let m = existing.get(id);
        if (!m) {
          m = new libs.marker.AdvancedMarkerElement({
            map,
            position: { lat: h.lat, lng: h.lng },
            title: h.title,
            gmpClickable: true,
          });
          m.addListener("click", () => outsideCbRef.current.onSelectOutside?.(id));
        } else if (!atPosition(m, h.lat, h.lng)) {
          m.position = { lat: h.lat, lng: h.lng }; // not clustered, so a move is enough
        }
        const selected = selectedOutsideId === id;
        const hovered = hoveredOutsideId === id;
        const shown = outsidePassesFilters(h, filters);
        const key = outsideStyleKey(h, { selected, hovered, shown });
        if ((m.content as HTMLElement | null)?.dataset.key !== key) {
          const el = buildOutsidePin(h, { selected, hovered, shown });
          el.dataset.key = key;
          el.addEventListener("mouseenter", () => outsideCbRef.current.onHoverOutside?.(id));
          el.addEventListener("mouseleave", () => outsideCbRef.current.onHoverOutside?.(null));
          m.content = el;
          m.zIndex = selected ? 4000 : hovered ? HOVER_Z : outsideZIndex(h);
        }
        if (m.map !== map) m.map = map;
        next.set(id, m);
      }
    }
    // Hidden by the key, added to the claim, or gone from the search: off the map, not dimmed.
    for (const [id, m] of existing) {
      if (!next.has(id)) m.map = null;
    }
    outsideMarkersRef.current = next;
  }, [ready, outside, outsideHidden, selectedOutsideId, hoveredOutsideId, filters]);

  // ---- zoom control: top right while the chat bubble owns the bottom right ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!zoomTopRight && !zoomMovedRef.current) return; // never asked for: leave Google's default alone
    zoomMovedRef.current = zoomTopRight;
    map.setOptions({
      zoomControlOptions: { position: zoomTopRight ? google.maps.ControlPosition.RIGHT_TOP : google.maps.ControlPosition.RIGHT_BOTTOM },
    });
  }, [ready, zoomTopRight]);

  // A pin inside a numbered group is not on the map (the clusterer owns it), so there is nothing to highlight
  // until the group is zoomed open; the row still highlights. The map is panned, never zoomed.
  useEffect(() => {
    if (!hoveredId || !panToHovered) return;
    const map = mapRef.current;
    const pos = (propertyMarkersRef.current.get(hoveredId) ?? attachedMarkersRef.current.get(hoveredId))?.position;
    if (!map || !pos) return;
    const t = window.setTimeout(() => {
      const bounds = map.getBounds();
      if (bounds && !bounds.contains(pos)) map.panTo(pos);
    }, 150);
    return () => window.clearTimeout(t);
  }, [hoveredId, panToHovered]);

  // The same for an outside home hovered in the list.
  useEffect(() => {
    if (!hoveredOutsideId || !panToHovered) return;
    const map = mapRef.current;
    const pos = outsideMarkersRef.current.get(hoveredOutsideId)?.position;
    if (!map || !pos) return;
    const t = window.setTimeout(() => {
      const bounds = map.getBounds();
      if (bounds && !bounds.contains(pos)) map.panTo(pos);
    }, 150);
    return () => window.clearTimeout(t);
  }, [hoveredOutsideId, panToHovered]);

  // A pin selected while the chat window covers part of the map: if it sits under the window, pan it clear once.
  const avoidRight = avoid?.right ?? 0;
  const avoidBottom = avoid?.bottom ?? 0;
  useEffect(() => {
    if (!avoidRight && !avoidBottom) return;
    const map = mapRef.current;
    const marker = selectedOutsideId
      ? outsideMarkersRef.current.get(selectedOutsideId)
      : selectedId
        ? (propertyMarkersRef.current.get(selectedId) ?? attachedMarkersRef.current.get(selectedId))
        : undefined;
    const pos = marker?.position;
    if (!map || !pos) return;
    const t = window.setTimeout(() => {
      const shift = panClear(map, pos, avoidRight, avoidBottom);
      if (shift) map.panBy(shift.x, shift.y);
    }, 50);
    return () => window.clearTimeout(t);
  }, [ready, selectedId, selectedOutsideId, avoidRight, avoidBottom]);

  return <div ref={divRef} className="h-full w-full" aria-label="Property map" />;
}

/** Rebuilds a marker's element only when its style key changes, so the element under the pointer is not replaced for nothing. */
function setPinContent(m: AdvMarker, key: string, id: string, onHover: Props["onHover"], build: () => HTMLElement): boolean {
  if ((m.content as HTMLElement | null)?.dataset.key === key) return false;
  const el = build();
  el.dataset.key = key;
  el.addEventListener("mouseenter", () => onHover(id));
  el.addEventListener("mouseleave", () => onHover(null));
  m.content = el;
  return true;
}

/**
 * How far to pan so a point covered by the avoided strip on the right / bottom lands in the middle of the free area.
 * Null when the point is already clear (or the map has no projection yet).
 */
function panClear(
  map: google.maps.Map,
  pos: google.maps.LatLng | google.maps.LatLngLiteral | google.maps.LatLngAltitudeLiteral,
  right: number,
  bottom: number,
): { x: number; y: number } | null {
  const proj = map.getProjection();
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const div = map.getDiv();
  if (!proj || !bounds || zoom == null) return null;
  const scale = 2 ** zoom;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const origin = proj.fromLatLngToPoint(new google.maps.LatLng(ne.lat(), sw.lng()));
  const pt = proj.fromLatLngToPoint(pos instanceof google.maps.LatLng ? pos : new google.maps.LatLng(pos.lat, pos.lng));
  if (!origin || !pt) return null;
  const x = (pt.x - origin.x) * scale;
  const y = (pt.y - origin.y) * scale;
  const freeW = div.clientWidth - right;
  const freeH = div.clientHeight - bottom;
  const PAD = 24;
  const dx = right && x > freeW - PAD ? x - freeW / 2 : 0;
  const dy = bottom && y > freeH - PAD ? y - freeH / 2 : 0;
  return dx || dy ? { x: Math.round(dx), y: Math.round(dy) } : null;
}

// ---------- pin content builders — plain DOM, styled entirely by globals.css ----------

export function buildLossPin(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "nh-loss";
  wrap.innerHTML = `
    <span class="nh-loss__chip">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg>
      <span>Loss</span>
    </span>
    <span class="nh-loss__caret"></span>
  `;
  return wrap;
}

export function buildPropertyPin(
  status: MapStatus,
  selected: boolean,
  hovered: boolean,
  shown: boolean,
  chip: string,
  name: string,
  approximate = false,
): HTMLElement {
  const wrap = document.createElement("div");
  const classes = ["nh-pin"];
  if (selected) classes.push("nh-pin--selected");
  if (hovered) classes.push("nh-pin--hover");
  if (status === "red") classes.push("nh-pin--dnu");
  if (!shown) classes.push("nh-pin--dimmed");
  if (approximate) classes.push("nh-pin--approx");
  wrap.className = classes.join(" ");
  wrap.setAttribute("role", "button");
  const label = status === "green" ? "used before" : status === "red" ? "do not use" : "neutral";
  wrap.setAttribute("aria-label", `${name}, ${chip}, ${label}${approximate ? ", approximate location" : ""}`);
  wrap.innerHTML = `
    <span class="nh-pin__chip">
      <span class="nh-dot nh-dot--${STATUS[status].shape}" style="background:${STATUS[status].color}"></span>
      ${approximate ? '<span class="nh-pin__approx" aria-hidden="true">≈</span>' : ""}
      <span>${chip}</span>
    </span>
    <span class="nh-pin__caret"></span>
  `;
  return wrap;
}

export function buildAttachedPin(selected: boolean, hovered: boolean, chip: string, name: string): HTMLElement {
  const wrap = document.createElement("div");
  const classes = ["nh-pin", "nh-pin--attached"];
  if (selected) classes.push("nh-pin--selected");
  if (hovered) classes.push("nh-pin--hover");
  wrap.className = classes.join(" ");
  wrap.setAttribute("role", "button");
  wrap.setAttribute("aria-label", `${name}, on this claim, ${chip}`);
  wrap.innerHTML = `
    <span class="nh-pin__chip">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
      <span>${chip}</span>
    </span>
    <span class="nh-pin__caret"></span>
  `;
  return wrap;
}

/** Whether a marker already sits at these coordinates (its position may be a LatLng or a literal). */
function atPosition(m: AdvMarker, lat: number, lng: number): boolean {
  const pos = m.position;
  if (!pos) return false;
  const cur = typeof pos.lat === "function" ? { lat: pos.lat(), lng: (pos as google.maps.LatLng).lng() } : (pos as google.maps.LatLngLiteral);
  return Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7;
}
