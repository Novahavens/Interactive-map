"use client";

import { useEffect, useState } from "react";
import type { LandlordReplyResponse } from "@/lib/landlord-reply";
import { Section } from "./parts";
import { featuresOn } from "./health";

/** The same name the "Report bad link" box remembers; read here only, so the two stay in step. */
const NAME_KEY = "nh-reporter-name";
const MAX = 8000;

interface Result {
  tone: "ok" | "warn" | "bad";
  lines: string[];
}

/**
 * "Paste landlord reply" on an outside home with no street address (Furnished Finder only). Staff paste the reply;
 * the server decides what it may write (POST /api/outside/:id/landlord-reply). Shown only while the `outside`
 * feature is on. Nothing is sent to the landlord, and Monday is not written.
 */
export default function LandlordReplyBox({ listingId, onSaved }: { listingId: string; onSaved?: () => void }) {
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let live = true;
    void featuresOn().then((f) => {
      if (live) setOn(f.outside);
    });
    try {
      setBy(window.localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      // Private window or blocked storage: the name just stays empty.
    }
    return () => {
      live = false;
    };
  }, []);

  if (!on) return null;

  async function save() {
    const reply = text.trim();
    if (!reply || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/outside/${listingId}/landlord-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, by: by.trim() }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as (Partial<LandlordReplyResponse> & { error?: string }) | null;
      if (res.ok && data?.ok === true && typeof data.message === "string") {
        const lines = [data.message];
        if (data.addressWritten && data.address?.addressLine) {
          const where = [data.address.city, [data.address.state, data.address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
          lines.push(`Address: ${data.address.addressLine}${data.address.unit ? ` #${data.address.unit}` : ""}${where ? `, ${where}` : ""}.`);
        }
        if (data.copyToPropertyDb) lines.push("This home is in PROPERTY DATABASE. Copy the address there in Monday (the map does not write Monday).");
        if (data.possibleDuplicates) lines.push("A home with this street may already exist. Nothing was merged; please check.");
        setResult({ tone: data.outcome === "address_saved" || data.outcome === "same_address" || data.outcome === "duplicate" ? "ok" : "warn", lines });
        setText("");
        // The outside list and the map pin come from the list, so re-read it: the home now has an address.
        if (data.addressWritten) onSaved?.();
      } else {
        setResult({ tone: "bad", lines: [data?.error ?? "The reply was not saved. Try again."] });
      }
    } catch {
      setResult({ tone: "bad", lines: ["No connection. The reply was not saved; try again."] });
    } finally {
      setBusy(false);
    }
  }

  const tone = result?.tone === "ok" ? "text-ok-ink" : result?.tone === "warn" ? "text-amber-ink" : "text-bad-ink";

  return (
    <Section title="Landlord reply">
      <p className="mb-2 text-[13px] text-muted">
        Paste the landlord&apos;s reply. The street is saved only when the reply has a house number and a street name, a city and state or a zip, and this home has no address yet.
      </p>
      <label htmlFor={`reply-${listingId}`} className="sr-only">
        Landlord reply text
      </label>
      <textarea
        id={`reply-${listingId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX}
        rows={4}
        placeholder="Paste the reply here"
        className="w-full rounded-md border border-line bg-surface p-2 text-[13px] text-ink"
      />
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`reply-by-${listingId}`} className="sr-only">
          Your name
        </label>
        <input
          id={`reply-by-${listingId}`}
          value={by}
          onChange={(e) => setBy(e.target.value)}
          maxLength={80}
          placeholder="Your name"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !text.trim()}
          className="inline-flex h-9 shrink-0 items-center rounded-md bg-ink px-3 text-[13px] font-medium text-surface disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save reply"}
        </button>
      </div>
      <div aria-live="polite" className={`mt-2 space-y-1 text-[13px] ${tone}`} data-landlord-reply-result>
        {result?.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </Section>
  );
}
