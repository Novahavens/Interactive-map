import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { ID_RE, refused, toOutreach } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError, OutreachResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * GET /api/properties/:id/outreach
 * The latest message to this home's landlord through a listing site (status, who sent it, when, replied or
 * not), for the status line under the Text action. `outreach: null` when there is none.
 * `{ enabled: false, outreach: null }` while the `templates` feature is off.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail(400, "bad_request", "Invalid property id");

  const secret = editSecret();
  if (!featureOn("templates") || !secret) return NextResponse.json<OutreachResponse>({ enabled: false, outreach: null });

  try {
    const { data, error } = await supabase().rpc("map_outreach_status", { p_secret: secret, p_property_item_id: id });
    if (error) throw error;
    if (refused(data)) {
      console.error("GET /api/properties/[id]/outreach: the database refused the map secret");
      return fail(502, "db_error", "Database query failed");
    }
    return NextResponse.json<OutreachResponse>(
      { enabled: true, outreach: toOutreach((data as { outreach?: unknown }).outreach) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("GET /api/properties/[id]/outreach failed", id, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
