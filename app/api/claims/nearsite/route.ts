import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { refused, toNearsiteClaims } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError, NearsiteClaim, NearsiteClaimsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Per-instance cache, like /api/claims/active. `fresh=1` (the Refresh button) bypasses it.
const TTL_MS = 60_000;
let cache: { at: number; claims: NearsiteClaim[] } | null = null;
// `fresh=1` skips the cache, but not more than once every FRESH_GAP_MS: a caller cannot force a query per request.
const FRESH_GAP_MS = 10_000;
let lastFresh = 0;

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * GET /api/claims/nearsite?fresh=0
 * Open claims on the Nearsite marketplace, newest first (at most 200): still open there and not yet handed
 * off to the Claim Process Board. `{ enabled: false, claims: [] }` while the `nearsite` feature is off.
 */
export async function GET(req: NextRequest) {
  const secret = editSecret();
  if (!featureOn("nearsite") || !secret) return NextResponse.json<NearsiteClaimsResponse>({ enabled: false, claims: [] });

  try {
    const wantFresh = req.nextUrl.searchParams.get("fresh") === "1" && Date.now() - lastFresh > FRESH_GAP_MS;
    if (!cache || wantFresh || Date.now() - cache.at > TTL_MS) {
      if (wantFresh) lastFresh = Date.now();
      const { data, error } = await supabase().rpc("map_nearsite_claims", { p_secret: secret, p_limit: 200 });
      if (error) throw error;
      if (refused(data)) {
        console.error("GET /api/claims/nearsite: the database refused the map secret");
        return fail(502, "db_error", "Database query failed");
      }
      cache = { at: Date.now(), claims: toNearsiteClaims(data) };
    }
    return NextResponse.json<NearsiteClaimsResponse>({ enabled: true, claims: cache.claims });
  } catch (e) {
    console.error("GET /api/claims/nearsite failed", e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
