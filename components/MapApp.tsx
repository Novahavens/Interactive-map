"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sun,
  Moon,
  ListFilter,
  X,
  PawPrint,
  Images,
  DollarSign,
  Inbox,
} from "lucide-react";
import MapCanvas from "./MapCanvas";
import PropertyPanel from "./PropertyPanel";
import SearchBox from "./SearchBox";
import ActiveClaimsDrawer from "./ActiveClaimsDrawer";
import { useTheme } from "@/lib/useTheme";
import type { ActiveClaim, ClaimResponse, Pin, Coverage, PropertiesResponse, ApiError, AttachedPin, HealthResponse } from "@/lib/types";
import { classifyGroup } from "@/lib/types";
import { cn, money, num, dateShort } from "@/lib/utils";

const RADII = [5, 10, 15, 20, 30] as const; // Fazal, 8 Sep
const DEFAULT_RADIUS = 10;

interface Props {
  claimId: string | null;
  apiKey: string;
  mapId: string;
}

type Center = { lat: number; lng: number; address: string; source: "claim" | "search" };
type Filters = { pets: boolean; photos: boolean; priced: boolean };

const GROUP_DOT: Record<ReturnType<typeof classifyGroup>, string> = {
  database: "#17c964",
  preferred: "#7928ca",
  dnu: "#ee0000",
  unknown: "#8f8f8f",
};

export default function MapApp({ claimId: initialClaimId, apiKey, mapId }: Props) {
  const { theme, toggle } = useTheme();

  // The claim being worked: from ?claimId on load, then from the Active Claims drawer (F2).
  const [claimId, setClaimId] = useState<string | null>(initialClaimId);
  const claimIdRef = useRef(claimId);
  claimIdRef.current = claimId;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCount, setActiveCount] = useState<number | null>(null);

  const [claim, setClaim] = useState<ClaimResponse | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState<boolean>(!!claimId);

  const [center, setCenter] = useState<Center | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [filters, setFilters] = useState<Filters>({ pets: false, photos: false, priced: false });

  const [pins, setPins] = useState<Pin[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinsError, setPinsError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [railSheetOpen, setRailSheetOpen] = useState(false);

  // Attached options: what the claim already carries, plus anything added this session.
  const [attachedPins, setAttachedPins] = useState<AttachedPin[]>([]);
  const attachedIds = useMemo(() => new Set(attachedPins.map((a) => a.monday_item_id)), [attachedPins]);

  // ---- 1. read the claim ----
  const loadClaim = useCallback(async () => {
    if (!claimId) return;
    setClaimLoading(true);
    setClaimError(null);
    try {
      const res = await fetch(`/api/claim/${claimId}`, { cache: "no-store" });
      const json = (await res.json()) as ClaimResponse | ApiError;
      if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
      const c = json as ClaimResponse;
      if (claimIdRef.current !== claimId) return; // switched claims while this was in flight
      setClaim(c);
      setAttachedPins(c.attachedPins);
      if (c.loss) {
        setCenter({ lat: c.loss.lat, lng: c.loss.lng, address: c.loss.address, source: "claim" });
      } else {
        setClaimError("This claim has no damaged-residence address yet. Add it on the claim, or search an address below.");
      }
    } catch (e) {
      if (claimIdRef.current !== claimId) return;
      setClaimError(e instanceof Error ? e.message : "Could not read the claim");
    } finally {
      if (claimIdRef.current === claimId) setClaimLoading(false);
    }
  }, [claimId]);

  // Switching claims: drop everything scoped to the old one before the new claim loads,
  // so nothing (selection, attached set, an in-flight add) can land on the wrong claim.
  const selectClaim = useCallback((c: ActiveClaim) => {
    setDrawerOpen(false);
    if (c.id === claimIdRef.current) return;
    claimIdRef.current = c.id;
    setClaimId(c.id);
    setClaim(null);
    setClaimError(null);
    setAttachedPins([]);
    setSelectedId(null);
    setCenter(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng, address: c.lossAddress ?? "", source: "claim" } : null);
    const url = new URL(window.location.href);
    url.searchParams.set("claimId", c.id);
    window.history.replaceState(null, "", url);
  }, []);

  // Cmd/Ctrl+K toggles the drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawerOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void loadClaim();
  }, [loadClaim]);

  // Dry-run chip: tells whoever is testing that Add to claim will not write to Monday.
  const [dryRun, setDryRun] = useState(false);
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
      .then((h) => setDryRun(!!h?.dryRun))
      .catch(() => undefined);
  }, []);

  // ---- 2. pins inside the radius ----
  useEffect(() => {
    if (!center) return;
    const ctrl = new AbortController();
    setPinsLoading(true);
    setPinsError(null);
    (async () => {
      try {
        const qs = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), miles: String(radius) });
        const res = await fetch(`/api/properties?${qs}`, { signal: ctrl.signal, cache: "no-store" });
        const json = (await res.json()) as PropertiesResponse | ApiError;
        if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
        const data = json as PropertiesResponse;
        setPins(data.pins);
        setCoverage(data.coverage);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setPinsError(e instanceof Error ? e.message : "Could not load properties");
        setPins([]);
      } finally {
        if (!ctrl.signal.aborted) setPinsLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [center, radius]);

  const selectedPin = useMemo(() => pins.find((p) => p.monday_item_id === selectedId) ?? null, [pins, selectedId]);

  const handleAttached = useCallback(
    (propertyId: string) => {
      const p = pins.find((x) => x.monday_item_id === propertyId);
      setAttachedPins((prev) =>
        prev.some((a) => a.monday_item_id === propertyId)
          ? prev
          : [
              ...prev,
              {
                monday_item_id: propertyId,
                name: p?.name ?? "Property",
                lat: p?.lat ?? null,
                lng: p?.lng ?? null,
                group_title: p?.group_title ?? null,
                monthly_rate: p?.monthly_rate ?? null,
                bedrooms: p?.bedrooms ?? null,
                bathrooms: p?.bathrooms ?? null,
              },
            ],
      );
    },
    [pins],
  );

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setRailSheetOpen(false);
  }, []);

  const passesFilters = useCallback(
    (p: Pin) => {
      if (filters.pets && (p.pet_status ?? "").trim().toLowerCase() !== "yes") return false;
      if (filters.photos && !p.has_photos) return false;
      if (filters.priced && p.monthly_rate == null) return false;
      return true;
    },
    [filters],
  );

  const visiblePins = useMemo(() => pins.filter(passesFilters), [pins, passesFilters]);

  const needsMissing = useMemo(() => {
    if (!claim) return [];
    const missing: string[] = [];
    if (claim.needs.bedrooms == null) missing.push("Beds");
    if (claim.needs.bathrooms == null) missing.push("Baths");
    if (claim.needs.frv == null) missing.push("FRV");
    return missing;
  }, [claim]);

  const railContent = claim || center ? (
    <>
      <div className="flex flex-col gap-2.5 border-b border-line p-3">
        <SearchBox
          apiKey={apiKey}
          placeholder="Loss address"
          badge={center?.source === "claim" ? "from claim" : undefined}
          value={center?.source === "claim" ? center.address : undefined}
          onPick={(loc) => {
            setSelectedId(null);
            setCenter({ ...loc, source: "search" });
          }}
          onClear={() => {
            if (claim?.loss) setCenter({ lat: claim.loss.lat, lng: claim.loss.lng, address: claim.loss.address, source: "claim" });
            else setCenter(null);
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-muted">Radius</span>
          <div role="radiogroup" aria-label="Search radius" className="inline-flex gap-0 rounded-[7px] border border-line bg-surface-muted p-0.5">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={radius === r}
                onClick={() => setRadius(r)}
                className={cn(
                  "h-7 min-w-11 rounded-[5px] px-2 text-[13px] font-medium",
                  radius === r ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-muted",
                )}
              >
                {r} mi
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" aria-label="Filters">
          <FilterPill
            icon={<PawPrint className="h-3 w-3" />}
            label="Pets allowed"
            on={filters.pets}
            onClick={() => setFilters((f) => ({ ...f, pets: !f.pets }))}
          />
          <FilterPill
            icon={<Images className="h-3 w-3" />}
            label="Has photos"
            on={filters.photos}
            onClick={() => setFilters((f) => ({ ...f, photos: !f.photos }))}
          />
          <FilterPill
            icon={<DollarSign className="h-3 w-3" />}
            label="Rent listed"
            on={filters.priced}
            onClick={() => setFilters((f) => ({ ...f, priced: !f.priced }))}
          />
        </div>
      </div>

      {claim && (
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="nh-eyebrow">The family needs</span>
            <a
              href={`https://novahavens.monday.com/boards/9030696652/pulses/${claim.id}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs no-underline"
            >
              Edit on Monday →
            </a>
          </div>
          <ul aria-label="What the family needs" className="flex flex-wrap gap-1.5 text-[13px]">
            {claim.needs.pets != null && (
              <NeedChip label="Pets" value={num(claim.needs.pets)} />
            )}
            {claim.needs.moveIn && <NeedChip label="Move-in" value={dateShort(claim.needs.moveIn)} />}
            {claim.needs.pets == null && !claim.needs.moveIn && needsMissing.length === 0 && (
              <NeedChip label="People" value={claim.needs.adults != null || claim.needs.children != null ? `${num(claim.needs.adults)} adult(s)` : "—"} />
            )}
            {needsMissing.length > 0 && (
              <li
                className="inline-flex h-7 items-center rounded-md border border-dashed px-2.5"
                style={{ borderColor: "var(--amber-line)", color: "var(--amber-ink)" }}
              >
                {needsMissing.join(" · ")} not on claim
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex items-baseline justify-between px-3 pb-1.5 pt-2.5">
        <span className="text-[13px] text-muted">
          {center ? `${visiblePins.length.toLocaleString("en-US")} within ${radius} mi` : "—"}
        </span>
        <span className="text-xs text-muted">by distance</span>
      </div>

      <ul aria-label="Results" className="nh-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {pinsLoading && visiblePins.length === 0 ? (
          [...Array(6)].map((_, i) => <li key={i} className="nh-skeleton m-1 h-12" />)
        ) : (
          [...visiblePins]
            .sort((a, b) => a.distance_miles - b.distance_miles)
            .map((p) => {
              const on = selectedId === p.monday_item_id;
              const group = classifyGroup(p.group_title);
              return (
                <li key={p.monday_item_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p.monday_item_id)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left",
                      on ? "border-line bg-surface-muted" : "border-transparent hover:bg-surface-muted",
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GROUP_DOT[group] }} />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="truncate text-[13px] text-muted">
                        {num(p.bedrooms)} bd · {num(p.bathrooms)} ba
                        {p.pet_status?.trim().toLowerCase() === "yes" ? " · pets ok" : ""}
                        {p.has_photos ? " · photos" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end leading-tight">
                      <span className="font-mono text-[13px] font-semibold">{p.monthly_rate == null ? "no rent" : money(p.monthly_rate)}</span>
                      <span className="text-xs text-muted">{p.distance_miles.toFixed(1)} mi</span>
                    </span>
                  </button>
                </li>
              );
            })
        )}
      </ul>

      {coverage && coverage.unmapped > 0 && (
        <div className="flex flex-col gap-1 border-t border-line px-3 py-2.5 text-xs text-muted">
          <span>{coverage.unmapped.toLocaleString("en-US")} properties have no coordinates and cannot appear on any map yet.</span>
          <a
            href="https://novahavens.monday.com/boards/18415735059"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium no-underline"
          >
            What&apos;s being done about it →
          </a>
        </div>
      )}
    </>
  ) : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* ---------- Header ---------- */}
      <header className="z-20 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Active claims"
          title="Active claims (Ctrl/⌘ K)"
          className="-ml-1.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[13px] font-medium"
        >
          <Inbox className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Claims</span>
          {activeCount != null && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 font-mono text-[11px] text-bg">
              {activeCount}
            </span>
          )}
        </button>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden whitespace-nowrap font-semibold sm:inline tracking-[-0.01em]">Nova Havens</span>
          <span className="hidden text-line2 sm:inline">/</span>
          <span className="hidden whitespace-nowrap text-muted sm:inline">Claims</span>
          {claim && (
            <>
              <span className="hidden text-line2 sm:inline">/</span>
              <span className="truncate font-medium">{claim.name}</span>
              <span className="hidden shrink-0 rounded px-1.5 py-px font-mono text-[11px] text-muted sm:inline" style={{ border: "1px solid var(--line)" }}>
                {claim.id}
              </span>
            </>
          )}
          {!claimId && !claim && <span className="truncate text-muted">Property map</span>}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[13px]">
          {dryRun && (
            <span
              title="MONDAY_DRY_RUN=1: Add to claim logs the change instead of writing to Monday."
              className="inline-flex h-8 items-center rounded-md px-2.5 font-medium"
              style={{ color: "var(--amber-ink)", background: "var(--amber-bg)", border: "1px solid var(--amber-line)" }}
            >
              Dry run
            </span>
          )}
          {coverage && (
            <span
              title="Properties with no coordinates in the database cannot appear on any map until they are geocoded."
              className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 sm:inline-flex"
              style={{ color: "var(--amber-ink)", background: "var(--amber-bg)", border: "1px solid var(--amber-line)" }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--loss)" }} />
              {Math.round((coverage.mappable / (coverage.mappable + coverage.unmapped || 1)) * 100)}% of database mappable
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          {claimId && (
            <button
              type="button"
              onClick={() => void loadClaim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium"
              title="Re-read the claim from Monday"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", claimLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </header>

      <ActiveClaimsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        selectedId={claimId}
        onSelect={selectClaim}
        onCount={setActiveCount}
      />

      {/* ---------- Workspace ---------- */}
      <div className="relative flex min-h-0 flex-1">
        {/* ---------- Left rail (docked, lg+) ---------- */}
        {center && (
          <aside aria-label="Search and results" className="hidden w-80 shrink-0 flex-col border-r border-line bg-surface lg:flex">
            {railContent}
          </aside>
        )}

        {/* ---------- Map ---------- */}
        <div className="relative min-w-0 flex-1">
          {apiKey ? (
            <MapCanvas
              apiKey={apiKey}
              mapId={mapId}
              center={center}
              radiusMiles={radius}
              pins={pins}
              attachedPins={attachedPins}
              attachedIds={attachedIds}
              selectedId={selectedId}
              filters={filters}
              onSelect={onSelect}
              onError={setMapError}
            />
          ) : (
            <Blocker title="Google Maps key missing" body="Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the deployment environment." />
          )}
          {mapError && <Blocker title="Google Maps failed to load" body={mapError} />}

          {/* Empty state: the address is the whole screen */}
          {!center && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: "var(--scrim)" }}>
              <div className="flex w-full max-w-[520px] flex-col gap-3">
                <div className="flex flex-col gap-1 px-0.5">
                  <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Please enter the loss address</h1>
                  <p className="text-[13px] text-muted">
                    {claimId
                      ? claimLoading
                        ? "Loading the claim…"
                        : claimError ?? "Type the damaged-residence address."
                      : "Pick a claim from Claims (Ctrl/⌘ K) to start from its loss address, or type one."}
                  </p>
                </div>
                <SearchBox
                  apiKey={apiKey}
                  size="hero"
                  placeholder="Street, city, state"
                  onPick={(loc) => {
                    setSelectedId(null);
                    setCenter({ ...loc, source: "search" });
                  }}
                />
                <p className="px-0.5 text-xs text-muted">Suggestions by Google Places · one search is one billable session, however many keystrokes.</p>
              </div>
            </div>
          )}

          {/* Compact / mobile: floating results toggle (rail hidden below lg) */}
          {center && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 lg:hidden">
              <button
                type="button"
                onClick={() => setRailSheetOpen(true)}
                className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              >
                <ListFilter className="h-3.5 w-3.5" />
                <span>{visiblePins.length.toLocaleString("en-US")} within {radius} mi</span>
              </button>
            </div>
          )}

          {(claimError || pinsError) && center && (
            <div
              className="pointer-events-none absolute left-3 z-10 max-w-[calc(100%-24px)] lg:top-3"
              style={{ top: "3rem" }}
            >
              <div
                className="pointer-events-auto rounded-lg px-3 py-2 text-xs shadow-sm"
                style={{ border: "1px solid var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}
              >
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                {claimError ?? pinsError}
              </div>
            </div>
          )}

          {/* Legend */}
          {center && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10">
              <div className="pointer-events-auto flex h-8 items-center gap-3 rounded-lg border border-line bg-surface px-3 text-xs text-muted">
                {pinsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <LegendItem color="var(--loss)" label="Loss" />
                <LegendItem color="#17c964" label="Data Base" />
                <LegendItem color="#7928ca" label="Preferred" />
                <LegendItem color="#ee0000" label="Do not use" faded />
                <LegendItem color="var(--ink)" label={`On this claim (${attachedPins.length})`} />
              </div>
            </div>
          )}

          {/* Compact: panel floats over the map */}
          {selectedId && (
            <div className="absolute inset-0 z-30 lg:hidden">
              <div className="absolute inset-0" style={{ background: "var(--scrim)" }} onClick={() => setSelectedId(null)} />
              <div className="absolute inset-x-3 bottom-3 top-3 flex overflow-hidden rounded-xl border border-line shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:inset-x-auto sm:right-3 sm:w-[400px]">
                <PropertyPanel
                  key={`${claim?.id ?? "none"}:${selectedId}`}
                  claimName={claim?.name ?? null}
                  propertyId={selectedId}
                  distanceMiles={selectedPin?.distance_miles ?? null}
                  needs={claim?.needs ?? null}
                  claimId={claim ? claim.id : null}
                  attached={attachedIds.has(selectedId)}
                  onAttached={handleAttached}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ---------- Docked panel (lg+) ---------- */}
        {selectedId && (
          <div className="hidden w-[400px] shrink-0 border-l border-line lg:flex">
            <PropertyPanel
              key={`${claim?.id ?? "none"}:${selectedId}`}
              claimName={claim?.name ?? null}
              propertyId={selectedId}
              distanceMiles={selectedPin?.distance_miles ?? null}
              needs={claim?.needs ?? null}
              claimId={claim ? claim.id : null}
              attached={attachedIds.has(selectedId)}
              onAttached={handleAttached}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}

        {/* ---------- Mobile rail sheet ---------- */}
        {railSheetOpen && center && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <div className="absolute inset-0" style={{ background: "var(--scrim)" }} onClick={() => setRailSheetOpen(false)} />
            <div className="relative mt-auto flex max-h-[80%] w-full flex-col rounded-t-xl border-t border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
                <span className="text-sm font-medium">Search and results</span>
                <button
                  type="button"
                  onClick={() => setRailSheetOpen(false)}
                  aria-label="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">{railContent}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({ icon, label, on, onClick }: { icon: React.ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px]",
        on ? "border border-ink bg-ink text-bg" : "border border-line bg-surface text-ink",
      )}
    >
      {on ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        icon
      )}
      <span>{label}</span>
    </button>
  );
}

function NeedChip({ label, value }: { label: string; value: string }) {
  return (
    <li className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-muted px-2.5">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  );
}

function LegendItem({ color, label, faded }: { color: string; label: string; faded?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, opacity: faded ? 0.5 : 1 }} />
      <span>{label}</span>
    </span>
  );
}

function Blocker({ title, body }: { title: string; body: string }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-muted p-6">
      <div className="max-w-md rounded-lg p-4 text-sm" style={{ border: "1px solid var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-xs">{body}</div>
      </div>
    </div>
  );
}
