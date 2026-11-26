"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { ApiError, NearsiteClaim, NearsiteClaimsResponse } from "@/lib/types";
import { cityState, daysLeftChip, filterByScope, firstName, nearsiteMeta, nearsiteNeeds, sortNearsite, type ClaimsScope } from "@/lib/mine";
import { cn } from "@/lib/utils";

/** What GET /api/claims/nearsite gave, and how to ask again. */
export interface NearsiteData {
  /** Null until the first answer. */
  claims: NearsiteClaim[] | null;
  loading: boolean;
  error: string | null;
  /** The server says the feature is off (`enabled: false`). */
  off: boolean;
  /** Read the list; `fresh` skips the server's 60 s cache (the Refresh button). */
  reload: (fresh?: boolean) => Promise<void>;
}

/** Reads the open Nearsite claims. Does nothing until `reload` is called (or `auto` is set: read on mount). */
export function useNearsiteClaims(auto = false): NearsiteData {
  const [claims, setClaims] = useState<NearsiteClaim[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async (fresh = false) => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/nearsite${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as NearsiteClaimsResponse | ApiError | null;
      if (!res.ok || !json) throw new Error((json as ApiError | null)?.error || `HTTP ${res.status}`);
      if (mine !== seq.current) return;
      const data = json as NearsiteClaimsResponse;
      setOff(data.enabled === false);
      setClaims(Array.isArray(data.claims) ? data.claims : []);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e.message : "Could not load Nearsite claims");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auto) void reload(false);
  }, [auto, reload]);

  return useMemo(() => ({ claims, loading, error, off, reload }), [claims, loading, error, off, reload]);
}

export interface NearsiteListProps {
  /** Called for "Pick up" (nobody's) and "Open" (someone's) alike. It only opens the claim; nothing is assigned. */
  onSelectNearsite?: (claim: NearsiteClaim) => void;
  /** Mine = claims assigned to `name`, plus free-for-all ones. Default All. */
  scope?: ClaimsScope;
  /** The name remembered on this device. Empty = show all. */
  name?: string;
  /** "Show all" in the empty Mine state. */
  onShowAll?: () => void;
  /** The parent's own `useNearsiteClaims()` (the drawer shares it with its tab count and Refresh). Omit and the list reads for itself and shows its own Refresh. */
  data?: NearsiteData;
  /** The claim open on the map (its `mondayItemId` or `id`), to mark its row. */
  selectedId?: string | null;
  searchRef?: Ref<HTMLInputElement>;
  className?: string;
}

const CHIP_TONE = { bad: "nh-chip--bad nh-chip--outline", amber: "nh-chip--amber", muted: "nh-chip--muted" } as const;

/**
 * F3.7 — the Nearsite tab of the claims drawer: open Nearsite claims, soonest first, searchable with cmdk.
 * Renders nothing when the server says the feature is off.
 */
export default function NearsiteList({ onSelectNearsite, scope = "all", name = "", onShowAll, data, selectedId, searchRef, className }: NearsiteListProps) {
  const own = useNearsiteClaims(!data);
  const { claims, loading, error, off, reload } = data ?? own;

  const rows = useMemo(
    () => (claims ? sortNearsite(filterByScope(claims, scope, name, (c) => c.assignedTo, { unowned: true })) : []),
    [claims, scope, name],
  );

  if (off) return null;

  return (
    <Command
      className={cn(
        "min-h-0 flex-1 rounded-none bg-surface",
        "[@media(pointer:coarse)]:[&_[data-slot=command-input-wrapper]]:h-[44px] [@media(pointer:coarse)]:[&_[data-slot=command-input]]:h-[44px]",
        className,
      )} loop data-nearsite-list="">
      {!data && (
        <div className="flex items-center border-b border-line px-3 py-2 text-[13px]">
          <button
            type="button"
            onClick={() => void reload(true)}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium [@media(pointer:coarse)]:h-[44px]"
            title="Re-read the list from Nearsite"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Refresh
          </button>
        </div>
      )}
      <CommandInput ref={searchRef} placeholder="Search name or city" className="text-sm" />
      {error && (
        <div
          role="alert"
          className="m-3 rounded-md border p-2 text-xs"
          style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}
        >
          {error}
        </div>
      )}
      <CommandList className="nh-scroll max-h-none flex-1 p-1.5" aria-label="Nearsite claims">
        {claims === null ? (
          error ? null : (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Nearsite claims…
            </div>
          )
        ) : claims.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted">No open Nearsite claims.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-[13px] text-muted">
            <span>No open Nearsite claims for {firstName(name)}.</span>
            {onShowAll && (
              <button type="button" onClick={onShowAll} className="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2.5 font-medium text-ink [@media(pointer:coarse)]:h-[44px]">
                Show all
              </button>
            )}
          </div>
        ) : (
          <>
            <CommandEmpty className="py-8 text-center text-[13px] text-muted">No matching claims.</CommandEmpty>
            {rows.map((c) => {
              const chip = daysLeftChip(c.daysLeft);
              const place = cityState(c);
              const meta = nearsiteMeta(c);
              const free = !c.assignedTo?.trim();
              const selected = selectedId != null && (selectedId === c.mondayItemId || selectedId === c.id);
              return (
                <CommandItem
                  key={c.id}
                  value={`${c.title} ${place} ${c.assignedTo ?? ""} ${c.id}`}
                  onSelect={() => onSelectNearsite?.(c)}
                  data-nearsite-id={c.id}
                  className="items-start gap-2.5 rounded-lg px-2.5 py-2.5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-ink">{c.title}</span>
                      {selected && <Check className="size-4 text-ink" aria-label="Selected" />}
                    </span>
                    {place && <span className="truncate text-xs text-muted">{place}</span>}
                    <span className="truncate text-xs text-ink">{nearsiteNeeds(c)}</span>
                    {meta && <span className="truncate text-xs text-muted">{meta}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {chip && (
                      <span className={cn("nh-chip", CHIP_TONE[chip.tone])} data-urgency={chip.tone}>
                        <span>{chip.label}</span>
                      </span>
                    )}
                    {free ? (
                      <span className="nh-chip" style={{ borderColor: "var(--line2)", color: "var(--ink)" }} data-free="">
                        <span>Free for all</span>
                      </span>
                    ) : (
                      <span className="max-w-[112px] truncate rounded bg-surface-muted px-1.5 py-px text-[11px] text-muted" title={`Assigned to: ${c.assignedTo}`}>
                        {c.assignedTo}
                      </span>
                    )}
                    {/* Looks like a button, but the whole row is the control (one option, one action): a click here
                        bubbles to the row, and Enter on the row does the same. */}
                    <span
                      data-action={free ? "pickup" : "open"}
                      className="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink [@media(pointer:coarse)]:h-9"
                    >
                      {free ? "Pick up" : "Open"}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </>
        )}
      </CommandList>
    </Command>
  );
}
