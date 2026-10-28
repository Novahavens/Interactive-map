import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { isAnswered } from "@/lib/contact";
import { holdsSecret, quoTimeZone } from "@/lib/quo-config";
import { lastLoggable, localDay, type Match } from "@/lib/quo-events";
import { conversationHistory, conversationsPage, quoEnabled } from "@/lib/quo";
import { LAST_CONTACT_COL, setDates } from "@/lib/monday";
import { supabase } from "@/lib/supabase";
import { errorText as errText } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const E164_US = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
/** Monday errors that say nothing about the row (the same ones lib/monday.ts retries reads on). */
const TRANSIENT = /\b(429|50\d)\b|rate limit|complexity|timed? ?out|non-JSON/i;

/**
 * POST /api/quo/backfill (x-map-secret) — the one-off fill of Last Contact Date from Quo's history.
 *
 *   { "mode": "scan", "pageToken"?: string }  reads one page of conversations (50), matches their numbers to
 *     properties, reads the history only where Quo has activity newer than the map's date, and records the
 *     newest answered call or text per property in contact_backfill ('proposed'). Writes nothing to Monday.
 *     Answers `next` (the page to scan after this one, null at the end).
 *   { "mode": "apply", "limit"?: number }  writes up to `limit` (≤ 25) proposed dates to Monday in one request
 *     and marks them applied (the map's date follows). Rows the map has meanwhile caught up with are skipped. If
 *     Monday refuses the batch, each row is tried on its own and the ones it still refuses (a deleted item) are
 *     marked failed, so one bad row never blocks the rest; a row that only met a busy Monday (rate limit,
 *     complexity budget, timeout) stays proposed and is tried again on the next call (`retryLater`).
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
    let written = rows;
    const refused: { id: string; error: string }[] = [];
    try {
      await setDates(LAST_CONTACT_COL, rows, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      written = [];
      for (const r of rows) {
        try {
          await setDates(LAST_CONTACT_COL, [r], { signal: AbortSignal.timeout(5_000) });
          written.push(r);
        } catch (one) {
          refused.push({ id: r.id, error: errText(one) });
        }
      }
      if (!written.length && refused.every((r) => TRANSIENT.test(r.error))) {
        return NextResponse.json({ ok: false, error: `Monday: ${errText(e)}` }, { status: 502 }); // Monday is busy or down, not the rows
      }
    }
    // Only a row Monday refuses for itself is failed; one that hit a busy Monday stays proposed for the next run.
    const failed = refused.filter((r) => !TRANSIENT.test(r.error));
    const mark = (ids: string[], state: string, error?: string) => sb.rpc("quo_backfill_mark", { p_secret: secret, p_ids: ids, p_state: state, p_error: error ?? null });
    const { data: n, error: markError } = written.length ? await mark(written.map((r) => r.id), "applied") : { data: 0, error: null };
    for (const r of failed) await mark([r.id], "failed", r.error);
    if (markError) return NextResponse.json({ ok: false, error: `written to Monday, not marked: ${markError.message}` }, { status: 502 });
    return NextResponse.json({ ok: true, applied: n, failed: failed.length, retryLater: refused.length - failed.length, done: false });
  }

  if (body.mode !== "scan") return NextResponse.json({ ok: false, error: 'mode must be "scan" or "apply"' }, { status: 400 });
  const signal = AbortSignal.timeout(50_000);
  const tz = quoTimeZone();
  try {
    const page = await conversationsPage(body.pageToken || undefined, signal, 50);
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

    // Only conversations with activity after the oldest date the map shows for their properties are read. The
    // reads run together; lib/quo.ts paces them under Quo's 10 a second.
    const due = pairs.filter((p) => {
      const matches = byNumber.get(p.phone) ?? [];
      if (!matches.length || !p.last) return false;
      const lastDay = localDay(p.last, tz);
      return matches.some((m) => !m.lastContact || m.lastContact < lastDay);
    });
    const found = await Promise.all(
      due.map(async (p) => {
        const h = await conversationHistory(p.inbox, p.phone, signal);
        return { p, last: lastLoggable(h.calls, h.messages, isAnswered, h.names) };
      }),
    );
    // One row per property: the newest contact across its numbers and inboxes.
    const newest = new Map<string, Record<string, unknown> & { at: string }>();
    for (const { p, last } of found) {
      if (!last) continue;
      const day = localDay(last.at, tz);
      for (const m of byNumber.get(p.phone) ?? []) {
        if (m.lastContact && m.lastContact >= day) continue;
        const prev = newest.get(m.id);
        if (prev && Date.parse(prev.at) >= Date.parse(last.at)) continue;
        newest.set(m.id, { id: m.id, phone: p.phone, at: last.at, day, kind: last.kind, teammate: last.teammate, mondayDay: m.lastContact });
      }
    }
    const rows = [...newest.values()];
    const read = due.length;
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
