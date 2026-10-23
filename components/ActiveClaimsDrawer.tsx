"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { ActiveClaim, ActiveClaimsResponse, ApiError } from "@/lib/types";
import { cn, dateShort, num } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  onSelect: (claim: ActiveClaim) => void;
  /** Reports the live count so the header button can show it. */
  onCount?: (count: number) => void;
}

/**
 * F2 — Active Claims drawer. Left sheet (full width on phones, 360px from sm), searchable with cmdk.
 * Radix Dialog underneath gives the focus trap, Esc-to-close and scrim.
 */
export default function ActiveClaimsDrawer({ open, onOpenChange, selectedId, onSelect, onCount }: Props) {
  const [claims, setClaims] = useState<ActiveClaim[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeTest, setIncludeTest] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full gap-0 border-line p-0 sm:max-w-[360px]"
        onOpenAutoFocus={(e) => {
          // Land in the search box, not on the first button, so the searcher can type straight away.
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <SheetHeader className="gap-1 border-b border-line px-4 py-3">
          <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">Active claims</SheetTitle>
          <SheetDescription className="text-xs text-muted">
            Waiting on housing options. Pick one to search around its loss address.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px]">
          <button
            type="button"
            aria-pressed={includeTest}
            onClick={() => setIncludeTest((v) => !v)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5",
              includeTest ? "border border-ink bg-ink text-bg" : "border border-line bg-surface text-ink",
            )}
          >
            <FlaskConical className="h-3 w-3" /> Show test claims
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium"
            title="Re-read the list from Monday"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Refresh
          </button>
        </div>

        <Command className="min-h-0 flex-1 rounded-none bg-surface" loop>
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
            {claims === null ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading claims…
              </div>
            ) : (
              <>
                <CommandEmpty className="py-8 text-center text-[13px] text-muted">No matching claims.</CommandEmpty>
                {claims.map((c) => (
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
