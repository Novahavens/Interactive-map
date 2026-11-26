"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { outreachLine } from "@/lib/phone-lookup-ui";
import type { OutreachResponse, OutreachStatus } from "@/lib/types";

/**
 * "Asked Nov 24 · no reply yet" / "Replied Nov 25" for a property (feature `templates`). Reads
 * GET /api/properties/:id/outreach, or shows `outreach` as given (an outside home already carries its own).
 * Renders nothing while off, and nothing visible when no text has gone out.
 */
export default function OutreachLine({ propertyId, enabled, outreach }: { propertyId?: string; enabled: boolean; outreach?: OutreachStatus | null }) {
  const given = outreach !== undefined;
  const [read, setRead] = useState<OutreachStatus | null>(null);

  useEffect(() => {
    setRead(null);
    if (!enabled || given || !propertyId) return;
    const ctl = new AbortController();
    fetch(`/api/properties/${encodeURIComponent(propertyId)}/outreach`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<OutreachResponse>) : null))
      .then((j) => setRead(j?.enabled ? (j.outreach ?? null) : null))
      .catch(() => {});
    return () => ctl.abort();
  }, [propertyId, enabled, given]);

  if (!enabled) return null;
  const line = outreachLine(given ? outreach : read);
  return (
    <p className={`flex items-center gap-1.5 text-xs empty:hidden ${line?.kind === "replied" ? "text-ok-ink" : "text-muted"}`} aria-live="polite" data-outreach={line?.kind}>
      {line?.kind === "replied" && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
      {line?.text}
    </p>
  );
}
