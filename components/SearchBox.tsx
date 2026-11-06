"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { usePlaces, type PlaceSuggestion as Suggestion } from "@/lib/use-places";
import { cn } from "@/lib/utils";

interface Props {
  apiKey: string;
  placeholder?: string;
  onPick: (loc: { lat: number; lng: number; address: string }) => void;
  onClear?: () => void;
  className?: string;
  /** Small chip shown at the right edge of the input, e.g. "from claim". */
  badge?: string;
  /** Text shown in the box when set from outside (e.g. a claim's loss address). Does not trigger suggestions. */
  value?: string;
  /** Height 40px + larger type — the empty-state hero search. Defaults to the 40px rail style. */
  size?: "rail" | "hero";
}

/** Places Autocomplete (new API) for the loss address; the session-token rules live in lib/use-places.ts. */
export default function SearchBox({
  apiKey,
  placeholder = "Loss address",
  onPick,
  onClear,
  className,
  badge,
  value,
  size = "rail",
}: Props) {
  const [q, setQ] = useState(value ?? "");
  // Text that was set programmatically (claim address, picked place); suggestions are only fetched for typed text.
  const external = useRef<string | null>(value ?? null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { suggest, resolve, reset } = usePlaces(apiKey);

  useEffect(() => {
    if (value === undefined) return;
    external.current = value;
    setQ(value);
  }, [value]);

  useEffect(() => {
    if (q === external.current) return;
    if (!q.trim()) {
      setItems([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setItems(await suggest(q));
        setOpen(true);
        setActive(-1);
      } catch {
        setItems([]);
      }
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function choose(s: Suggestion) {
    try {
      const picked = await resolve(s);
      if (picked) {
        onPick({ lat: picked.lat, lng: picked.lng, address: picked.address });
        external.current = picked.address;
        setQ(picked.address);
      }
    } finally {
      setOpen(false);
      setItems([]);
    }
  }

  const hero = size === "hero";

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-line bg-surface focus-within:border-focus",
          hero ? "h-12 px-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]" : "h-10 px-3 max-lg:h-[44px]",
        )}
      >
        <Search className={cn("shrink-0 text-muted", hero ? "h-4 w-4" : "h-3.5 w-3.5")} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              void choose(items[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn("w-full min-w-0 flex-grow bg-transparent text-ink outline-none placeholder:text-muted", hero ? "text-[16px]" : "text-sm max-lg:h-[44px] max-lg:text-[16px]")}
        />
        {badge && !q && (
          <span className="shrink-0 rounded px-1.5 py-px text-[11px] text-muted" style={{ border: "1px solid var(--line)" }}>
            {badge}
          </span>
        )}
        {q && (
          <button
            type="button"
            aria-label="Clear address"
            onClick={() => {
              setQ("");
              setItems([]);
              setOpen(false);
              reset();
              onClear?.();
            }}
            className="inline-flex shrink-0 max-lg:-mr-3 items-center justify-center rounded text-muted hover:bg-surface-muted hover:text-ink max-lg:h-[44px] max-lg:w-[44px] lg:p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul
          role="listbox"
          aria-label="Address suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        >
          {items.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(s)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
                  i === active ? "bg-surface-muted" : "hover:bg-surface-muted",
                )}
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-ink">{s.main}</span>
                  {s.secondary && <span className="truncate text-xs text-muted">{s.secondary}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
