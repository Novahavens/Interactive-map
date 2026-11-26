"use client";

// Dev-only preview of the outside-homes map layer: the pin builders and the key in every state, without Google Maps.
// Never ships: 404 in production. All data is fictional (copied from tests/fixtures/map-agent.mjs).
import { useEffect, useMemo, useRef, useState } from "react";
import { notFound } from "next/navigation";
import MapKey from "@/components/MapKey";
import { buildAttachedPin, buildLossPin, buildPropertyPin } from "@/components/MapCanvas";
import { buildOutsidePin } from "@/components/map/outside-pin";
import { outsidePassesFilters, outsideStyleKey, outsideZIndex, pinnableOutside } from "@/lib/outside-pins";
import type { MapStatus } from "@/lib/status";
import type { OutsideHome } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOSS = { lat: 36.154, lng: -95.9928 };
const home = (o: Partial<OutsideHome> & Pick<OutsideHome, "listingId" | "rank" | "title">): OutsideHome => ({
  source: "zillow", url: null, addressKnown: true, city: "Tulsa", state: "OK", beds: 3, baths: 2, rent: 2400, lat: null, lng: null,
  precision: null, distanceMiles: null, score: null, fits: true, excludedBy: [], isNew: false, inPropertyDb: false,
  propertyItemId: null, onClaim: false, hasPhone: false, availableFrom: null, pets: null, photo: null, outreach: null, ...o,
});
const id = (n: number) => `11111111-1111-4111-8111-11111111110${n}`;
const HOMES: OutsideHome[] = [
  home({ listingId: id(1), rank: 1, title: "4100 Sample Ave", lat: 36.1612, lng: -95.9801, precision: "exact", distanceMiles: 0.9, score: 91, rent: 2350, hasPhone: true, pets: "Pets allowed", photo: "https://example.com/photos/4100.jpg" }),
  home({ listingId: id(2), rank: 2, title: "77 Placeholder Ln", lat: 36.1399, lng: -95.9702, precision: "exact", distanceMiles: 1.6, score: 86, rent: 2600, beds: 4, baths: 2.5, isNew: true, photo: "https://example.com/photos/77.jpg" }),
  home({ listingId: id(3), rank: 3, title: "912 Example St", lat: 36.1702, lng: -96.0105, precision: "exact", distanceMiles: 1.5, score: 80, rent: 2200, inPropertyDb: true, propertyItemId: "9900000101", onClaim: true }),
  home({ listingId: id(4), rank: 4, title: "2300 Fixture Blvd", lat: 36.1208, lng: -95.9406, precision: "approx", distanceMiles: 3.7, score: 72, rent: 2500, isNew: true }),
  home({ listingId: id(5), rank: 5, source: "furnished_finder", title: "Cozy 3BR near Midtown", addressKnown: false, lat: 36.1335, lng: -95.9609, precision: "area", distanceMiles: 2.3, rent: 2700, pets: "Pets allowed" }),
  home({ listingId: id(6), rank: 6, source: "furnished_finder", title: "Furnished bungalow, fenced yard", addressKnown: false, precision: "area", rent: 2450, beds: 2, baths: 1 }),
  home({ listingId: id(7), rank: 7, source: "furnished_finder", title: "Quiet 3BR for traveling families", addressKnown: false, precision: "area", rent: 2550, city: "Broken Arrow" }),
  home({ listingId: id(8), rank: 8, title: "5 Stretch Ct", lat: 36.0903, lng: -95.9204, precision: "exact", distanceMiles: 5.9, score: 48, rent: 3400, beds: 4, baths: 3, fits: false, excludedBy: ["rent"] }),
];
const Z = HOMES[0];
const F = HOMES[4];
const OURS: { id: string; name: string; status: MapStatus; rate: string; lat: number; lng: number; approx?: boolean }[] = [
  { id: "9900000102", name: "18 Invented Rd", status: "green", rate: "$2.9k", lat: 36.168, lng: -95.948 },
  { id: "9900000103", name: "40 Made Up Way", status: "yellow", rate: "$2.7k", lat: 36.112, lng: -96.004 },
  { id: "9900000104", name: "6 Pretend Pl", status: "red", rate: "$1.9k", lat: 36.146, lng: -96.02 },
];
const NONE_HIDDEN: Record<MapStatus, boolean> = { green: false, yellow: false, red: false };
const COUNTS: Record<MapStatus, number> = { green: 14, yellow: 31, red: 5 };

export default function MapLayerPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-dvh bg-bg p-3 text-ink sm:p-6">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="nh-eyebrow">Dev preview · map layer</p>
            <h1 className="text-lg font-semibold">Outside homes on the map</h1>
          </div>
          <ThemeButton />
        </header>

        <Block title="Our pins today, for comparison" note="Green circle, yellow diamond, red square, on this claim, loss, a group. Unchanged.">
          <Stage testId="stage-ours">
            <Cell label="Used before"><Pin build={() => buildPropertyPin("green", false, false, true, "$2.9k", "18 Invented Rd")} /></Cell>
            <Cell label="Neutral"><Pin build={() => buildPropertyPin("yellow", false, false, true, "$2.7k", "40 Made Up Way")} /></Cell>
            <Cell label="Do not use"><Pin build={() => buildPropertyPin("red", false, false, true, "$1.9k", "6 Pretend Pl")} /></Cell>
            <Cell label="Neutral, approximate"><Pin build={() => buildPropertyPin("yellow", false, false, true, "$2.6k", "9 Sample Sq", true)} /></Cell>
            <Cell label="On this claim"><Pin build={() => buildAttachedPin(false, false, "$2.2k", "912 Example St")} /></Cell>
            <Cell label="Loss"><Pin build={buildLossPin} /></Cell>
            <Cell label="Group"><span className="nh-cluster">7</span></Cell>
          </Stage>
        </Block>

        <Block title="Outside pin, every state" note="Ink outline and the source letter. No colour of its own.">
          <Stage testId="stage-outside">
            <Cell label="Exact · Zillow" testId="pin-exact"><Pin build={() => buildOutsidePin(Z)} /></Cell>
            <Cell label="Exact · Furnished Finder" testId="pin-exact-f"><Pin build={() => buildOutsidePin({ ...F, precision: "exact" })} /></Cell>
            <Cell label="Near (approximate)" testId="pin-near"><Pin build={() => buildOutsidePin(HOMES[3])} /></Cell>
            <Cell label="Area only (dashed)" testId="pin-area"><Pin build={() => buildOutsidePin(F)} /></Cell>
            <Cell label="Hover" testId="pin-hover"><Pin build={() => buildOutsidePin(Z, { hovered: true })} /></Cell>
            <Cell label="Selected" testId="pin-selected"><Pin build={() => buildOutsidePin(Z, { selected: true })} /></Cell>
            <Cell label="Selected · area only" testId="pin-selected-area"><Pin build={() => buildOutsidePin(F, { selected: true })} /></Cell>
            <Cell label="Dimmed by a filter" testId="pin-dimmed"><Pin build={() => buildOutsidePin(Z, { shown: false })} /></Cell>
            <Cell label="No rent yet" testId="pin-noprice"><Pin build={() => buildOutsidePin({ ...Z, rent: null })} /></Cell>
            <Cell label="Another site" testId="pin-other"><Pin build={() => buildOutsidePin({ ...Z, source: "apartments_com", score: null })} /></Cell>
          </Stage>
        </Block>

        <Block title="Layer behaviour" note="Hover and click the pins. The Outside pill removes them; “Pets allowed” dims the ones that do not say so.">
          <MiniMap />
        </Block>

        <Block title="Key in the rail">
          <RailStates />
        </Block>

        <Block title="Key over the map">
          <FloatingStates />
        </Block>
      </div>
    </main>
  );
}

// ---------- the pin builders, mounted as they are in an AdvancedMarkerElement ----------

function Pin({ build, className }: { build: () => HTMLElement; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(buildRef.current());
    return () => host.replaceChildren();
  }, []);
  return <span ref={ref} className={cn("inline-flex", className)} />;
}

/** Stand-in for the map tiles: a muted surface with a faint street grid. */
const TILES =
  "bg-surface-muted bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] bg-[size:56px_56px]";

function Stage({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId} className={cn("flex flex-wrap items-end gap-x-8 gap-y-6 rounded-lg border border-line px-6 pb-4 pt-10", TILES)}>
      {children}
    </div>
  );
}

function Cell({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex min-w-[88px] flex-col items-center gap-3">
      {children}
      <span className="rounded bg-surface px-1.5 py-0.5 text-center text-[11px] text-muted">{label}</span>
    </div>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

function ThemeButton() {
  return (
    <button
      type="button"
      className="h-8 rounded-md border border-line2 bg-surface px-3 text-[13px]"
      onClick={() => {
        const el = document.documentElement;
        el.setAttribute("data-theme", el.getAttribute("data-theme") === "dark" ? "light" : "dark");
      }}
    >
      Theme
    </button>
  );
}

// ---------- a small fake map driven by the same rules MapCanvas uses ----------

function MiniMap() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState(NONE_HIDDEN);
  const [outsideHidden, setOutsideHidden] = useState(false);
  const [pets, setPets] = useState(false);
  const filters = useMemo(() => ({ pets, photos: false, priced: false }), [pets]);

  // What the coordinator does: only homes that should have a pin; 912 Example St is on the claim, so it is ours.
  const { homes: pins } = useMemo(() => pinnableOutside(HOMES, { drawnPropertyIds: new Set(OURS.map((o) => o.id)) }), []);
  const attached = HOMES.filter((h) => h.onClaim && h.lat != null && h.lng != null);
  const at = (lat: number, lng: number) => ({
    left: `${50 + ((lng - LOSS.lng) / 0.11) * 42}%`,
    top: `${50 - ((lat - LOSS.lat) / 0.075) * 40}%`,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <MapKey
          variant="rail"
          counts={COUNTS}
          hidden={hidden}
          onToggle={(s) => setHidden((h) => ({ ...h, [s]: !h[s] }))}
          outsideCount={HOMES.filter((h) => !h.onClaim).length}
          outsideHidden={outsideHidden}
          onToggleOutside={() => setOutsideHidden((v) => !v)}
        />
        <button
          type="button"
          aria-pressed={pets}
          data-testid="filter-pets"
          onClick={() => setPets((v) => !v)}
          className={cn("h-7 rounded-full border px-2.5 text-[13px]", pets ? "border-ink bg-ink text-bg" : "border-line2 bg-surface text-ink")}
        >
          Pets allowed
        </button>
        <span className="text-xs text-muted" data-testid="mini-state" aria-live="polite">
          {selected ? `Selected: ${HOMES.find((h) => h.listingId === selected)?.title}` : "Nothing selected"}
        </span>
      </div>
      <div data-testid="mini-map" className={cn("relative h-[420px] overflow-hidden rounded-lg border border-line", TILES)}>
        <Abs style={{ ...at(LOSS.lat, LOSS.lng), zIndex: 5000 }}><Pin build={buildLossPin} /></Abs>
        {OURS.map((o) => (
          <Abs key={`${o.id}:${hidden[o.status]}`} style={{ ...at(o.lat, o.lng), zIndex: o.status === "green" ? 300 : o.status === "red" ? 100 : 200 }}>
            <Pin build={() => buildPropertyPin(o.status, false, false, !hidden[o.status], o.rate, o.name)} />
          </Abs>
        ))}
        {attached.map((h) => (
          <Abs key={h.listingId} style={{ ...at(h.lat!, h.lng!), zIndex: 900 }}>
            <Pin build={() => buildAttachedPin(false, false, "$2.2k", h.title)} />
          </Abs>
        ))}
        {!outsideHidden &&
          pins.map((h) => {
            const state = { selected: selected === h.listingId, hovered: hovered === h.listingId, shown: outsidePassesFilters(h, filters) };
            return (
              <Abs
                key={h.listingId}
                style={{ ...at(h.lat!, h.lng!), zIndex: state.selected ? 4000 : state.hovered ? 3500 : outsideZIndex(h) }}
                data-outside={h.listingId}
                onClick={() => setSelected((cur) => (cur === h.listingId ? null : h.listingId))}
                onMouseEnter={() => setHovered(h.listingId)}
                onMouseLeave={() => setHovered(null)}
              >
                <Pin key={outsideStyleKey(h, state)} build={() => buildOutsidePin(h, state)} />
              </Abs>
            );
          })}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)]">
          <MapKey variant="floating" attachedCount={attached.length} loading={false} outsideCount={HOMES.filter((h) => !h.onClaim).length} outsideHidden={outsideHidden} />
        </div>
      </div>
    </div>
  );
}

function Abs({ children, style, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} style={style} className="absolute -translate-x-1/2 -translate-y-full">
      {children}
    </div>
  );
}

// ---------- key states ----------

function RailStates() {
  const [hidden, setHidden] = useState(NONE_HIDDEN);
  const toggle = (s: MapStatus) => setHidden((h) => ({ ...h, [s]: !h[s] }));
  const [off, setOff] = useState(false);
  const rows: { label: string; testId: string; node: React.ReactNode }[] = [
    { label: "Today (feature off: no Outside pill)", testId: "rail-today", node: <MapKey variant="rail" counts={COUNTS} hidden={hidden} onToggle={toggle} /> },
    { label: "Outside on (click it)", testId: "rail-on", node: <MapKey variant="rail" counts={COUNTS} hidden={hidden} onToggle={toggle} outsideCount={12} outsideHidden={off} onToggleOutside={() => setOff((v) => !v)} /> },
    { label: "Outside off", testId: "rail-off", node: <MapKey variant="rail" counts={COUNTS} hidden={hidden} onToggle={toggle} outsideCount={12} outsideHidden onToggleOutside={() => {}} /> },
    { label: "No outside homes found (disabled)", testId: "rail-zero", node: <MapKey variant="rail" counts={COUNTS} hidden={hidden} onToggle={toggle} outsideCount={0} onToggleOutside={() => {}} /> },
    { label: "Touch (44 px)", testId: "rail-touch", node: <MapKey variant="rail" touch counts={COUNTS} hidden={hidden} onToggle={toggle} outsideCount={12} onToggleOutside={() => {}} /> },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.testId} className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted">{r.label}</span>
          <div data-testid={r.testId} className="w-full max-w-[320px] rounded-lg border border-line bg-surface p-3">
            {r.node}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A map-sized frame with the key where MapApp puts it, plus stand-ins for the chat bubble and window. */
function Frame({ label, testId, width, height = 220, bubble, chat, children }: { label: string; testId: string; width: number; height?: number; bubble?: "desktop" | "phone"; chat?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      <div data-testid={testId} style={{ width, height, maxWidth: "100%" }} className={cn("relative overflow-hidden rounded-lg border border-line", TILES)}>
        <div className={cn("pointer-events-none absolute left-3 z-10 max-w-[calc(100%-24px)]", bubble === "phone" ? "bottom-[68px]" : "bottom-3")}>{children}</div>
        {chat && (
          <div data-testid="chat-standin" className="absolute right-3 top-3 flex w-[min(360px,calc(100%-24px))] items-start justify-center rounded-[14px] border border-line2 bg-surface p-3 text-xs text-muted" style={{ bottom: 84 }}>
            Chat window (other pillar)
          </div>
        )}
        {bubble && (
          <div data-testid="bubble-standin" aria-hidden="true" className={cn("absolute right-3 h-12 w-12 rounded-full bg-ink", bubble === "phone" ? "bottom-[68px]" : "bottom-6")} />
        )}
        {bubble === "phone" && <div className="absolute inset-x-0 bottom-0 flex h-14 items-center border-t border-line bg-surface px-3 text-xs text-muted">Results sheet</div>}
      </div>
    </div>
  );
}

function FloatingStates() {
  return (
    <div className="flex flex-col gap-4">
      <Frame label="Today (feature off)" testId="float-today" width={760} height={120}>
        <MapKey variant="floating" attachedCount={3} loading={false} />
      </Frame>
      <Frame label="With outside listings, bubble closed" testId="float-outside" width={900} height={120} bubble="desktop">
        <MapKey variant="floating" attachedCount={3} loading={false} outsideCount={12} />
      </Frame>
      <Frame label="Loading" testId="float-loading" width={900} height={120} bubble="desktop">
        <MapKey variant="floating" attachedCount={3} loading outsideCount={12} />
      </Frame>
      <Frame label="Outside hidden by the rail pill" testId="float-hidden" width={900} height={120} bubble="desktop">
        <MapKey variant="floating" attachedCount={3} loading={false} outsideCount={12} outsideHidden />
      </Frame>
      <Frame label="Chat open (lg+): stops 396 px short and wraps" testId="float-chat" width={900} height={360} bubble="desktop" chat>
        <MapKey variant="floating" attachedCount={3} loading={false} outsideCount={12} chatOpen />
      </Frame>
      <Frame label="Chat open, map under 600 px: glyphs only" testId="float-glyphs" width={560} height={300} bubble="desktop" chat>
        <MapKey variant="floating" attachedCount={3} loading={false} outsideCount={12} chatOpen />
      </Frame>
      <Frame label="Phone, 360 px: short labels, clear of the bubble" testId="float-short" width={336} height={300} bubble="phone">
        <MapKey variant="floating" attachedCount={3} loading={false} outsideCount={12} short />
      </Frame>
    </div>
  );
}
