import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { ID_RE, refused, toScoresResponse } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError, ScoresResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * GET /api/claim/:claimId/scores
 * Our own homes scored against this claim by the matcher (rank, score 0–100, why, stretch). Empty when the claim
 * has not been matched. `{ enabled: false, scores: [] }` while the `bestMatch` feature is off.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");

  const secret = editSecret();
  if (!featureOn("bestMatch") || !secret) return NextResponse.json<ScoresResponse>({ enabled: false, scores: [] });

  try {
    const { data, error } = await supabase().rpc("map_claim_scores", { p_secret: secret, p_claim_item_id: claimId });
    if (error) throw error;
    if (refused(data)) {
      console.error("GET /api/claim/[claimId]/scores: the database refused the map secret");
      return fail(502, "db_error", "Database query failed");
    }
    return NextResponse.json<ScoresResponse>(toScoresResponse(data), { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    console.error("GET /api/claim/[claimId]/scores failed", claimId, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
