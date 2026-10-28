import { NextRequest, NextResponse } from "next/server";
import { editSecret, editingEnabled } from "@/lib/edit-config";
import { overlayDetail } from "@/lib/edit-overlay";
import {
  FIELD_BY_KEY, conflicts, currentValue, diffLines, fromMondayText, mondayColumnValues, parseEditRequest, sameValue,
  type EditChanges, type EditField, type EditKey,
} from "@/lib/listing-edit";
import { BOARDS, DRY_RUN, EDIT_CALL_TIMEOUT_MS, changeColumns, createUpdate, readColumns } from "@/lib/monday";
import { loadPropertyDetail } from "@/lib/property-detail";
import { supabase } from "@/lib/supabase";
import type { ApiError, EditConflictResponse, EditListingResponse, PropertyDetail } from "@/lib/types";

export const dynamic = "force-dynamic";
// The guard treats an edit as in flight for 30 s ("busy"); the function must be gone well before that.
export const maxDuration = 25;

/** 18 fields with a 2,000-character note at most; anything much bigger is not a form submission. */
const MAX_BODY = 32_000;
/** Every Monday call of one edit finishes within this many ms of the request starting (under maxDuration). */
const MONDAY_BUDGET_MS = 22_000;

// What listing_edit_guard (Postgres) can answer besides "ok:<log id>". The guard owns every limit: 30 attempts
// per IP per 10 min, 20 saved edits per property per hour, 500 per day overall, one edit of a property at a time.
const REFUSALS: Record<string, { status: number; code: string; error: string }> = {
  // MAP_EDIT_SECRET doesn't match sync_config MAP_EDIT_KEY (or the key isn't stored yet): a setup problem.
  forbidden: { status: 503, code: "editing_off", error: "Editing from the map isn't set up yet; nothing was changed" },
  // parseEditRequest already enforces the same rules, so this means the two definitions have drifted.
  invalid: { status: 400, code: "bad_request", error: "One of the values isn't allowed; nothing was changed" },
  not_found: { status: 404, code: "not_found", error: "Property not found" },
  busy: { status: 409, code: "busy", error: "Someone else is saving this property; try again in a moment" },
  ip_limit: { status: 429, code: "rate_limited", error: "Too many edits; try again in a few minutes" },
  property_limit: { status: 429, code: "rate_limited", error: "This property has been edited a lot in the last hour; try again later" },
  daily_cap: { status: 429, code: "rate_limited", error: "Too many edits today; try again tomorrow" },
};

/** Nothing was written (the read before the write failed, or there was no time left to write). */
const MONDAY_DOWN = "Could not reach Monday; nothing was changed. Try again";
/** The write failed or timed out: it may still have landed. */
const MONDAY_UNSURE = "Monday may not have saved this. Reopen the property to check before trying again";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The body as text, read with a cap: null as soon as it passes `max` bytes (a missing Content-Length included). */
async function readCapped(req: NextRequest, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const fieldOf = (k: EditKey) => FIELD_BY_KEY.get(k) as EditField;
const pick = (from: EditChanges, keys: EditKey[]): EditChanges => Object.fromEntries(keys.map((k) => [k, from[k] ?? null]));
const errText = (e: unknown) => (e instanceof Error ? e.message : e);

/**
 * POST /api/properties/:id/edit  { editor, changes, base }  → EditListingResponse
 *
 * Edits a property's listing details from the map. Order: validate (parseEditRequest), listing_edit_guard
 * (limits, one edit per property at a time, and logs the attempt), read the changed columns fresh from Monday,
 * refuse with 409 if Monday no longer holds what the editor started from (a field Monday already holds at the
 * editor's new value is not a conflict), drop changes Monday already has, write Monday
 * (change_multiple_column_values), read the columns back, mark the log row monday_ok with the fields Monday now
 * shows, have Supabase mirror exactly those logged values so the map shows them at once, and post a note on
 * the item saying who changed what. Fields Monday didn't take come back as `unconfirmed`, and are neither
 * mirrored nor noted. Nothing is mirrored unless the write succeeded and was read back, and never in a dry run.
 * Every path finishes its log row. The Monday webhook later re-reads the item and confirms the mirror.
 *
 * When Monday already holds every requested value: if the map does too, it is a no-op (no note). If the map
 * is behind (typically a save that timed out but landed), the row goes monday_ok with every field confirmed and
 * is mirrored so the map catches up, and the change note that the failed save never posted is posted now.
 *
 * Every Monday call has a timeout and all of them end within MONDAY_BUDGET_MS, so a hung Monday can't keep a
 * save running past the guard's 30 s busy window.
 *
 * On only when MAP_EDIT_SECRET is set and MAP_EDITING is not "off"; every RPC carries the secret, which the
 * database checks against sync_config MAP_EDIT_KEY. A cleared field is sent to Monday as a JSON null for every
 * column kind, per monday.com's API reference ("Changing column values" and each column type's "Clear"
 * section), verified live on a throwaway board on 28 Oct 2026: null cleared all five kinds (numbers, text,
 * long text, date, dropdown), while an empty string on a numbers column left a stored empty value instead of
 * clearing it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deadline = Date.now() + MONDAY_BUDGET_MS;
  const timeLeft = () => deadline - Date.now();
  const mondaySignal = () => AbortSignal.timeout(Math.max(1, Math.min(EDIT_CALL_TIMEOUT_MS, timeLeft())));

  const secret = editSecret();
  if (!secret || !editingEnabled()) return fail(403, "editing_off", "Editing from the map is switched off");
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) return fail(400, "bad_request", "Invalid property id");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413, "too_large", "Body is too large");

  let raw: unknown;
  try {
    const text = await readCapped(req, MAX_BODY);
    if (text === null) return fail(413, "too_large", "Body is too large");
    raw = JSON.parse(text);
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }
  const parsed = parseEditRequest(raw);
  if (!parsed.ok) return fail(400, "bad_request", parsed.error);
  const { editor, changes, base } = parsed;
  const keys = Object.keys(changes) as EditKey[];
  const columns = keys.map((k) => fieldOf(k).column);
  const asValues = (texts: Record<string, string | null>): EditChanges =>
    Object.fromEntries(keys.map((k) => [k, fromMondayText(fieldOf(k), texts[fieldOf(k).column])]));

  const sb = supabase();
  let logId: number;
  try {
    const { data, error } = await sb.rpc("listing_edit_guard", {
      p_secret: secret, p_property_item_id: id, p_ip: clientIp(req), p_editor: editor, p_fields: keys, p_changes: changes,
    });
    if (error) throw error;
    const answer = String(data);
    if (!answer.startsWith("ok:")) {
      if (answer === "forbidden") console.error("edit: the database refused MAP_EDIT_SECRET (sync_config MAP_EDIT_KEY missing or different)", id);
      const refusal = REFUSALS[answer];
      return refusal ? fail(refusal.status, refusal.code, refusal.error) : fail(500, "server_error", "Edit failed");
    }
    logId = Number(answer.slice(3));
    if (!Number.isSafeInteger(logId)) throw new Error(`guard answered ${answer}`);
  } catch (e) {
    console.error("edit: guard failed", id, errText(e));
    return fail(500, "server_error", "Edit failed");
  }

  // The outcome only feeds the log; a failure to record it never changes the answer.
  const finish = async (status: string, extra: { before?: EditChanges; confirmed?: EditKey[] } = {}) => {
    const { error } = await sb.rpc("listing_edit_finish", {
      p_secret: secret, p_log_id: logId, p_status: status,
      ...(extra.before && { p_before: extra.before }),
      ...(extra.confirmed && { p_confirmed: extra.confirmed }),
    });
    if (error) console.error("edit: could not record the outcome", id, status, error.message);
  };

  // Monday's values now (for the conflict check and the note) and the record as the map has it (for the answer).
  const [mondayRead, detailRead] = await Promise.allSettled([
    readColumns(id, columns, { signal: mondaySignal() }),
    loadPropertyDetail(id),
  ]);
  if (mondayRead.status === "rejected") {
    console.error("edit: Monday read failed", id, errText(mondayRead.reason));
    await finish("failed");
    return fail(502, "monday_error", MONDAY_DOWN);
  }
  if (detailRead.status === "rejected" || !detailRead.value) {
    if (detailRead.status === "rejected") console.error("edit: property read failed", id, errText(detailRead.reason));
    await finish("failed");
    return detailRead.status === "fulfilled"
      ? fail(404, "not_found", "Property not found")
      : fail(502, "db_error", "Could not load the property; nothing was changed. Try again");
  }
  const before: PropertyDetail = detailRead.value;
  const current = asValues(mondayRead.value);

  // A field Monday already holds at the new value is not a conflict, whatever the editor started from (a
  // timed-out save that landed, or two people making the same edit): it is simply already done.
  const conflicted = conflicts(base, current).filter((k) => !sameValue(changes[k], current[k]));
  if (conflicted.length) {
    await finish("conflict");
    return NextResponse.json<EditConflictResponse>(
      { error: "Someone changed this in Monday since you opened it", code: "conflict", fields: conflicted, current: pick(current, conflicted) },
      { status: 409 },
    );
  }

  // After the write: mirror the confirmed fields, answer with the record as the map now has it, post the note
  // (noteKeys against noteBefore), close the row. Shared by a normal save and a no-op that catches the map up.
  const settle = async (confirmed: EditKey[], noteKeys: EditKey[], noteBefore: EditChanges, unconfirmed: EditKey[]) => {
    let mirrored = false;
    if (confirmed.length) {
      const { data, error } = await sb.rpc("listing_edit_mirror", { p_secret: secret, p_property_item_id: id, p_log_id: logId });
      if (error) console.error("edit: mirror failed; the Monday webhook will bring the values", id, error.message);
      mirrored = !error && data === true;
    }

    const shown = pick(changes, confirmed);
    let detail: PropertyDetail;
    try {
      const fresh = await loadPropertyDetail(id);
      detail = fresh && mirrored ? fresh : overlayDetail(fresh ?? before, shown);
    } catch (e) {
      console.error("edit: property re-read failed", id, errText(e));
      detail = overlayDetail(before, shown);
    }

    let noted = false;
    const lines = diffLines(pick(changes, noteKeys), noteBefore).map((l) => "• " + l.replace(/\s*\n\s*/g, " "));
    if (lines.length && timeLeft() > 500) {
      // One bullet per field on its own line; a multi-line note value is folded onto its bullet.
      const date = new Date().toISOString().slice(0, 10);
      const note = escapeHtml(`✏️ Edited on the map by ${editor} on ${date}:\n${lines.join("\n")}`).replace(/\n/g, "<br>");
      try {
        await createUpdate(id, note, { signal: mondaySignal() });
        noted = true;
      } catch (e) {
        console.error("edit: note failed after the edit was saved", id, errText(e));
      }
    }

    // The mirror already marks its row applied; this closes the row when the mirror didn't (a no-op otherwise).
    await finish("applied");
    return NextResponse.json<EditListingResponse>({ ok: true, detail, noted, mirrored, unconfirmed });
  };

  const remainingKeys = keys.filter((k) => !sameValue(changes[k], current[k]));
  if (remainingKeys.length === 0) {
    // Monday already holds every requested value. If the map does too, there is nothing to do.
    const row = before as unknown as Record<string, unknown>;
    const behind = keys.filter((k) => !sameValue(currentValue(fieldOf(k), row), changes[k]));
    if (!behind.length) {
      await finish("noop");
      return NextResponse.json<EditListingResponse>({ ok: true, detail: before, noted: false, mirrored: true, unconfirmed: [] });
    }
    if (DRY_RUN) {
      await finish("dry_run");
      return NextResponse.json<EditListingResponse>({ ok: true, detail: overlayDetail(before, changes), noted: false, mirrored: false, unconfirmed: [], dryRun: true });
    }
    // The map is behind Monday. Asked while this row is still pending: was this exact edit tried a moment ago,
    // written to Monday, and failed before its note went out?
    let owed: EditChanges | null = null;
    {
      const { data, error } = await sb.rpc("listing_edit_owed_note", { p_secret: secret, p_property_item_id: id, p_changes: changes });
      if (error) console.error("edit: could not check for an owed note", id, error.message);
      else if (data && typeof data === "object" && !Array.isArray(data)) owed = data as EditChanges;
    }
    await finish("monday_ok", { before: current, confirmed: keys });
    return settle(keys, owed ? keys : [], owed ?? current, []);
  }
  const remaining = pick(changes, remainingKeys);

  // Too little time left for a write that could still be confirmed: don't start one.
  if (timeLeft() < 2_000) {
    console.error("edit: out of time before the Monday write", id);
    await finish("failed");
    return fail(502, "monday_error", MONDAY_DOWN);
  }
  try {
    await changeColumns(BOARDS.property, id, mondayColumnValues(remaining), { signal: mondaySignal() });
  } catch (e) {
    console.error("edit: Monday write failed or timed out", id, errText(e));
    // `before` marks a row whose write may have landed: a retry that finds Monday already saved posts its note.
    await finish("failed", { before: current });
    return fail(502, "monday_error", MONDAY_UNSURE);
  }

  // Dry run: Monday was not written, so the mirror must not take the values either.
  if (DRY_RUN) {
    await finish("dry_run");
    return NextResponse.json<EditListingResponse>({ ok: true, detail: overlayDetail(before, remaining), noted: false, mirrored: false, unconfirmed: [], dryRun: true });
  }

  // Read back what Monday holds now. Confirmed = every requested field Monday shows at the editor's value
  // (fields that were already equal included, so the mirror lines up with Monday). A failed read-back
  // confirms nothing: nothing is mirrored and the webhook brings Monday's truth.
  let confirmed: EditKey[] = [];
  let readBack = false;
  if (timeLeft() > 500) {
    try {
      const after = asValues(await readColumns(id, columns, { signal: mondaySignal() }));
      confirmed = keys.filter((k) => sameValue(after[k], changes[k]));
      readBack = true;
    } catch (e) {
      console.error("edit: Monday read-back failed; not mirroring", id, errText(e));
    }
  }
  const unconfirmed = remainingKeys.filter((k) => !confirmed.includes(k));
  if (readBack && unconfirmed.length) console.error("edit: Monday did not take", id, unconfirmed.join(","));

  // The note lists what Monday took: every written field, less the ones the read-back showed it ignored
  // (when the read-back itself failed, the write's success is all there is to go on).
  await finish("monday_ok", { before: current, confirmed });
  return settle(confirmed, readBack ? remainingKeys.filter((k) => confirmed.includes(k)) : remainingKeys, current, unconfirmed);
}
