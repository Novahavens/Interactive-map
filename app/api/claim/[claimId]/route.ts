import { NextRequest, NextResponse } from "next/server";
import { readClaim, MondayError } from "@/lib/monday";
import { supabase } from "@/lib/supabase";
import type { ClaimResponse, AttachedPin, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/claim/:claimId
 * Loss address, the family's needs, and every option already attached to the claim
 * (with coordinates so they can be plotted in black regardless of radius).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!/^\d+$/.test(claimId)) {
    return NextResponse.json<ApiError>({ error: "Invalid claim id", code: "bad_request" }, { status: 400 });
  }

  try {
    const claim = await readClaim(claimId);
    if (!claim) {
      return NextResponse.json<ApiError>({ error: "Claim not found", code: "not_found" }, { status: 404 });
    }

    const ids = Array.from(new Set(claim.attached.map((a) => a.propertyId).filter((x): x is string => !!x)));
    let attachedPins: AttachedPin[] = [];
    if (ids.length) {
      const { data, error } = await supabase().rpc("properties_by_ids", { p_ids: ids });
      if (error) throw error;
      attachedPins = (data ?? []) as AttachedPin[];
    }

    const body: ClaimResponse = { ...claim, attachedPins };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const code = e instanceof MondayError ? "monday_error" : "server_error";
    const message = e instanceof Error ? e.message : "Failed to read claim";
    return NextResponse.json<ApiError>({ error: message, code }, { status: 502 });
  }
}
