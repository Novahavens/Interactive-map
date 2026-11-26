import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { ID_RE, refused, toSubmitStatusResponse } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError, SubmitStatusResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * GET /api/claim/:claimId/submit-status
 * Where each option on the claim is on the way to the adjuster: todo → ready → submitted, or blocked with the
 * reason. Read-only; never cached. `{ enabled: false, … }` while the `submit` feature is off.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");

  const secret = editSecret();
  if (!featureOn("submit") || !secret) return NextResponse.json<SubmitStatusResponse>({ enabled: false, options: [], counts: { ready: 0, submitted: 0 } });

  try {
    const { data, error } = await supabase().rpc("map_submit_status", { p_secret: secret, p_claim_item_id: claimId });
    if (error) throw error;
    if (refused(data)) {
      console.error("GET /api/claim/[claimId]/submit-status: the database refused the map secret");
      return fail(502, "db_error", "Database query failed");
    }
    return NextResponse.json<SubmitStatusResponse>(toSubmitStatusResponse(data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/claim/[claimId]/submit-status failed", claimId, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
