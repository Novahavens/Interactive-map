import { NextRequest, NextResponse } from "next/server";
import { readClaim, createSubitem, MondayError, DRY_RUN } from "@/lib/monday";
import { supabase } from "@/lib/supabase";
import { asMapStatus } from "@/lib/status";
import type { AddToClaimRequest, AddToClaimResponse, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/claim/add  { claimId, propertyId }
 *
 * The "+" button. One property, one sub-item, one mutation. This is the quality gate —
 * there is deliberately no bulk path (William, 3 Aug).
 *
 * Order of checks:
 *   1. property exists and is not red / DO NOT USE, by its group or its owner (refused server-side, not just greyed in the UI)
 *   2. idempotency: if the claim already has a sub-item linked to this property, return it
 *   3. create_subitem with relation + status "To Do" in a single mutation
 *   4. verify the link landed; roll back the sub-item if it did not
 */
export async function POST(req: NextRequest) {
  let body: Partial<AddToClaimRequest>;
  try {
    body = (await req.json()) as Partial<AddToClaimRequest>;
  } catch {
    return NextResponse.json<ApiError>({ error: "Body must be JSON", code: "bad_request" }, { status: 400 });
  }
  const claimId = String(body.claimId ?? "");
  const propertyId = String(body.propertyId ?? "");
  if (!/^\d+$/.test(claimId) || !/^\d+$/.test(propertyId)) {
    return NextResponse.json<ApiError>({ error: "claimId and propertyId are required", code: "bad_request" }, { status: 400 });
  }

  try {
    // 1. Property must exist and be addable.
    const [{ data, error }, statusRes] = await Promise.all([
      supabase().rpc("property_detail", { p_monday_item_id: propertyId }),
      supabase().rpc("property_map_status", { p_monday_item_id: propertyId }),
    ]);
    if (error) throw error;
    if (statusRes.error) throw statusRes.error;
    const prop = (Array.isArray(data) ? data[0] : data) as
      | { name: string | null; group_title: string | null; monthly_rate: number | null }
      | undefined;
    if (!prop) {
      return NextResponse.json<ApiError>({ error: "Property not found in the database mirror", code: "not_found" }, { status: 404 });
    }
    // Red is red whether the property's group or its owner says so.
    const st = (Array.isArray(statusRes.data) ? statusRes.data[0] : statusRes.data) as { status?: string; reason?: string } | undefined;
    if (asMapStatus(st?.status) === "red") {
      const why = st?.reason === "dnu_owner" ? "The owner is marked DO NOT USE" : "This property is in DO NOT USE";
      return NextResponse.json<ApiError>(
        { error: `${why}, so it cannot be attached to a claim`, code: "dnu_refused" },
        { status: 403 },
      );
    }

    // 2. Idempotency.
    const claim = await readClaim(claimId);
    if (!claim) {
      return NextResponse.json<ApiError>({ error: "Claim not found", code: "not_found" }, { status: 404 });
    }
    const existing = claim.attached.find((a) => a.propertyId === propertyId);
    if (existing) {
      return NextResponse.json<AddToClaimResponse>({ ok: true, subitemId: existing.subitemId, alreadyAttached: true });
    }

    // 3 + 4. Single mutation, verified, rolled back on a half-write.
    const rate = prop.monthly_rate != null ? ` $${Math.round(Number(prop.monthly_rate)).toLocaleString("en-US")}` : "";
    const name = `${(prop.name ?? "Property").trim()}${rate}`.slice(0, 255);

    // Distance to the claim's loss address, computed server-side with the same
    // PostGIS geography formula the map itself uses (properties_within_radius),
    // so this figure always matches what's shown elsewhere. Best-effort only —
    // a claim with no loss location just leaves the subitem's distance column blank.
    let distanceMiles: number | null = null;
    if (claim.loss) {
      const { data: dist, error: distErr } = await supabase().rpc("property_distance_miles", {
        p_monday_item_id: propertyId,
        p_lat: claim.loss.lat,
        p_lng: claim.loss.lng,
      });
      if (distErr) {
        console.error("property_distance_miles failed", distErr.message);
      } else if (typeof dist === "number") {
        distanceMiles = dist;
      }
    }

    const subitemId = await createSubitem(claimId, name, propertyId, distanceMiles);

    return NextResponse.json<AddToClaimResponse>({ ok: true, subitemId, alreadyAttached: false, ...(DRY_RUN && { dryRun: true }) }, { status: 201 });
  } catch (e) {
    const code = e instanceof MondayError ? "monday_error" : "server_error";
    const message = e instanceof Error ? e.message : "Add to claim failed";
    return NextResponse.json<ApiError>({ error: message, code }, { status: 502 });
  }
}
