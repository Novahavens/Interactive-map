import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { isAnswered } from "@/lib/contact";
import { holdsSecret, quoTimeZone } from "@/lib/quo-config";
import { lastLoggable, localDay, type Match } from "@/lib/quo-events";
import { conversationHistory, conversationsPage, quoEnabled } from "@/lib/quo";
import { LAST_CONTACT_COL, setDates } from "@/lib/monday";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const E164_US = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * POST /api/quo/backfill (x-map-secret) — the one-off fill of Last Contact Date from Quo's history.
 *
 *   { "mode": "scan", "pageToken"?: string }  reads one page of conversations (100), matches their numbers to
 *     properties, reads the history only where Quo has activity newer than the map's date, and records the
 *     newest answered call or text per property in contact_backfill ('proposed'). Writes nothing to Monday.
 *     Answers `next` (the page to scan after this one, null at the end).
 *   { "mode": "apply", "limit"?: number }  writes up to `limit` (≤ 25) proposed dates to Monday in one request
 *     and marks them applied (the map's date follows). Rows the map has meanwhile caught up with are skipped.
 *
 * Driven by hand: scan to the end, export contact_backfill as the report, then apply once it's approved.
 */
export async function POST(req: NextRequest) {
  if (!holdsSecret(req.headers)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!quoEnabled()) return NextResponse.json({ ok: false, error: "QUO_API_KEY is not set" }, { status: 503 });
  const secret = editSecret();
  const body = (await req.json().catch(() => ({}))) as { mode?: string; pageToken?: string; limit?: number };
  const sb = supabase();

  if (body.mode === "apply") {
    const { data, error } = await sb.rpc("quo_backfill_next", { p_secret: secret, p_limit: Math.min(25, Math.max(1, Number(body.limit) || 25)) });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    const rows = (Array.isArray(data) ? data : []) as { id: string; day: string }[];
    if (!rows.length) return NextResponse.json({ ok: true, applied: 0, done: true });
    try {
      await setDates(LAST_CONTACT_COL, rows, { signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Monday: ${errText(e)}`, ids: rows.map((r) => r.id) }, { status: 502 });
    }
    const { data: n, error: markError } = await sb.rpc("quo_backfill_mark", { p_secret: secret, p_ids: rows.map((r) => r.id), p_state: "applied" });
    if (markError) return NextResponse.json({ ok: false, error: `written to Monday, not marked: ${markError.message}` }, { status: 502 });
    return NextResponse.json({ ok: true, applied: n, done: false });
  }

  if (body.mode !== "scan") return NextResponse.json({ ok: false, error: 'mode must be "scan" or "apply"' }, { status: 400 });
  const signal = AbortSignal.timeout(50_000);
  const tz = quoTimeZone();
  try {
    const page = await conversationsPage(body.pageToken || undefined, signal);
    const pairs = page.items.flatMap((c) =>
      c.participants.filter((p) => E164_US.test(p)).map((phone) => ({ inbox: c.phoneNumberId, phone, last: c.lastActivityAt })),
    );
    // Properties behind every number on the page, 20 numbers per lookup.
    const numbers = [...new Set(pairs.map((p) => p.phone))];
    const byNumber = new Map<string, Match[]>();
    for (let i = 0; i < numbers.length; i += 20) {
      const { data, error } = await sb.rpc("quo_match", { p_secret: secret, p_numbers: numbers.slice(i, i + 20) });
      if (error) throw error;
      for (const m of (Array.isArray(data) ? data : []) as Match[]) byNumber.set(m.number, [...(byNumber.get(m.number) ?? []), m]);
    }

    const rows: Record<string, unknown>[] = [];
    let read = 0;
    for (const p of pairs) {
      const matches = byNumber.get(p.phone) ?? [];
      // Only conversations with activity after the oldest date the map shows for their properties are read.
      if (!matches.length || !p.last) continue;
      const lastDay = localDay(p.last, tz);
      if (!matches.some((m) => !m.lastContact || m.lastContact < lastDay)) continue;
      read++;
      const h = await conversationHistory(p.inbox, p.phone, signal);
      const found = lastLoggable(h.calls, h.messages, isAnswered, h.names);
      if (!found) continue;
      const day = localDay(found.at, tz);
      for (const m of matches) {
        if (m.lastContact && m.lastContact >= day) continue;
        rows.push({ id: m.id, phone: p.phone, at: found.at, day, kind: found.kind, teammate: found.teammate, mondayDay: m.lastContact });
      }
    }
    let recorded = 0;
    if (rows.length) {
      const { data, error } = await sb.rpc("quo_backfill_upsert", { p_secret: secret, p_rows: rows });
      if (error) throw error;
      recorded = Number(data) || 0;
    }
    return NextResponse.json({ ok: true, conversations: page.items.length, matched: pairs.filter((p) => byNumber.has(p.phone)).length, read, recorded, next: page.next });
  } catch (e) {
    console.error("quo-backfill: scan failed", errText(e));
    return NextResponse.json({ ok: false, error: errText(e), pageToken: body.pageToken ?? null }, { status: 502 });
  }
}
