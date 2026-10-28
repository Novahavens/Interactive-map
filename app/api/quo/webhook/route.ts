import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { readFacts } from "@/lib/owner-said";
import { quoConfig, quoTimeZone } from "@/lib/quo-config";
import {
  dateTargets, liveFor, localDay, movesDate, noteHtml, noteSlot, noteTargets, parseEvent, summaryTargets, callOutcome,
  type Match, type QuoEvent,
} from "@/lib/quo-events";
import { verifyQuoSignature } from "@/lib/quo-signature";
import { callDetails, teammateName } from "@/lib/quo";
import { LAST_CONTACT_COL, createUpdate, setDates } from "@/lib/monday";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Quo waits about 10 s for an answer; every Monday and Quo call of one event ends within this. */
const BUDGET_MS = 8_000;
const MAX_BODY = 256_000;

const ok = (detail: string) => NextResponse.json({ ok: true, detail });
/** Not handled yet: Quo delivers the event again later (8 attempts over about 27 hours). */
const later = (detail: string) => NextResponse.json({ ok: false, detail }, { status: 503, headers: { "Retry-After": "60" } });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * POST /api/quo/webhook — every call, text and call summary from Quo (one webhook for all numbers, created by
 * /api/quo/setup, API version 2026-03-30).
 *
 * Order: verify the signature (Standard Webhooks, keys from sync_config) → parse → quo_event_begin (dedupe;
 * a retry resumes, a delivery already being handled answers 503) → match the other party's number to
 * properties (quo_match) → in live mode, move Last Contact Date on every matched property that shows an
 * older date (one Monday request, then the map's mirror) and post one note per property, day and slot on the
 * smart-picked properties (claimed first, so a retry never posts twice) → quo_event_finish. In shadow mode it
 * records what it would have done and writes nothing. A summary is stored for the "Owner said" card in every
 * mode; it never writes Monday.
 *
 * Anything that fails part-way answers 503 so Quo retries; whatever already happened is not repeated (dates
 * are idempotent, notes are claimed). The rules live in lib/quo-events.ts; the design in
 * docs/QUO-INTEGRATION.md.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);
  const signal = () => AbortSignal.timeout(Math.max(1, Math.min(5_000, left())));

  const secret = editSecret();
  if (!secret) return later("not set up: MAP_EDIT_SECRET is missing");

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false, detail: "too large" }, { status: 413 });
  const headers = {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  };

  let config;
  try {
    config = await quoConfig();
    // A key stored seconds ago (setup, rotation) may not be in this instance's cache yet.
    if (config && !verifyQuoSignature(raw, headers, config.keys)) config = await quoConfig(true);
  } catch (e) {
    console.error("quo-webhook: config read failed", errText(e));
    return later("database unavailable");
  }
  if (!config) return later("the database refused MAP_EDIT_SECRET");
  if (!verifyQuoSignature(raw, headers, config.keys)) {
    return NextResponse.json({ ok: false, detail: "bad signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return ok("not JSON; ignored");
  }
  const parsed = parseEvent(body);
  if (!parsed.ok) {
    if (parsed.reason === "invalid") console.error("quo-webhook: unreadable event", headers.id, raw.slice(0, 300));
    return ok(parsed.reason === "ignore" ? "event type not used" : "unreadable; ignored");
  }
  const event = parsed.event;
  if (config.mode === "off") return ok("logging is off");

  const sb = supabase();
  const tz = quoTimeZone();
  const teammate = await teammateName(event.userId, signal());

  // Summaries: fill in what the event couldn't say from the call itself, then store for the card.
  let details: Awaited<ReturnType<typeof callDetails>> = null;
  if (event.kind === "summary" && event.summary.length) {
    let lookupFailed = false;
    details = await callDetails(event.resourceId, signal()).catch((e) => {
      console.error("quo-webhook: call lookup failed", event.resourceId, errText(e));
      lookupFailed = true;
      return null;
    });
    // With no numbers of its own, the summary can only be placed through its call: have Quo send it again
    // rather than drop it. (A call Quo doesn't know, a 404, is final and ends as "no outside number" below.)
    if (lookupFailed && !event.numbers.length) return later("couldn't look up the call");
    if (!event.numbers.length && details) event.numbers = details.numbers;
    if (details?.at) event.at = new Date(details.at).toISOString();
    if (details?.durationSec != null) event.durationSec = details.durationSec;
  }

  const live = config.mode === "live" && liveFor(config.liveUsers, event.userId, teammate);
  const mode = event.kind === "summary" ? "summary" : live ? "live" : "shadow";

  let begin: string;
  try {
    const { data, error } = await sb.rpc("quo_event_begin", {
      p_secret: secret,
      p_event: {
        eventId: event.eventId, type: event.type, resourceId: event.resourceId, at: event.at, direction: event.direction,
        numbers: event.numbers, inboxId: event.inboxId, userId: event.userId, teammate, status: event.status,
        answered: event.answered, durationSec: event.durationSec, mode,
      },
    });
    if (error) throw error;
    begin = String(data);
  } catch (e) {
    console.error("quo-webhook: could not record the event", event.eventId, errText(e));
    return later("database unavailable");
  }
  if (begin === "duplicate") return ok("already handled");
  if (begin === "busy") return later("another delivery is handling this event");
  if (begin !== "new" && begin !== "retry") {
    console.error("quo-webhook: quo_event_begin answered", begin, event.eventId);
    return begin === "invalid" ? ok("unreadable; ignored") : later(`not recorded (${begin})`);
  }

  const finish = async (state: string, ids: { property?: string[]; note?: string[]; date?: string[] } = {}, error?: string) => {
    const { error: e } = await sb.rpc("quo_event_finish", {
      p_secret: secret, p_event_id: event.eventId, p_state: state,
      p_property_ids: ids.property ?? [], p_note_ids: ids.note ?? [], p_date_ids: ids.date ?? [], p_error: error ?? null,
    });
    if (e) console.error("quo-webhook: could not record the outcome", event.eventId, state, e.message);
  };

  if (event.kind === "call" && callOutcome(event) === "other") {
    await finish("ignored", {}, `call status ${event.status ?? "unknown"}`);
    return ok("call didn't connect");
  }
  if (event.kind === "summary" && !event.summary.length) {
    await finish("ignored", {}, `summary ${event.status ?? "not completed"}`);
    return ok("no summary text");
  }
  if (!event.numbers.length) {
    await finish("ignored", {}, "no outside number");
    return ok("no outside number");
  }

  let matches: Match[];
  try {
    const { data, error } = await sb.rpc("quo_match", { p_secret: secret, p_numbers: event.numbers });
    if (error) throw error;
    matches = Array.isArray(data) ? (data as Match[]) : [];
  } catch (e) {
    console.error("quo-webhook: match failed", event.eventId, errText(e));
    await finish("retry", {}, `match: ${errText(e)}`);
    return later("database unavailable");
  }
  const propertyIds = [...new Set(matches.map((m) => m.id))];
  if (!propertyIds.length) {
    await finish("unmatched");
    return ok("number not on any property");
  }

  if (event.kind === "summary") return saveSummary(event, matches, propertyIds, teammate, tz, finish);

  const day = localDay(event.at, tz);
  const dateIds = movesDate(event) ? dateTargets(matches, day) : [];
  const slot = noteSlot(event);
  const noteIds = slot ? noteTargets(matches) : [];
  const ids = { property: propertyIds, note: noteIds, date: dateIds };
  if (!live) {
    await finish("shadow", ids);
    return ok(`shadow: would move ${dateIds.length} dates and post ${noteIds.length} notes`);
  }

  const problems: string[] = [];
  // 1. Last Contact Date, 25 items per Monday request, then the map's mirror.
  for (let i = 0; i < dateIds.length; i += 25) {
    if (left() < 1_500) {
      problems.push("out of time before every date"); // the retry sets them all again, which is harmless
      break;
    }
    const chunk = dateIds.slice(i, i + 25);
    try {
      await setDates(LAST_CONTACT_COL, chunk.map((id) => ({ id, day })), { signal: signal() });
      const { error } = await sb.rpc("quo_mirror_last_contact", { p_secret: secret, p_ids: chunk, p_day: day });
      if (error) console.error("quo-webhook: mirror failed; the Monday webhook will bring the date", event.eventId, error.message);
    } catch (e) {
      problems.push(`dates: ${errText(e)}`);
    }
  }

  // 2. One note per property, day and slot.
  for (const id of noteIds) {
    if (left() < 1_200) {
      problems.push("out of time before every note");
      break;
    }
    const m = matches.find((x) => x.id === id) as Match;
    const html = noteHtml(event, { teammate, owner: m.owner, number: m.number, tz });
    if (!html || !slot) continue;
    const { data: claimed, error } = await sb.rpc("quo_note_claim", { p_secret: secret, p_property_item_id: id, p_day: day, p_slot: slot, p_event_id: event.eventId });
    if (error) {
      problems.push(`note claim: ${error.message}`);
      continue;
    }
    if (claimed !== true) continue; // already noted today (or another delivery is posting it)
    let updateId: string | null = null;
    try {
      updateId = await createUpdate(id, html, { signal: signal() });
    } catch (e) {
      problems.push(`note ${id}: ${errText(e)}`);
    }
    const { error: doneError } = await sb.rpc("quo_note_done", {
      p_secret: secret, p_property_item_id: id, p_day: day, p_slot: slot, p_event_id: event.eventId, p_update_id: updateId,
    });
    if (doneError) console.error("quo-webhook: could not record the note", event.eventId, id, doneError.message);
  }

  if (problems.length) {
    console.error("quo-webhook: partly done; Quo will retry", event.eventId, problems.join(" | "));
    await finish("retry", ids, problems.join(" | "));
    return later("partly done");
  }
  await finish("done", ids);
  return ok(`moved ${dateIds.length} dates, noted ${noteIds.length} properties`);
}

async function saveSummary(
  event: QuoEvent,
  matches: Match[],
  propertyIds: string[],
  teammate: string | null,
  tz: string,
  finish: (state: string, ids?: { property?: string[] }, error?: string) => Promise<void>,
) {
  const text = [...event.summary, ...event.nextSteps].join(" ");
  const targets = summaryTargets(matches, text);
  const { error } = await supabase().rpc("quo_summary_save", {
    p_secret: editSecret(),
    p_row: {
      callId: event.resourceId, eventId: event.eventId, at: event.at, teammate, durationSec: event.durationSec,
      numbers: event.numbers, propertyIds: targets, propertyCount: propertyIds.length,
      summary: event.summary, nextSteps: event.nextSteps, facts: readFacts(event.summary, localDay(event.at, tz)),
    },
  });
  if (error) {
    console.error("quo-webhook: could not save the summary", event.eventId, error.message);
    await finish("retry", { property: targets }, `summary: ${error.message}`);
    return later("database unavailable");
  }
  await finish("done", { property: targets });
  return ok(`summary saved on ${targets.length} properties`);
}
