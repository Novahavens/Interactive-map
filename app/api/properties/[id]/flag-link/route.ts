import { NextRequest, NextResponse } from "next/server";
import { BOARDS, COLS, DRY_RUN, createUpdate, setStatusLabel } from "@/lib/monday";
import { first, supabase } from "@/lib/supabase";
import { BAD_LINK, type ApiError, type FlagLinkRequest, type FlagLinkResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_NOTE = 300;

// What flag_link_guard (Postgres) can answer besides "ok". The guard owns every limit: one report per
// property per 24 h, 10 per IP per 10 min, 300 per day overall.
const REFUSALS: Record<string, { status: number; code: string; error: string }> = {
  already_flagged: { status: 409, code: "already_flagged", error: "This link is already reported as bad" },
  duplicate: { status: 409, code: "duplicate", error: "This link was just reported" },
  no_link: { status: 400, code: "no_link", error: "This property has no listing link to report" },
  not_found: { status: 404, code: "not_found", error: "Property not found" },
  ip_limit: { status: 429, code: "rate_limited", error: "Too many reports; try again in a few minutes" },
  daily_cap: { status: 429, code: "rate_limited", error: "Too many reports today; try again tomorrow" },
};

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// Control, bidi and zero-width characters out; whitespace collapsed so a note cannot fake extra lines
// in the Monday update or hide text.
function clean(v: unknown, max: number): string | undefined {
  if (v == null) return "";
  if (typeof v !== "string") return undefined;
  const out = v
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.length <= max ? out : undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * POST /api/properties/:id/flag-link  { reportedBy?, note? }
 *
 * "Report bad link". Order: validate, flag_link_guard (refuses or logs the report and mirrors BAD LINK in
 * Supabase), then (a) set ZZ.Status = BAD LINK on the property item, (b) post an update saying who
 * reported it. If (a) fails the mirror is rolled back with flag_link_undo; if only (b) fails the flag
 * stands and the response says noted:false. The Monday webhook later confirms the mirror.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) return fail(400, "bad_request", "Invalid property id");

  let body: Partial<FlagLinkRequest>;
  try {
    const raw: unknown = await req.json();
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
    body = raw as Partial<FlagLinkRequest>;
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }
  const reportedBy = clean(body.reportedBy, MAX_NAME);
  const note = clean(body.note, MAX_NOTE);
  if (reportedBy === undefined || note === undefined) {
    return fail(400, "bad_request", `reportedBy (max ${MAX_NAME}) and note (max ${MAX_NOTE}) must be text within those lengths`);
  }
  if (reportedBy.includes("://") || note.includes("://")) return fail(400, "bad_request", "Links are not allowed in the note");

  const sb = supabase();
  let link: string | null;
  try {
    const { data, error } = await sb.rpc("flag_link_guard", {
      p_property_item_id: id, p_ip: clientIp(req), p_reported_by: reportedBy, p_note: note,
    });
    if (error) throw error;
    if (data !== "ok") {
      const refusal = REFUSALS[String(data)];
      return refusal ? fail(refusal.status, refusal.code, refusal.error) : fail(500, "server_error", "Report failed");
    }
    const detail = await sb.rpc("property_detail", { p_monday_item_id: id });
    // The link only decorates the Monday note; the flag matters more than the text.
    link = detail.error ? null : (first<{ property_link: string | null }>(detail.data)?.property_link ?? null);
  } catch (e) {
    console.error("flag-link: guard failed", id, e instanceof Error ? e.message : e);
    return fail(500, "server_error", "Report failed");
  }

  try {
    await setStatusLabel(BOARDS.property, id, COLS.linkStatus, BAD_LINK);
    // Dry run: Monday was not written, so the mirror and the log must not keep the flag either.
    if (DRY_RUN) await sb.rpc("flag_link_undo", { p_property_item_id: id });
  } catch (e) {
    console.error("flag-link: Monday write failed, rolling back", id, e instanceof Error ? e.message : e);
    const { error } = await sb.rpc("flag_link_undo", { p_property_item_id: id });
    if (error) console.error("flag-link: rollback failed", id, error.message);
    return fail(502, "monday_error", "Could not reach Monday; nothing was changed. Try again later");
  }

  const date = new Date().toISOString().slice(0, 10);
  const text = `🔗 Bad link reported from the map by ${reportedBy || "the map"} on ${date}. Link: ${link ?? "none on file"}. ${note}`.trim();
  let noted = true;
  try {
    await createUpdate(id, escapeHtml(text));
  } catch (e) {
    noted = false;
    console.error("flag-link: update failed after the flag was set", id, e instanceof Error ? e.message : e);
  }

  return NextResponse.json<FlagLinkResponse>({ ok: true, alreadyFlagged: false, noted, ...(DRY_RUN && { dryRun: true }) });
}
