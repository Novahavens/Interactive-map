import { NextRequest, NextResponse } from "next/server";
import { first, supabase } from "@/lib/supabase";
import { toE164List, type ContactNumber, type ContactResponse } from "@/lib/contact";
import { contactDigest, quoEnabled } from "@/lib/quo";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

// The phones always come from the property record, never from the caller, so the Quo key can't be used
// to look up arbitrary numbers. Per-IP limit keeps a scripted caller well under Quo's 10 requests a second
// (each uncached property is 2-4 Quo reads). In-memory, so per instance.
const LIMIT = 30;
const WINDOW_MS = 60_000;
const MAX_NUMBERS = 4;
const hits = new Map<string, number[]>();

function allow(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2_000) hits.delete(hits.keys().next().value!);
  return true;
}

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/** GET /api/properties/:id/contact — calls and texts with the owner and landlord/PM, from Quo. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) return fail(400, "bad_request", "Invalid property id");
  if (!quoEnabled()) return NextResponse.json<ContactResponse>({ enabled: false, numbers: [], digest: null });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip, Date.now())) return fail(429, "rate_limited", "Too many lookups; try again in a minute");

  let numbers: ContactNumber[];
  try {
    const { data, error } = await supabase().rpc("property_detail", { p_monday_item_id: id });
    if (error) throw error;
    const row = first<{ owner_phone: string | null; landlord_phone: string | null }>(data);
    if (!row) return fail(404, "not_found", "Property not found");
    const seen = new Set<string>();
    numbers = [
      ...toE164List(row.owner_phone).map((phone) => ({ label: "Owner", phone })),
      ...toE164List(row.landlord_phone).map((phone) => ({ label: "Landlord / PM", phone })),
    ].filter((n) => !seen.has(n.phone) && seen.add(n.phone)).slice(0, MAX_NUMBERS);
  } catch (e) {
    console.error("contact: property lookup failed", id, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Could not load this property");
  }

  if (!numbers.length) return NextResponse.json<ContactResponse>({ enabled: true, numbers, digest: null });

  try {
    const digest = await contactDigest(numbers.map((n) => n.phone));
    return NextResponse.json<ContactResponse>({ enabled: true, numbers, digest }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    console.error("contact: Quo read failed", id, e instanceof Error ? e.message : e);
    return fail(502, "quo_error", "Couldn't reach Quo");
  }
}
