"use client";

import { useEffect, useRef, useState } from "react";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import type { Pin, AttachedPin } from "@/lib/types";
import { STATUS, asMapStatus, passesFilters, type MapStatus, type PinFilters } from "@/lib/status";
import { loadGoogleMaps } from "@/lib/google";

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
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const libsRef = useRef<{ marker: google.maps.MarkerLibrary } | null>(null);
  const lossMarkerRef = useRef<AdvMarker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const propertyMarkersRef = useRef<Map<string, AdvMarker>>(new Map());
  const attachedMarkersRef = useRef<Map<string, AdvMarker>>(new Map());
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
        map.addListener("zoom_changed", () => onHover(null));

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
      if (bounds) map.fitBounds(bounds, 24);
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

    for (const p of pins) {
      if (attachedIds.has(p.monday_item_id)) continue; // drawn by the attached layer instead — always visible, never faded
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;

      let m = existing.get(p.monday_item_id);
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

    const toRemove: AdvMarker[] = [];
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

// ---------- pin content builders — plain DOM, styled entirely by globals.css ----------

function buildLossPin(): HTMLElement {
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

function buildPropertyPin(
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

function buildAttachedPin(selected: boolean, hovered: boolean, chip: string, name: string): HTMLElement {
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
