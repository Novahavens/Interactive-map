import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Pin, Coverage, PropertiesResponse, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALLOWED_RADII = new Set([5, 10, 15, 20, 30]);

/**
 * GET /api/properties?lat=..&lng=..&miles=10
 * Returns every mappable property inside the radius plus the coverage counter.
 * All filtering happens in SQL (PostGIS); nothing is filtered client-side.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const miles = Number(sp.get("miles") ?? "10");

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json<ApiError>({ error: "lat and lng are required", code: "bad_request" }, { status: 400 });
  }
  if (!ALLOWED_RADII.has(miles)) {
    return NextResponse.json<ApiError>({ error: "miles must be one of 5, 10, 15, 20, 30", code: "bad_request" }, { status: 400 });
  }

  try {
    const sb = supabase();
    const [pinsRes, covRes] = await Promise.all([
      sb.rpc("properties_within_radius", { p_lat: lat, p_lng: lng, p_miles: miles }),
      sb.rpc("radius_coverage", { p_lat: lat, p_lng: lng, p_miles: miles }),
    ]);
    if (pinsRes.error) throw pinsRes.error;
    if (covRes.error) throw covRes.error;

    const pins = (pinsRes.data ?? []) as Pin[];
    const covRow = Array.isArray(covRes.data) ? covRes.data[0] : covRes.data;
    const coverage: Coverage = {
      mappable: Number(covRow?.mappable ?? 0),
      unmapped: Number(covRow?.unmapped ?? 0),
    };

    return NextResponse.json<PropertiesResponse>({ pins, coverage }, {
      headers: { "Cache-Control": "private, max-age=15" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database query failed";
    return NextResponse.json<ApiError>({ error: message, code: "db_error" }, { status: 502 });
  }
}
