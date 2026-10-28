import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { supabase } from "@/lib/supabase";
import type { ApiError, OwnerSaidCall, OwnerSaidResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One row of quo_owner_said, checked field by field: the panel only ever sees the documented shape. */
function toCall(row: unknown): OwnerSaidCall | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const callId = text(r.callId);
  const at = text(r.at);
  if (!callId || !at) return null;
  const facts = (Array.isArray(r.facts) ? r.facts : []).flatMap((f) => {
    const x = f as Record<string, unknown> | null;
    return x && typeof x.key === "string" && (typeof x.value === "string" || typeof x.value === "number") && typeof x.evidence === "string"
      ? [{ key: x.key, value: x.value, evidence: x.evidence }]
      : [];
  });
  const a = r.applied as Record<string, unknown> | null;
  return {
    callId, at, by: text(r.by), durationSec: count(r.durationSec), propertyCount: count(r.propertyCount),
    summary: strings(r.summary), nextSteps: strings(r.nextSteps), facts,
    applied: a && typeof a === "object" && text(a.at) ? { by: text(a.by) ?? "someone", at: text(a.at) as string, fields: strings(a.fields) } : null,
  };
}

/** GET /api/properties/:id/owner-said — what owners said on recent answered calls, from Quo's AI summaries. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) return NextResponse.json<ApiError>({ error: "Invalid property id", code: "bad_request" }, { status: 400 });
  const secret = editSecret();
  if (!secret) return NextResponse.json<OwnerSaidResponse>({ enabled: false, calls: [] });
  const { data, error } = await supabase().rpc("quo_owner_said", { p_secret: secret, p_property_item_id: id });
  if (error) {
    console.error("owner-said: read failed", id, error.message);
    return NextResponse.json<ApiError>({ error: "Could not load call summaries", code: "db_error" }, { status: 502 });
  }
  const calls = (Array.isArray(data) ? data : []).map(toCall).filter((c): c is OwnerSaidCall => !!c);
  return NextResponse.json<OwnerSaidResponse>({ enabled: data !== null, calls }, { headers: { "Cache-Control": "no-store" } });
}
