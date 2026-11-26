import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { ID_RE, OUTSIDE_OFF, refused, toOutsideResponse } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError, OutsideResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * Every home of the latest run, not the SQL default of 80 (the SQL clamps this at 200). A run has held up to 182
 * homes; with the default, the homes past the 80th (fitting ones included) never reached the list.
 */
const OUTSIDE_LIMIT = 200;

/**
 * GET /api/claim/:claimId/outside
 * Homes the search agent found outside our database (Zillow, Furnished Finder) for this claim: the latest run
 * of the claim's search, fitting homes first. `searchId: null` means the agent has not searched for this claim yet.
 * `{ enabled: false, … }` while the `outside` feature is off.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");

  const secret = editSecret();
  if (!featureOn("outside") || !secret) return NextResponse.json<OutsideResponse>(OUTSIDE_OFF);

  try {
    const { data, error } = await supabase().rpc("map_outside_homes", { p_secret: secret, p_claim_item_id: claimId, p_limit: OUTSIDE_LIMIT });
    if (error) throw error;
    if (refused(data)) {
      console.error("GET /api/claim/[claimId]/outside: the database refused the map secret");
      return fail(502, "db_error", "Database query failed");
    }
    return NextResponse.json<OutsideResponse>(toOutsideResponse(data), { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    console.error("GET /api/claim/[claimId]/outside failed", claimId, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
