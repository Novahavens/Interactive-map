import { NextRequest, NextResponse } from "next/server";
import { overlayDetail } from "@/lib/edit-overlay";
import {
  FIELD_BY_KEY, conflicts, diffLines, fromMondayText, mondayColumnValues, parseEditRequest, sameValue,
  type EditChanges, type EditField, type EditKey,
} from "@/lib/listing-edit";
import { BOARDS, DRY_RUN, changeColumns, createUpdate, readColumns } from "@/lib/monday";
import { loadPropertyDetail } from "@/lib/property-detail";
import { supabase } from "@/lib/supabase";
import type { ApiError, EditConflictResponse, EditListingResponse, PropertyDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 18 fields with a 2,000-character note at most; anything much bigger is not a form submission. */
const MAX_BODY = 32_000;

// What listing_edit_guard (Postgres) can answer besides "ok:<log id>". The guard owns every limit: 30 edits per
// IP per 10 min, 20 per property per hour, 500 per day overall.
const REFUSALS: Record<string, { status: number; code: string; error: string }> = {
  not_found: { status: 404, code: "not_found", error: "Property not found" },
  ip_limit: { status: 429, code: "rate_limited", error: "Too many edits; try again in a few minutes" },
  property_limit: { status: 429, code: "rate_limited", error: "This property has been edited a lot in the last hour; try again later" },
  daily_cap: { status: 429, code: "rate_limited", error: "Too many edits today; try again tomorrow" },
};

const MONDAY_DOWN = "Could not reach Monday; nothing was changed. Try again";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const fieldOf = (k: EditKey) => FIELD_BY_KEY.get(k) as EditField;
const pick = (from: EditChanges, keys: EditKey[]): EditChanges => Object.fromEntries(keys.map((k) => [k, from[k] ?? null]));

/**
 * POST /api/properties/:id/edit  { editor, changes, base }  → EditListingResponse
 *
 * Edits a property's listing details from the map. Order: validate (parseEditRequest), listing_edit_guard
 * (limits, and logs the attempt), read the changed columns fresh from Monday, refuse with 409 if Monday no
 * longer holds what the editor started from, drop changes Monday already has, write Monday
 * (change_multiple_column_values), then mirror the same values into Supabase so the map shows them at once,
 * and post a note on the item saying who changed what. Nothing is mirrored unless the Monday write succeeded,
 * and never in a dry run. The Monday webhook later re-reads the item and confirms the mirror.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (process.env.MAP_EDITING === "off") return fail(403, "editing_off", "Editing from the map is switched off");
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) return fail(400, "bad_request", "Invalid property id");

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail(400, "bad_request", "Body is too large");
    raw = JSON.parse(text);
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }
  const parsed = parseEditRequest(raw);
  if (!parsed.ok) return fail(400, "bad_request", parsed.error);
  const { editor, changes, base } = parsed;
  const keys = Object.keys(changes) as EditKey[];

  const sb = supabase();
  let logId: number;
  try {
    const { data, error } = await sb.rpc("listing_edit_guard", {
      p_property_item_id: id, p_ip: clientIp(req), p_editor: editor, p_fields: keys, p_changes: changes,
    });
    if (error) throw error;
    const answer = String(data);
    if (!answer.startsWith("ok:")) {
      const refusal = REFUSALS[answer];
      return refusal ? fail(refusal.status, refusal.code, refusal.error) : fail(500, "server_error", "Edit failed");
    }
    logId = Number(answer.slice(3));
    if (!Number.isSafeInteger(logId)) throw new Error(`guard answered ${answer}`);
  } catch (e) {
    console.error("edit: guard failed", id, e instanceof Error ? e.message : e);
    return fail(500, "server_error", "Edit failed");
  }

  // The outcome only feeds the log; a failure to record it never changes the answer.
  const finish = async (status: string, before?: EditChanges) => {
    const { error } = await sb.rpc("listing_edit_finish", { p_log_id: logId, p_status: status, ...(before && { p_before: before }) });
    if (error) console.error("edit: could not record the outcome", id, status, error.message);
  };

  // Monday's values now (for the conflict check and the note) and the record as the map has it (for the answer).
  const [mondayRead, detailRead] = await Promise.allSettled([
    readColumns(id, keys.map((k) => fieldOf(k).column)),
    loadPropertyDetail(id),
  ]);
  if (mondayRead.status === "rejected") {
    console.error("edit: Monday read failed", id, mondayRead.reason instanceof Error ? mondayRead.reason.message : mondayRead.reason);
    await finish("failed");
    return fail(502, "monday_error", MONDAY_DOWN);
  }
  if (detailRead.status === "rejected" || !detailRead.value) {
    if (detailRead.status === "rejected") console.error("edit: property read failed", id, detailRead.reason instanceof Error ? detailRead.reason.message : detailRead.reason);
    await finish("failed");
    return detailRead.status === "fulfilled"
      ? fail(404, "not_found", "Property not found")
      : fail(502, "db_error", "Could not load the property; nothing was changed. Try again");
  }
  const texts = mondayRead.value;
  const before: PropertyDetail = detailRead.value;
  const current: EditChanges = Object.fromEntries(keys.map((k) => [k, fromMondayText(fieldOf(k), texts[fieldOf(k).column])]));

  const conflicted = conflicts(base, current);
  if (conflicted.length) {
    await finish("conflict");
    return NextResponse.json<EditConflictResponse>(
      { error: "Someone changed this in Monday since you opened it", code: "conflict", fields: conflicted, current: pick(current, conflicted) },
      { status: 409 },
    );
  }

  const remainingKeys = keys.filter((k) => !sameValue(changes[k], current[k]));
  if (remainingKeys.length === 0) {
    await finish("noop");
    return NextResponse.json<EditListingResponse>({ ok: true, detail: before, noted: false, mirrored: true });
  }
  const remaining = pick(changes, remainingKeys);

  try {
    await changeColumns(BOARDS.property, id, mondayColumnValues(remaining));
  } catch (e) {
    console.error("edit: Monday write failed", id, e instanceof Error ? e.message : e);
    await finish("failed");
    return fail(502, "monday_error", MONDAY_DOWN);
  }

  // Dry run: Monday was not written, so the mirror must not take the values either.
  if (DRY_RUN) {
    await finish("dry_run");
    return NextResponse.json<EditListingResponse>({ ok: true, detail: overlayDetail(before, remaining), noted: false, mirrored: false, dryRun: true });
  }

  let mirrored = false;
  {
    const { data, error } = await sb.rpc("listing_edit_mirror", { p_property_item_id: id, p_patch: remaining });
    if (error) console.error("edit: mirror failed; the Monday webhook will bring the values", id, error.message);
    mirrored = !error && data === true;
  }

  let detail: PropertyDetail;
  try {
    const fresh = await loadPropertyDetail(id);
    detail = fresh && mirrored ? fresh : overlayDetail(fresh ?? before, remaining);
  } catch (e) {
    console.error("edit: property re-read failed", id, e instanceof Error ? e.message : e);
    detail = overlayDetail(before, remaining);
  }

  // One bullet per field on its own line; a multi-line note value is folded onto its bullet.
  const date = new Date().toISOString().slice(0, 10);
  const lines = diffLines(remaining, current).map((l) => "• " + l.replace(/\s*\n\s*/g, " "));
  const note = escapeHtml(`✏️ Edited on the map by ${editor} on ${date}:\n${lines.join("\n")}`).replace(/\n/g, "<br>");
  let noted = true;
  try {
    await createUpdate(id, note);
  } catch (e) {
    noted = false;
    console.error("edit: note failed after the edit was saved", id, e instanceof Error ? e.message : e);
  }

  await finish("applied", current);
  return NextResponse.json<EditListingResponse>({ ok: true, detail, noted, mirrored });
}
