"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, ChevronDown, DollarSign, Images, Inbox, Moon, PawPrint, RefreshCw, Send, SlidersHorizontal, Sun } from "lucide-react";
import MapCanvas from "./MapCanvas";
import PropertyPanel from "./PropertyPanel";
import SearchBox from "./SearchBox";
import ActiveClaimsDrawer from "./ActiveClaimsDrawer";
import SummarySheet from "./SummarySheet";
import { useTheme } from "@/lib/useTheme";
import { BAD_LINK, type ActiveClaim, ClaimResponse, Pin, Coverage, PropertiesResponse, ApiError, AttachedPin, type PropertyDetail } from "@/lib/types";
import { EDIT_FIELDS } from "@/lib/listing-edit";
import { readHealth } from "./property/health";
import { useEditSession, type SavedOutcome } from "./property/edit-session";
import { STATUS_ORDER, asMapStatus, passesFilters, type MapStatus, type PinFilters } from "@/lib/status";
import ClaimBrief, { claimGlance } from "./ClaimBrief";
import ResultsSheet, { type SheetSnap } from "./ResultsSheet";
import MapKey from "./MapKey";
import ResultRow, { type HoverSource } from "./ResultRow";
import { cn, MONDAY_BOARDS, mondayItemUrl } from "@/lib/utils";

const RADII = [5, 10, 15, 20, 30] as const; // Fazal, 8 Sep
const DEFAULT_RADIUS = 10;

interface Props {
  claimId: string | null;
  apiKey: string;
  mapId: string;
}

type Center = { lat: number; lng: number; address: string; source: "claim" | "search" };
const NONE_HIDDEN: Record<MapStatus, boolean> = { green: false, yellow: false, red: false };

// The docked rail (Tailwind's lg, 64rem and up) or the phone sheet: which panel copy is on screen. In rem, like
// Tailwind, so it follows the browser's default font size the same way the lg: classes do.
const WIDE = "(min-width: 64rem)";
const RECHECK_MS = 3000;
const isWide = () => window.matchMedia(WIDE).matches;
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export default function MapApp({ claimId: initialClaimId, apiKey, mapId }: Props) {
  const { theme, toggle } = useTheme();

  // The claim being worked: from ?claimId on load, then from the Active Claims drawer (F2).
  const [claimId, setClaimId] = useState<string | null>(initialClaimId);
  const claimIdRef = useRef(claimId);
  claimIdRef.current = claimId;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [claim, setClaim] = useState<ClaimResponse | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState<boolean>(!!claimId);

  const [center, setCenter] = useState<Center | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [filters, setFilters] = useState<PinFilters>({ pets: false, photos: false, priced: false, hidden: NONE_HIDDEN });
  // One open/closed state for the Filters drawer, shared by the rail and the phone sheet.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [pins, setPins] = useState<Pin[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinsError, setPinsError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // A saved listing edit: the list row, the map pin and the other panel mount take the new values at once.
  // `at` lets a panel mounted later ignore it (it fetches its own, fresher copy); cleared when the selection moves.
  const [editedDetail, setEditedDetail] = useState<{ detail: PropertyDetail; at: number } | null>(null);
  useEffect(() => setEditedDetail(null), [selectedId, claimId]);
  const applyDetail = useCallback((d: PropertyDetail) => {
    setEditedDetail({ detail: d, at: Date.now() });
    const apply = <T extends object>(p: T): T => {
      const next = { ...p } as Record<string, unknown>;
      for (const { key } of EDIT_FIELDS) if (key in next && key in d) next[key] = d[key as keyof PropertyDetail];
      // The list carries next_availability under its own name.
      if ("available_from" in next && "next_availability" in d) next.available_from = d.next_availability;
      return next as T;
    };
    setPins((prev) => prev.map((p) => (p.monday_item_id === d.monday_item_id ? apply(p) : p)));
    setAttachedPins((prev) => prev.map((p) => (p.monday_item_id === d.monday_item_id ? apply(p) : p)));
  }, []);
  // When Monday didn't confirm every field, read the property once more a few seconds later: by then the
  // Monday webhook has brought what Monday really holds into the mirror, and the panel and list show that.
  // The fields Monday did confirm keep the save's values (an unmirrored save's are not in that read yet), and
  // a read made for an older save is dropped once a newer save of the same property has landed.
  const recheckTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const saveSeq = useRef(new Map<string, number>());
  useEffect(() => () => recheckTimers.current.forEach(clearTimeout), []);
  const handleEdited = useCallback(
    (d: PropertyDetail, outcome: SavedOutcome) => {
      const id = d.monday_item_id;
      const seq = (saveSeq.current.get(id) ?? 0) + 1;
      saveSeq.current.set(id, seq);
      applyDetail(d);
      if (outcome.unconfirmed.length === 0 || outcome.dryRun) return;
      const confirmed = outcome.keys.filter((k) => !outcome.unconfirmed.includes(k));
      const keep: Partial<PropertyDetail> = Object.fromEntries(confirmed.map((k) => [k, d[k]]));
      if (!outcome.mirrored) keep.move_in_total = d.move_in_total; // follows the confirmed costs
      const current = () => saveSeq.current.get(id) === seq;
      recheckTimers.current.push(
        setTimeout(() => {
          if (!current()) return;
          fetch(`/api/properties/${id}`, { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<PropertyDetail>) : null))
            .then((fresh) => {
              if (fresh && fresh.monday_item_id === id && current()) applyDetail({ ...fresh, ...keep });
            })
            .catch(() => undefined);
        }, RECHECK_MS),
      );
    },
    [applyDetail],
  );

  // Unsaved listing edits: one session for both panel copies. Anything that would unmount the open form (close,
  // scrim, another property, another claim, a new search) goes through `guard`, which asks "Discard N changes?"
  // first (or, while a save is in flight, runs it right after a successful save).
  const session = useEditSession(handleEdited);
  const guard = session.guard;
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const dropDraft = session.drop;
  useEffect(() => {
    if (session.draft && session.draft.propertyId !== selectedId) dropDraft();
  }, [selectedId, session.draft, dropDraft]);

  // List row <-> map pin highlight. `from` decides whether the list follows (map hover) or the map pans (pointer on a row).
  const [hover, setHover] = useState<{ id: string; from: HoverSource } | null>(null);
  const hoveredId = hover?.id ?? null;
  const onHover = useCallback(
    (id: string | null, from: HoverSource = "map") =>
      setHover((prev) => (id === null ? null : prev?.id === id && prev.from === from ? prev : { id, from })),
    [],
  );
  const railRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("collapsed");
  const [sheetHeaderOpen, setSheetHeaderOpen] = useState(false);

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
  const switchClaim = useCallback((c: ActiveClaim) => {
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
  const selectClaim = useCallback((c: ActiveClaim) => {
    setDrawerOpen(false);
    if (c.id === claimIdRef.current) return;
    guard(() => switchClaim(c));
  }, [guard, switchClaim]);

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
    let live = true;
    void readHealth().then((h) => live && setDryRun(!!h?.dryRun));
    return () => {
      live = false;
    };
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
                map_status: asMapStatus(p?.map_status),
              },
            ],
      );
    },
    [pins],
  );

  const onSelect = useCallback(
    (id: string) => {
      const go = () => {
        setSelectedId(id);
        setSheetSnap("collapsed");
      };
      if (id === selectedIdRef.current) go(); // same property: the open form stays
      else guard(go);
    },
    [guard],
  );
  const closePanel = useCallback(() => guard(() => setSelectedId(null)), [guard]);

  // Pointing at a pin on the map brings its row into view in whichever results list is showing.
  useEffect(() => {
    if (hover?.from !== "map") return;
    const rows = [railRef, sheetRef].map((r) => r.current?.querySelector<HTMLElement>(`#row-${CSS.escape(hover.id)}`));
    rows.find((row) => row && row.offsetParent !== null)?.scrollIntoView({ block: "nearest" });
  }, [hover]);

  // A bad-link report from the panel shows on the list straight away, without waiting for the sync.
  const handleFlagged = useCallback((propertyId: string) => {
    setPins((prev) => prev.map((p) => (p.monday_item_id === propertyId ? { ...p, link_status: BAD_LINK } : p)));
  }, []);

  const visiblePins = useMemo(() => pins.filter((p) => passesFilters(p, filters)), [pins, filters]);
  const sortedPins = useMemo(
    () =>
      [...visiblePins].sort(
        (a, b) =>
          STATUS_ORDER.indexOf(asMapStatus(a.map_status)) - STATUS_ORDER.indexOf(asMapStatus(b.map_status)) || a.distance_miles - b.distance_miles,
      ),
    [visiblePins],
  );

  // A hovered row or pin that filtering, the radius or an add took off the map never sends a mouseleave.
  useEffect(() => {
    if (hoveredId && !attachedIds.has(hoveredId) && !visiblePins.some((p) => p.monday_item_id === hoveredId)) setHover(null);
  }, [hoveredId, visiblePins, attachedIds]);

  // The legend counts what the other filters leave in view, so a hidden colour still shows its number.
  const statusCounts = useMemo(() => {
    const counts: Record<MapStatus, number> = { green: 0, yellow: 0, red: 0 };
    for (const p of pins) if (passesFilters(p, { ...filters, hidden: NONE_HIDDEN })) counts[asMapStatus(p.map_status)]++;
    return counts;
  }, [pins, filters]);

  const needsMissing = useMemo(() => {
    if (!claim) return [];
    const missing: string[] = [];
    if (claim.needs.bedrooms == null) missing.push("Beds");
    if (claim.needs.bathrooms == null) missing.push("Baths");
    if (claim.needs.frv == null) missing.push("FRV");
    return missing;
  }, [claim]);

  // The pieces of the results column. Desktop lays them out as the docked rail; phones put the same pieces in <ResultsSheet>.
  // `touch` only makes the tappable controls 44px tall (phones); nothing else differs.
  const searchBlock = (
    <SearchBox
      apiKey={apiKey}
      placeholder="Loss address"
      badge={center?.source === "claim" ? "from claim" : undefined}
      value={center?.source === "claim" ? center.address : undefined}
      onPick={(loc) =>
        guard(() => {
          setSelectedId(null);
          setCenter({ ...loc, source: "search" });
        })
      }
      onClear={() => {
        if (claim?.loss) setCenter({ lat: claim.loss.lat, lng: claim.loss.lng, address: claim.loss.address, source: "claim" });
        else setCenter(null);
      }}
    />
  );
  const activeFilters = (filters.pets ? 1 : 0) + (filters.photos ? 1 : 0) + (filters.priced ? 1 : 0) + STATUS_ORDER.filter((s) => filters.hidden[s]).length;
  const controlsBlock = (touch: boolean) => (
    <div className="flex flex-col gap-2.5 border-b border-line p-3">
      {searchBlock}

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
                "whitespace-nowrap rounded-[5px] px-1.5 text-[12px] font-medium",
                touch ? "h-[44px] min-w-[44px] px-2.5 text-[13px]" : "h-7",
                radius === r ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-muted",
              )}
            >
              {r} mi
            </button>
          ))}
        </div>
      </div>

      {/* Filters and the colour key fold away; the summary shows how many are on. */}
      <details className="group rounded-lg border border-line bg-surface-muted" open={filtersOpen} onToggle={(e) => setFiltersOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
            Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-ink px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-bg">{activeFilters} on</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="flex flex-col gap-2.5 border-t border-line px-2.5 py-2.5">
      <div className="flex flex-wrap gap-1.5" aria-label="Filters">
        <FilterPill
          touch={touch}
          icon={<PawPrint className="h-3 w-3" />}
          label="Pets allowed"
          on={filters.pets}
          onClick={() => setFilters((f) => ({ ...f, pets: !f.pets }))}
        />
        <FilterPill
          touch={touch}
          icon={<Images className="h-3 w-3" />}
          label="Has photos"
          on={filters.photos}
          onClick={() => setFilters((f) => ({ ...f, photos: !f.photos }))}
        />
        <FilterPill
          touch={touch}
          icon={<DollarSign className="h-3 w-3" />}
          label="Rent listed"
          on={filters.priced}
          onClick={() => setFilters((f) => ({ ...f, priced: !f.priced }))}
        />
      </div>

      <MapKey
        variant="rail"
        touch={touch}
        counts={statusCounts}
        hidden={filters.hidden}
        onToggle={(st) => setFilters((f) => ({ ...f, hidden: { ...f.hidden, [st]: !f.hidden[st] } }))}
      />
        </div>
      </details>
    </div>
  );
  const needsBlock = (touch: boolean) =>
    claim && (
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="nh-eyebrow">The family needs</span>
          <a
            href={mondayItemUrl(MONDAY_BOARDS.claim, claim.id)}
            target="_blank"
            rel="noreferrer noopener"
            className={cn("text-xs no-underline", touch && "inline-flex min-h-[44px] items-center")}
          >
            Edit on Monday →
          </a>
        </div>
        {needsMissing.length > 0 && (
          <p
            className="inline-flex h-7 w-fit items-center rounded-md border border-dashed px-2.5 text-[13px]"
            style={{ borderColor: "var(--amber-line)", color: "var(--amber-ink)" }}
          >
            {needsMissing.join(" · ")} not on claim
          </p>
        )}
        <ClaimBrief name={claim.name} brief={claim.brief} hideGlance={touch} />
        <button
          type="button"
          disabled={attachedPins.length === 0}
          onClick={() => setSummaryOpen(true)}
          title={attachedPins.length === 0 ? "Add at least one option to the claim first" : "Preview and email the options to the relocation specialist"}
          className={cn(
            "mt-0.5 inline-flex items-center justify-center gap-2 rounded-lg text-[13px] font-medium",
            touch ? "h-[44px]" : "h-9",
            attachedPins.length === 0 ? "cursor-not-allowed border border-dashed border-line2 text-muted" : "bg-ink text-bg hover:brightness-110",
          )}
        >
          <Send className="h-3.5 w-3.5" />
          Send summary{attachedPins.length > 0 ? ` (${attachedPins.length} option${attachedPins.length === 1 ? "" : "s"})` : ""}
        </button>
      </div>
    );
  const resultRows = (
    <>
      {pinsLoading && visiblePins.length === 0 ? (
        [...Array(6)].map((_, i) => <li key={i} className="nh-skeleton m-1 h-12" />)
      ) : (
        sortedPins.map((p) => (
          <ResultRow
            key={p.monday_item_id}
            pin={p}
            selected={selectedId === p.monday_item_id}
            hovered={hoveredId === p.monday_item_id}
            claimId={claimId}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))
      )}
      {coverage && coverage.unmapped > 0 && (
        <li className="mt-1 flex flex-col gap-1 border-t border-line px-1 py-2.5 text-xs text-muted">
          <span>{coverage.unmapped.toLocaleString("en-US")} properties have no coordinates and cannot appear on any map yet.</span>
          <a href={mondayItemUrl(MONDAY_BOARDS.property)} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-[44px] items-center font-medium no-underline lg:min-h-0">
            What&apos;s being done about it →
          </a>
        </li>
      )}
    </>
  );
  const countLabel = center ? `${visiblePins.length.toLocaleString("en-US")} within ${radius} mi` : "—";
  const compactSummary = [center?.address || "Loss address", `${radius} mi`, activeFilters ? `${activeFilters} filter${activeFilters === 1 ? "" : "s"}` : "no filters"].join(" · ");

  // Desktop rail, two rows: the controls take what they need but shrink and scroll when the column is short, and the results
  // always keep at least 40% (12rem at the least). Without this the controls pushed the list down to a few pixels.
  const railContent = claim || center ? (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,auto)_minmax(max(12rem,40%),1fr)]">
      <div className="nh-scroll min-h-0 overflow-y-auto">
        {controlsBlock(false)}
        {needsBlock(false)}
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex items-baseline justify-between px-3 pb-1.5 pt-2.5">
          <span className="text-[13px] text-muted">{countLabel}</span>
          <span className="text-xs text-muted">green first, then nearest</span>
        </div>

        <ul aria-label="Results" className="nh-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {resultRows}
        </ul>
      </div>
    </div>
  ) : null;

  // One copy per layout; `active` says which one is on screen, and only that one shows the edit form.
  const panelFor = (rail: boolean) =>
    selectedId ? (
    <PropertyPanel
      key={`${claim?.id ?? "none"}:${selectedId}`}
      propertyId={selectedId}
      pin={selectedPin}
      claim={claim ? { id: claim.id, name: claim.name, accountManager: claim.brief?.accountManager ?? null } : null}
      needs={claim?.needs ?? null}
      attached={attachedIds.has(selectedId)}
      onAttached={handleAttached}
      onFlagged={handleFlagged}
      edited={editedDetail}
      session={session}
      active={rail === wide}
      onClose={closePanel}
    />
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

      {claim && <SummarySheet claimId={claim.id} open={summaryOpen} onOpenChange={setSummaryOpen} />}

      {/* ---------- Workspace ---------- */}
      <div className="relative flex min-h-0 flex-1">
        {/* ---------- Left rail (docked, lg+) ---------- */}
        {center && (
          <aside ref={railRef} aria-label="Search and results" className="hidden w-80 shrink-0 flex-col border-r border-line bg-surface lg:flex">
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
              hoveredId={hoveredId}
              panToHovered={hover?.from === "list"}
              filters={filters}
              onSelect={onSelect}
              onHover={onHover}
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
                  onPick={(loc) =>
                    guard(() => {
                      setSelectedId(null);
                      setCenter({ ...loc, source: "search" });
                    })
                  }
                />
                <p className="px-0.5 text-xs text-muted">Suggestions by Google Places · one search is one billable session, however many keystrokes.</p>
              </div>
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
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)] max-lg:bottom-[68px]">
              <MapKey variant="floating" attachedCount={attachedPins.length} loading={pinsLoading} />
            </div>
          )}

          {/* Compact: panel floats over the map */}
          {selectedId && (
            <div className="absolute inset-0 z-30 lg:hidden">
              <div className="absolute inset-0" style={{ background: "var(--scrim)" }} onClick={closePanel} />
              <div className="absolute inset-x-3 bottom-3 top-3 flex overflow-hidden rounded-xl border border-line shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:inset-x-auto sm:right-3 sm:w-[400px]">
                {panelFor(false)}
              </div>
            </div>
          )}
        </div>

        {/* ---------- Docked panel (lg+) ---------- */}
        {selectedId && (
          <div className="hidden w-[400px] shrink-0 border-l border-line lg:flex">
            {panelFor(true)}
          </div>
        )}

        {/* ---------- Mobile bottom sheet (below lg): peek / half / expanded ---------- */}
        {center && (
          <ResultsSheet
            sheetRef={sheetRef}
            snap={sheetSnap}
            onSnap={setSheetSnap}
            hidden={!!selectedId}
            countLabel={countLabel}
            glance={claim ? claimGlance(claim.brief).join(" · ") : ""}
            headerOpen={sheetHeaderOpen}
            onHeaderOpen={setSheetHeaderOpen}
            compactSummary={compactSummary}
            header={
              <>
                {controlsBlock(true)}
                {needsBlock(true)}
              </>
            }
            rows={resultRows}
          />
        )}
      </div>
    </div>
  );
}

function FilterPill({ icon, label, on, onClick, touch }: { icon: React.ReactNode; label: string; on: boolean; onClick: () => void; touch?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 text-[13px]",
        touch ? "min-h-[44px] px-3" : "h-8",
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
