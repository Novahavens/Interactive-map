"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { isAddress, type AddressValue } from "@/lib/listing-edit";
import { usePlaces, type PlaceSuggestion } from "@/lib/use-places";
import { cn, milesBetween } from "@/lib/utils";

/** Fewer characters than this fetch no suggestions (every fetch opens or continues a billed session). */
const MIN_CHARS = 3;
const DEBOUNCE_MS = 220;
/** A pick this far from the old pin is probably the wrong suggestion: the line turns amber. */
const FAR_MILES = 5;

interface Props {
  id: string;
  /** The form's value: typed text, or a picked place as JSON (see normaliseAddress in lib/listing-edit.ts). */
  value: string;
  error?: string;
  describedBy?: string;
  /** Where the pin was when the form opened, for the "moves the pin" line. */
  origin: { lat: number; lng: number } | null;
  inputRef?: React.Ref<HTMLInputElement>;
  className: string;
  onChange: (raw: string) => void;
  onBlur: () => void;
}

function parsePicked(raw: string): AddressValue | null {
  if (!raw.trim().startsWith("{")) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isAddress(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The Address field of the edit form: Google's suggestions as the user types, and a pick that carries the
 * coordinates, so the save moves the pin. Typed text that was never picked can't be saved (the form says so).
 */
export default function AddressInput({ id, value, error, describedBy, origin, inputRef, className, onChange, onBlur }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { suggest, resolve } = usePlaces(apiKey);
  const picked = parsePicked(value);
  const shown = picked ? picked.address : value;
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Suggestions are fetched only for text the user typed here, not for a value set from outside (a restored
  // draft, "Use Monday's values", Start over).
  const typed = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-suggestions`;

  useEffect(() => {
    if (picked || !typed.current) {
      setItems([]);
      setOpen(false);
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setItems([]);
      setOpen(false);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const next = await suggest(q);
        if (!alive) return;
        setItems(next);
        setOpen(next.length > 0);
        setActive(-1);
      } catch {
        if (alive) setItems([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // `picked` follows `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function choose(s: PlaceSuggestion) {
    try {
      const p = await resolve(s, { parts: true });
      if (p) {
        typed.current = false;
        const v: AddressValue = { address: p.address, lat: p.lat, lng: p.lng };
        if (p.city) v.city = p.city;
        if (p.state) v.state = p.state;
        if (p.zipcode) v.zipcode = p.zipcode;
        onChange(JSON.stringify(v));
      }
    } catch {
      // the suggestion stays typed text; the form asks for a pick again
    } finally {
      setOpen(false);
      setItems([]);
    }
  }

  const moved = picked && origin ? milesBetween(origin, picked) : null;
  const moveText =
    moved === null
      ? picked
        ? "Puts the pin on the map at this address."
        : null
      : moved < 0.05
        ? "The pin stays where it is."
        : `Moves the pin about ${moved < 10 ? moved.toFixed(1) : Math.round(moved).toLocaleString("en-US")} mi.`;
  const far = moved !== null && moved > FAR_MILES;
  const moveId = `${id}-move`;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute inset-y-0 left-2 my-auto h-3.5 w-3.5 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={shown}
          autoComplete="off"
          spellCheck={false}
          placeholder="Start typing the street address"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[describedBy, moveText && moveId].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            typed.current = true;
            onChange(e.target.value);
          }}
          onBlur={onBlur}
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
              // Closes the list only; the form's own Escape (cancel) is not reached.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className={cn(className, "pl-7")}
        />
      </div>
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        >
          {items.map((s, i) => (
            <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(s)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left [@media(pointer:coarse)]:min-h-[44px]", i === active ? "bg-surface-muted" : "hover:bg-surface-muted")}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium text-ink">{s.main}</span>
                  {s.secondary && <span className="truncate text-xs text-muted">{s.secondary}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {moveText && (
        <p id={moveId} className="mt-1 text-xs" style={{ color: far ? "var(--amber-ink)" : "var(--muted)" }} aria-live="polite">
          {moveText}
        </p>
      )}
    </div>
  );
}
