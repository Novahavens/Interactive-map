import { NextRequest, NextResponse } from "next/server";
import { readClaim, readSpecialist, createUpdate, MondayError, DRY_RUN } from "@/lib/monday";
import { supabase } from "@/lib/supabase";
import { buildSummary, parseEmails, type SummaryOption } from "@/lib/summary";
import type { ApiError, PropertyDetail, SummaryLogResponse, SummaryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Claim + attached options + specialist → the rendered summary. Always built server-side. */
async function load(claimId: string): Promise<SummaryResponse | null> {
  const [claim, specialist] = await Promise.all([readClaim(claimId), readSpecialist(claimId)]);
  if (!claim) return null;

  const ids = Array.from(new Set(claim.attached.map((a) => a.propertyId).filter((x): x is string => !!x)));
  const options: SummaryOption[] = await Promise.all(
    ids.map(async (id) => {
      const [detailRes, distRes] = await Promise.all([
        supabase().rpc("property_detail", { p_monday_item_id: id }),
        claim.loss
          ? supabase().rpc("property_distance_miles", { p_monday_item_id: id, p_lat: claim.loss.lat, p_lng: claim.loss.lng })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (detailRes.error) throw detailRes.error;
      const detail = (Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data) as PropertyDetail | undefined;
      return {
        detail: detail ?? ({ monday_item_id: id, name: `Property ${id}` } as PropertyDetail),
        distanceMiles: typeof distRes.data === "number" ? distRes.data : null,
      };
    }),
  );

  const s = buildSummary({
    claim: { id: claim.id, name: claim.name, lossAddress: claim.loss?.address ?? null, needs: claim.needs },
    options,
    preparedAt: new Date(),
  });
  return {
    ...s,
    optionCount: options.length,
    recipient: { name: specialist.name, emails: parseEmails(specialist.emailText) },
  };
}

function fail(e: unknown) {
  const code = e instanceof MondayError ? "monday_error" : "server_error";
  const message = e instanceof Error ? e.message : "Summary failed";
  return NextResponse.json<ApiError>({ error: message, code }, { status: 502 });
}

function badId() {
  return NextResponse.json<ApiError>({ error: "Invalid claim id", code: "bad_request" }, { status: 400 });
}

function notFound() {
  return NextResponse.json<ApiError>({ error: "Claim not found", code: "not_found" }, { status: 404 });
}

/** GET /api/claim/:claimId/summary — preview: subject, text, html and the specialist's address(es). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!/^\d+$/.test(claimId)) return badId();
  try {
    const summary = await load(claimId);
    if (!summary) return notFound();
    return NextResponse.json<SummaryResponse>(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST /api/claim/:claimId/summary — records on the claim (a Monday update) that the summary went to the
 * specialist. The email itself is sent by the searcher from their own mailbox; this is the audit trail.
 * The body is rebuilt here, never taken from the client.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!/^\d+$/.test(claimId)) return badId();
  try {
    const summary = await load(claimId);
    if (!summary) return notFound();
    if (summary.optionCount === 0) {
      return NextResponse.json<ApiError>({ error: "This claim has no options attached yet", code: "bad_request" }, { status: 400 });
    }
    const to = summary.recipient.emails.join(", ") || "the relocation specialist";
    const who = (summary.recipient.name ? `${summary.recipient.name} (${to})` : to).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const updateId = await createUpdate(claimId, `<p><b>Summary emailed to ${who} from the property map.</b></p>${summary.html}`);
    return NextResponse.json<SummaryLogResponse>({ ok: true, updateId, ...(DRY_RUN && { dryRun: true }) });
  } catch (e) {
    return fail(e);
  }
}
