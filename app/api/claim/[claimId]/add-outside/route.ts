import { NextRequest, NextResponse } from "next/server";
import { AgentError, addOutsideHome } from "@/lib/agent-chat";
import { featureOn } from "@/lib/features";
import { ID_RE, UUID_RE, clientIp } from "@/lib/map-agent";
import type { AddOutsideResponse, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY = 4096;

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * POST /api/claim/:claimId/add-outside  { listingId, user? }
 *
 * "Add to claim" for a home found outside our database. The Search Chat workflow does the work the same way
 * as from the Monday panel: the home goes into PROPERTY DATABASE once and a sub-item is added under the claim.
 * 201 when added, 200 when it was already on the claim (`alreadyOnClaim`). With MONDAY_DRY_RUN=1 nothing is
 * sent and the answer says `dryRun: true`.
 * 404 the home is gone, 409 `no_address` (ask the landlord first), 429, 502 `agent_error`, 504 `timeout`,
 * 503 `feature_off` while the `addOutside` feature is off.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");
  if (!featureOn("addOutside")) return fail(503, "feature_off", "Adding outside homes is switched off");

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > MAX_BODY) return fail(413, "too_large", "Request is too long");
    const raw: unknown = JSON.parse(text);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
    body = raw as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }
  const listingId = typeof body.listingId === "string" ? body.listingId.toLowerCase() : "";
  if (!UUID_RE.test(listingId)) return fail(400, "bad_request", "listingId is required");

  try {
    const { created, ...out } = await addOutsideHome(claimId, listingId, body.user, clientIp(req.headers));
    return NextResponse.json<AddOutsideResponse>(out, { status: created ? 201 : 200 });
  } catch (e) {
    if (e instanceof AgentError) return fail(e.status, e.code, e.message);
    console.error("POST /api/claim/[claimId]/add-outside failed", claimId, e instanceof Error ? e.name : "error");
    return fail(502, "agent_error", "The home was not added. Try again in a minute");
  }
}
