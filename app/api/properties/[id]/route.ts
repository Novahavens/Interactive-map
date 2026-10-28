import { NextRequest, NextResponse } from "next/server";
import { loadPropertyDetail } from "@/lib/property-detail";
import type { PropertyDetail, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/properties/:id — the full record for the panel. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json<ApiError>({ error: "Invalid property id", code: "bad_request" }, { status: 400 });
  }

  try {
    const detail = await loadPropertyDetail(id);
    if (!detail) {
      return NextResponse.json<ApiError>({ error: "Property not found", code: "not_found" }, { status: 404 });
    }
    return NextResponse.json<PropertyDetail>(detail, {
      headers: { "Cache-Control": "private, max-age=15" },
    });
  } catch (e) {
    console.error("GET /api/properties/:id failed", e);
    const message = e instanceof Error ? e.message : "Database query failed";
    return NextResponse.json<ApiError>({ error: message, code: "db_error" }, { status: 502 });
  }
}
