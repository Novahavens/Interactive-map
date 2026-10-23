import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { asMapStatus } from "@/lib/status";
import type { PropertyDetail, ClaimOption, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/properties/:id — the full record for the panel. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json<ApiError>({ error: "Invalid property id", code: "bad_request" }, { status: 400 });
  }

  try {
    const [{ data, error }, statusRes, claimsRes] = await Promise.all([
      supabase().rpc("property_detail", { p_monday_item_id: id }),
      supabase().rpc("property_map_status", { p_monday_item_id: id }),
      supabase().rpc("property_claim_options", { p_monday_item_id: id }),
    ]);
    if (error) throw error;
    if (statusRes.error) throw statusRes.error;
    if (claimsRes.error) throw claimsRes.error;
    const st = (Array.isArray(statusRes.data) ? statusRes.data[0] : statusRes.data) as { status?: string; reason?: string } | undefined;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return NextResponse.json<ApiError>({ error: "Property not found", code: "not_found" }, { status: 404 });
    }
    // Strip the PostGIS geometry and the raw Monday jsonb; the panel uses typed columns only.
    const { geom: _geom, fields: _fields, ...rest } = row as Record<string, unknown>;
    const detail = { ...rest, map_status: asMapStatus(st?.status), map_reason: st?.reason ?? "none", other_claims: (claimsRes.data ?? []) as ClaimOption[] };
    return NextResponse.json<PropertyDetail>(detail as unknown as PropertyDetail, {
      headers: { "Cache-Control": "private, max-age=15" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database query failed";
    return NextResponse.json<ApiError>({ error: message, code: "db_error" }, { status: 502 });
  }
}
