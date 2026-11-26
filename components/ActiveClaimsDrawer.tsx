"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ActiveClaim, ActiveClaimsResponse, ApiError, NearsiteClaim } from "@/lib/types";
import { NO_FEATURES } from "@/lib/feature-keys";
import { NAME_KEY, SCOPE_KEY, filterByScope, firstName, initialScope, showingLine, tidyName, type ClaimsScope } from "@/lib/mine";
import { cn, dateShort, num } from "@/lib/utils";
import NearsiteList, { useNearsiteClaims } from "./NearsiteList";
import { featuresOn } from "./property/health";
import { readReporterName } from "./property/ReportBadLink";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  onSelect: (claim: ActiveClaim) => void;
  /** Reports the live count so the header button can show it. */
  onCount?: (count: number) => void;
  /** Feature `nearsite`: "Pick up" / "Open" on a Nearsite claim. It only opens the claim; nothing is assigned. */
  onSelectNearsite?: (claim: NearsiteClaim) => void;
}

type DrawerTab = "claims" | "nearsite";

const TOUCH = "[@media(pointer:coarse)]:h-[44px]";
// The border colours need `!`: globals.css gives every `[data-slot]` element an unlayered `border-color: var(--line)`,
// which beats any layered utility.
const TAB_TRIGGER = cn(
  "-mb-px h-10 flex-none rounded-none border-0 border-b-2 border-transparent! px-2.5 text-[13.5px] font-normal text-muted",
  "data-[state=active]:border-ink! data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-ink",
  "data-[state=active]:shadow-none",
  TOUCH,
);
/** On touch screens the search box is 44 px tall (px, not rem: the root font is smaller on phones) like every other control in the drawer. */
const TOUCH_SEARCH = "[@media(pointer:coarse)]:[&_[data-slot=command-input-wrapper]]:h-[44px] [@media(pointer:coarse)]:[&_[data-slot=command-input]]:h-[44px]";
/** And the sheet's close button (the last child of the sheet) gets a 44 px hit area. */
const TOUCH_CLOSE =
  "[@media(pointer:coarse)]:[&>button:last-child]:top-2 [@media(pointer:coarse)]:[&>button:last-child]:right-2 [@media(pointer:coarse)]:[&>button:last-child]:grid [@media(pointer:coarse)]:[&>button:last-child]:size-[44px] [@media(pointer:coarse)]:[&>button:last-child]:place-items-center";
const TAB_COUNT = "rounded-full border border-line2 px-1.5 py-px font-mono text-[11px] font-normal text-muted";
// The segmented look of the radius picker in the rail.
const SEG_ITEM = cn(
  "h-7 min-w-0 flex-none rounded-[5px] px-2.5 text-[12.5px] font-medium text-muted first:rounded-[5px] last:rounded-[5px]",
  "hover:bg-transparent hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
  TOUCH,
  "[@media(pointer:coarse)]:min-w-[44px]",
);

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // private browsing: the choice still holds for this page
    }
  },
};

/**
 * F2 — Active Claims drawer. Left sheet (full width on phones, 360px from sm), searchable with cmdk.
 * Radix Dialog underneath gives the focus trap, Esc-to-close and scrim.
 *
 * Housing-agent features, each behind its own flag (GET /api/health); with both off the drawer is as before:
 *  - `mine`: a Mine | All control, filtering by the name remembered on this device against the account manager.
 *  - `nearsite`: tabs Claims | Nearsite; the Nearsite tab lists the open Nearsite claims (NearsiteList).
 */
export default function ActiveClaimsDrawer({ open, onOpenChange, selectedId, onSelect, onCount, onSelectNearsite }: Props) {
  const [claims, setClaims] = useState<ActiveClaim[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeTest, setIncludeTest] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [features, setFeatures] = useState(NO_FEATURES);
  const [tab, setTab] = useState<DrawerTab>("claims");
  const [scope, setScope] = useState<ClaimsScope>("all");
  const [name, setName] = useState("");
  const [changingName, setChangingName] = useState(false);
  const [draft, setDraft] = useState("");
  const nearsiteSearchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const nearsite = useNearsiteClaims();
  const reloadNearsite = nearsite.reload;

  const load = useCallback(
    async (fresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ includeTest: includeTest ? "1" : "0", fresh: fresh ? "1" : "0" });
        const res = await fetch(`/api/claims/active?${qs}`, { cache: "no-store" });
        const json = (await res.json()) as ActiveClaimsResponse | ApiError;
        if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
        const data = json as ActiveClaimsResponse;
        setClaims(data.claims);
        onCount?.(data.claims.filter((c) => !c.isTest).length);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load active claims");
      } finally {
        setLoading(false);
      }
    },
    [includeTest, onCount],
  );

  // Load once on mount (for the header count), then again whenever the drawer opens or the test toggle flips.
  useEffect(() => {
    void load(false);
  }, [load]);
  useEffect(() => {
    if (open) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    let live = true;
    void featuresOn().then((f) => {
      if (live) setFeatures(f);
    });
    return () => {
      live = false;
    };
  }, []);

  const mineOn = features.mine;
  const tabsOn = features.nearsite && !nearsite.off;
  const extras = mineOn || tabsOn;
  const activeTab: DrawerTab = tabsOn ? tab : "claims";
  const activeSearch = activeTab === "nearsite" ? nearsiteSearchRef : searchRef;

  // The name can change elsewhere (Report bad link remembers the same one), so read it on every open.
  useEffect(() => {
    if (!mineOn) return;
    const saved = readReporterName().trim();
    setName(saved);
    setScope(initialScope(store.get(SCOPE_KEY), saved));
    if (!open) setChangingName(false);
  }, [mineOn, open]);

  // Nearsite claims are read when the drawer opens (the tab shows their count), never on page load.
  useEffect(() => {
    if (open && features.nearsite) void reloadNearsite(false);
  }, [open, features.nearsite, reloadNearsite]);

  // The search box is rebuilt when the tabs row arrives (health answers after the drawer is already open):
  // put the focus back unless the person has moved it somewhere in the drawer.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const at = document.activeElement;
      if (!at || at === document.body || at.getAttribute("data-slot") === "sheet-content") activeSearch.current?.focus();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsOn]);

  const mineActive = mineOn && scope === "mine";
  const askName = mineActive && (!name || changingName);
  const shownClaims = useMemo(
    () => (claims ? filterByScope(claims, mineOn ? scope : "all", name, (c) => c.accountManager) : null),
    [claims, mineOn, scope, name],
  );
  const shownNearsite = useMemo(
    () => (nearsite.claims ? filterByScope(nearsite.claims, mineOn ? scope : "all", name, (c) => c.assignedTo, { unowned: true }).length : 0),
    [nearsite.claims, mineOn, scope, name],
  );

  function pickScope(next: ClaimsScope) {
    setScope(next);
    store.set(SCOPE_KEY, next);
    setChangingName(false);
    if (next === "mine" && !name) {
      setDraft("");
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }

  function saveName(e: FormEvent) {
    e.preventDefault();
    const next = tidyName(draft);
    if (!next) {
      nameRef.current?.focus();
      return;
    }
    store.set(NAME_KEY, next);
    setName(next);
    setChangingName(false);
    requestAnimationFrame(() => activeSearch.current?.focus());
  }

  function changeName() {
    setDraft(name);
    setChangingName(true);
    requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    });
  }

  const toolbar = (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px]">
      {mineOn && (
        <ToggleGroup
          type="single"
          role="radiogroup"
          aria-label="Whose claims"
          value={scope}
          onValueChange={(v) => {
            if (v === "mine" || v === "all") pickScope(v);
          }}
          onKeyDown={(e) => {
            // A radiogroup: the arrow keys move the choice, not only the focus.
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
            e.preventDefault();
            const next: ClaimsScope = scope === "mine" ? "all" : "mine";
            pickScope(next);
            if (next === "all" || name) e.currentTarget.querySelector<HTMLElement>(`[data-scope="${next}"]`)?.focus();
          }}
          className="shrink-0 gap-0 rounded-[7px] border border-line bg-surface-muted p-0.5"
        >
          <ToggleGroupItem value="mine" data-scope="mine" className={SEG_ITEM}>
            Mine
          </ToggleGroupItem>
          <ToggleGroupItem value="all" data-scope="all" className={SEG_ITEM}>
            All
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      {activeTab === "claims" && (
        <button
          type="button"
          aria-pressed={includeTest}
          onClick={() => setIncludeTest((v) => !v)}
          title={extras ? "Show test claims" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5",
            includeTest ? "border border-ink bg-ink text-bg" : "border border-line bg-surface text-ink",
            extras && cn("whitespace-nowrap", TOUCH),
          )}
        >
          <FlaskConical className="h-3 w-3" /> {extras ? "Test claims" : "Show test claims"}
        </button>
      )}
      <button
        type="button"
        onClick={() => void (activeTab === "nearsite" ? nearsite.reload(true) : load(true))}
        className={cn("ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium", extras && TOUCH)}
        title={activeTab === "nearsite" ? "Re-read the list from Nearsite" : "Re-read the list from Monday"}
      >
        <RefreshCw className={cn("h-3 w-3", (activeTab === "nearsite" ? nearsite.loading : loading) && "animate-spin")} /> Refresh
      </button>
    </div>
  );

  let nameLine = null;
  if (askName) {
    nameLine = (
      <form onSubmit={saveName} className="flex flex-col gap-1.5 border-b border-line px-4 py-2.5" data-mine-name-form="">
        <label htmlFor="nh-mine-name" className="text-xs text-muted">
          Your name, as it is on Monday
        </label>
        <div className="flex gap-1.5">
          <input
            id="nh-mine-name"
            ref={nameRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            autoComplete="name"
            placeholder="e.g. Dana Whitfield"
            aria-describedby="nh-mine-name-help"
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border border-line2 bg-surface px-2.5 text-[13px] text-ink placeholder:text-muted",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [@media(pointer:coarse)]:text-base",
              TOUCH,
            )}
          />
          <button type="submit" className={cn("inline-flex h-8 items-center rounded-md border border-ink bg-ink px-3 text-[13px] font-medium text-bg", TOUCH)}>
            Save
          </button>
          {name && (
            <button
              type="button"
              onClick={() => setChangingName(false)}
              className={cn("inline-flex h-8 items-center rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink", TOUCH)}
            >
              Cancel
            </button>
          )}
        </div>
        <p id="nh-mine-name-help" className="text-xs text-muted">
          {name ? "Remembered on this device only." : "Remembered on this device only. Showing all claims until then."}
        </p>
      </form>
    );
  } else if (mineActive) {
    const who = firstName(name);
    const line = activeTab === "nearsite" ? showingLine(shownNearsite, name, "nearsite") : showingLine(shownClaims?.length ?? 0, name);
    const at = line.indexOf(` for ${who}`) + 5;
    nameLine = (
      <p className="border-b border-line px-4 py-1.5 text-xs text-muted" data-mine-line="">
        {line.slice(0, at)}
        <span className="font-medium text-ink">{who}</span>
        {line.slice(at + who.length)}
        {" · "}
        <button type="button" onClick={changeName} className="rounded-sm text-focus underline-offset-2 hover:underline [@media(pointer:coarse)]:py-2">
          Change name
        </button>
      </p>
    );
  }

  const claimsBody = (
    <Command className={cn("min-h-0 flex-1 rounded-none bg-surface", extras && TOUCH_SEARCH)} loop>
      <CommandInput ref={searchRef} placeholder="Search name or address" className="text-sm" />
      {error && (
        <div
          className="m-3 rounded-md border p-2 text-xs"
          style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}
        >
          {error}
        </div>
      )}
      <CommandList className="nh-scroll max-h-none flex-1 p-1.5">
        {shownClaims === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading claims…
          </div>
        ) : mineActive && name && shownClaims.length === 0 && (claims?.length ?? 0) > 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-[13px] text-muted" data-mine-empty="">
            <span>No claims with {firstName(name)} as account manager.</span>
            <button
              type="button"
              onClick={() => pickScope("all")}
              className={cn("inline-flex h-7 items-center rounded-md border border-line bg-surface px-2.5 font-medium text-ink", TOUCH)}
            >
              Show all
            </button>
          </div>
        ) : (
          <>
            <CommandEmpty className="py-8 text-center text-[13px] text-muted">No matching claims.</CommandEmpty>
            {shownClaims.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.lossAddress ?? ""} ${c.id}`}
                onSelect={() => onSelect(c)}
                className="items-start gap-2.5 rounded-lg px-2.5 py-2.5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-ink">{c.name}</span>
                    {c.isTest && (
                      <span className="shrink-0 rounded px-1 text-[10px] font-medium" style={{ background: "var(--amber-bg)", color: "var(--amber-ink)" }}>
                        TEST
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted">{c.lossAddress ?? "No loss address on the claim"}</span>
                  <span className="truncate text-xs text-muted">
                    {needsPreview(c)} · {c.group} · {dateShort(c.createdAt)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className="inline-flex h-5 items-center rounded-full border border-line px-2 text-[11px] font-medium text-ink"
                    title="Options already on this claim"
                  >
                    {c.attachedCount} {c.attachedCount === 1 ? "option" : "options"}
                  </span>
                  {c.accountManager && (
                    <span
                      className="max-w-[112px] truncate rounded bg-surface-muted px-1.5 py-px text-[11px] text-muted"
                      title={`Account manager: ${c.accountManager}`}
                    >
                      {c.accountManager}
                    </span>
                  )}
                  {selectedId === c.id && <Check className="size-4 text-ink" aria-label="Selected" />}
                </span>
              </CommandItem>
            ))}
          </>
        )}
      </CommandList>
    </Command>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn("w-full gap-0 border-line p-0 sm:max-w-[360px]", extras && TOUCH_CLOSE)}
        onOpenAutoFocus={(e) => {
          // Land in the search box, not on the first button, so the searcher can type straight away.
          e.preventDefault();
          activeSearch.current?.focus();
        }}
      >
        <SheetHeader className="gap-1 border-b border-line px-4 py-3">
          <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">Active claims</SheetTitle>
          <SheetDescription className="text-xs text-muted">
            {activeTab === "nearsite" ? "Nearsite claims that are still open." : "Waiting on housing options. Pick one to search around its loss address."}
          </SheetDescription>
        </SheetHeader>

        {tabsOn ? (
          <Tabs value={activeTab} onValueChange={(v) => setTab(v === "nearsite" ? "nearsite" : "claims")} className="min-h-0 flex-1 gap-0">
            <TabsList className={cn("h-10 w-full shrink-0 justify-start gap-1 rounded-none border-b border-line bg-transparent p-0 px-3", TOUCH)}>
              <TabsTrigger value="claims" className={TAB_TRIGGER}>
                Claims {claims && <span className={TAB_COUNT}>{claims.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="nearsite" className={TAB_TRIGGER}>
                Nearsite {nearsite.claims && <span className={TAB_COUNT}>{nearsite.claims.length}</span>}
              </TabsTrigger>
            </TabsList>
            {toolbar}
            {nameLine}
            <TabsContent value="claims" tabIndex={-1} className="flex min-h-0 flex-col">
              {claimsBody}
            </TabsContent>
            <TabsContent value="nearsite" tabIndex={-1} className="flex min-h-0 flex-col">
              <NearsiteList
                data={nearsite}
                scope={mineOn ? scope : "all"}
                name={name}
                onShowAll={() => pickScope("all")}
                onSelectNearsite={onSelectNearsite}
                selectedId={selectedId}
                searchRef={nearsiteSearchRef}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {toolbar}
            {nameLine}
            {claimsBody}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function needsPreview(c: ActiveClaim): string {
  const n = c.needs;
  const parts: string[] = [];
  if (n.bedrooms != null) parts.push(`${num(n.bedrooms)} bd`);
  if (n.bathrooms != null) parts.push(`${num(n.bathrooms)} ba`);
  if (n.pets) parts.push(`${num(n.pets)} pet${n.pets === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "Needs not set";
}
