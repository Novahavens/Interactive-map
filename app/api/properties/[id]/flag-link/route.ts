import { NextRequest, NextResponse } from "next/server";
import { BOARDS, COLS, MondayError, DRY_RUN, createUpdate, setStatusLabel } from "@/lib/monday";
import { supabase } from "@/lib/supabase";
import type { ApiError, FlagLinkRequest, FlagLinkResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const BAD_LINK = "BAD LINK";
const MAX_NAME = 80;
const MAX_NOTE = 300;

// Token bucket per client IP: 10 reports per 10 minutes. In-memory, so Vercel instances do not share it;
// acceptable because the Monday writes are idempotent here (same label, and alreadyFlagged short-circuits repeats).
const LIMIT = 10;
const WINDOW_MS = 10 * 60_000;
const buckets = new Map<string, { tokens: number; at: number }>();

function takeToken(ip: string, now: number): boolean {
  for (const [k, b] of buckets) if (now - b.at > WINDOW_MS) buckets.delete(k);
  const b = buckets.get(ip) ?? { tokens: LIMIT, at: now };
  b.tokens = Math.min(LIMIT, b.tokens + ((now - b.at) / WINDOW_MS) * LIMIT);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// Control characters out; whitespace collapsed so a note cannot fake extra lines in the Monday update.
function clean(v: unknown, max: number): string | undefined {
  if (v == null) return "";
  if (typeof v !== "string") return undefined;
  const out = v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  return out.length <= max ? out : undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * POST /api/properties/:id/flag-link  { reportedBy?, note? }
 *
 * "Report bad link". Order: validate, find the property, short-circuit if already BAD LINK, then
 *   (a) set ZZ.Status = BAD LINK on the property item (the write that matters),
 *   (b) post an update on the item saying who reported it (best-effort once (a) landed).
 * The mirror is not written here: the Monday webhook echoes the new label into Supabase within seconds,
 * and the panel flips to "flagged" on the 200.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) {
    return NextResponse.json<ApiError>({ error: "Invalid property id", code: "bad_request" }, { status: 400 });
  }

  let body: Partial<FlagLinkRequest>;
  try {
    const raw: unknown = await req.json();
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
    body = raw as Partial<FlagLinkRequest>;
  } catch {
    return NextResponse.json<ApiError>({ error: "Body must be a JSON object", code: "bad_request" }, { status: 400 });
  }
  const reportedBy = clean(body.reportedBy, MAX_NAME);
  const note = clean(body.note, MAX_NOTE);
  if (reportedBy === undefined || note === undefined) {
    return NextResponse.json<ApiError>(
      { error: `reportedBy (max ${MAX_NAME}) and note (max ${MAX_NOTE}) must be text within those lengths`, code: "bad_request" },
      { status: 400 },
    );
  }

  if (!takeToken(clientIp(req), Date.now())) {
    return NextResponse.json<ApiError>({ error: "Too many reports; try again in a few minutes", code: "rate_limited" }, { status: 429 });
  }

  try {
    const { data, error } = await supabase().rpc("property_detail", { p_monday_item_id: id });
    if (error) throw error;
    const prop = (Array.isArray(data) ? data[0] : data) as { link_status: string | null; property_link: string | null } | undefined;
    if (!prop) {
      return NextResponse.json<ApiError>({ error: "Property not found in the database mirror", code: "not_found" }, { status: 404 });
    }
    if (prop.link_status === BAD_LINK) {
      return NextResponse.json<FlagLinkResponse>({ ok: true, alreadyFlagged: true });
    }

    await setStatusLabel(BOARDS.property, id, COLS.linkStatus, BAD_LINK);

    const date = new Date().toISOString().slice(0, 10);
    const text = `🔗 Bad link reported from the map by ${reportedBy || "the map"} on ${date}. Link: ${prop.property_link ?? "none on file"}. ${note ?? ""}`.trim();
    try {
      await createUpdate(id, escapeHtml(text));
    } catch (e) {
      console.error("flag-link: update failed after the flag was set", id, e instanceof Error ? e.message : e);
    }

    return NextResponse.json<FlagLinkResponse>({ ok: true, alreadyFlagged: false, ...(DRY_RUN && { dryRun: true }) });
  } catch (e) {
    const code = e instanceof MondayError ? "monday_error" : "server_error";
    const message = e instanceof Error ? e.message : "Report failed";
    return NextResponse.json<ApiError>({ error: message, code }, { status: 502 });
  }
}
