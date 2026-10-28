import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callOutcome, dateTargets, displayPhone, lastLoggable, liveFor, localDay, movesDate, namedInText, noteHtml, noteSlot,
  noteTargets, parseEvent, summaryTargets, type Match, type QuoEvent,
} from "../../lib/quo-events.ts";

// Payload shapes from https://www.quo.com/docs/2026-03-30/webhooks-event-payloads (fictional values).
const callContext = (external: string[] = ["+19185550100"], resolution = "available") => ({
  orgId: "OR1", phoneNumberId: "PN1", conversationId: "CN1", phoneNumberType: "shared", userId: "US1",
  contacts: { ids: [], lookupStatus: "none" },
  participants: { workspace: ["+19185559999"], external, resolution },
});
const call = (resource: Record<string, unknown>, context = callContext()) => ({
  id: "EV1", apiVersion: "2026-03-30", createdAt: "2026-10-27T19:15:00.000Z", type: "call.completed",
  data: {
    resource: { id: "ACcall1", direction: "outgoing", status: "answered", createdAt: "2026-10-27T19:14:00.000Z", answeredAt: "2026-10-27T19:14:05.000Z", duration: 185, hasVoicemail: false, ...resource },
    context, links: { quo: null },
  },
});
const text = (type: "message.received" | "message.delivered", ctx: Record<string, unknown> = {}) => ({
  id: "EV2", apiVersion: "2026-03-30", createdAt: "2026-10-27T19:20:00.000Z", type,
  data: {
    resource: { id: "AMmsg1", direction: type === "message.received" ? "incoming" : "outgoing", text: "secret words", media: [], status: "received", createdAt: "2026-10-27T19:20:00.000Z" },
    context: {
      orgId: "OR1", phoneNumberId: "PN1", conversationId: "CN1", userId: "US1", contacts: { ids: [], lookupStatus: "none" },
      senderIdentifier: type === "message.received" ? "+19185550100" : "+19185559999",
      recipientIdentifiers: type === "message.received" ? ["+19185559999"] : ["+19185550100"],
      ...ctx,
    },
    links: { quo: null },
  },
});
const ev = (body: unknown): QuoEvent => {
  const p = parseEvent(body);
  assert.equal(p.ok, true, JSON.stringify(p));
  return (p as { ok: true; event: QuoEvent }).event;
};

test("calls: the other party, how long, answered or not", () => {
  const e = ev(call({}));
  assert.equal(e.kind, "call");
  assert.equal(e.resourceId, "ACcall1");
  assert.deepEqual(e.numbers, ["+19185550100"]);
  assert.equal(e.durationSec, 185);
  assert.equal(e.answered, true);
  assert.equal(e.at, "2026-10-27T19:14:00.000Z");
  assert.equal(ev(call({ status: "unanswered", answeredAt: null, duration: null })).answered, false);
  assert.equal(ev(call({ status: "forwarded", duration: 40 })).answered, true);
  // "unavailable" participants are unknown, not none.
  assert.deepEqual(ev(call({}, callContext(["+19185550100"], "unavailable"))).numbers, []);
});

test("texts: never keep the words; the other party is the sender or the recipient", () => {
  const inbound = ev(text("message.received"));
  assert.equal(inbound.kind, "text_in");
  assert.deepEqual(inbound.numbers, ["+19185550100"]);
  assert.equal(JSON.stringify(inbound).includes("secret words"), false);
  const outbound = ev(text("message.delivered"));
  assert.equal(outbound.kind, "text_out");
  assert.deepEqual(outbound.numbers, ["+19185550100"]);
  // An internal identifier that isn't a phone number is not an outside party.
  assert.deepEqual(ev(text("message.received", { senderIdentifier: "USabc" })).numbers, []);
});

test("summaries: sentences only once completed, the call id as the resource", () => {
  const body = {
    id: "EV3", createdAt: "2026-10-27T19:30:00.000Z", type: "call.summary.completed",
    data: { resource: { callId: "ACcall1", processingStatus: "completed", summary: ["Owner said rent is $2,400."], nextSteps: ["Send lease."], answeredByUserId: "US2", jobs: [] }, context: callContext() },
  };
  const e = ev(body);
  assert.equal(e.kind, "summary");
  assert.equal(e.resourceId, "ACcall1");
  assert.equal(e.userId, "US2");
  assert.deepEqual(e.summary, ["Owner said rent is $2,400."]);
  const pending = ev({ ...body, data: { ...body.data, resource: { ...body.data.resource, processingStatus: "in-progress", summary: null } } });
  assert.deepEqual(pending.summary, []);
});

test("other events are ignored, broken ones are invalid", () => {
  assert.deepEqual(parseEvent({ id: "EV9", type: "contact.updated", data: {} }), { ok: false, reason: "ignore" });
  assert.deepEqual(parseEvent({ id: "EV9", type: "call.completed", data: {} }), { ok: false, reason: "invalid" });
  assert.deepEqual(parseEvent(null), { ok: false, reason: "invalid" });
  assert.deepEqual(parseEvent({ type: "call.completed" }), { ok: false, reason: "invalid" });
});

test("what moves the date and what gets a note (decided 28 Oct)", () => {
  const answered = ev(call({}));
  const attempt = ev(call({ status: "unanswered", duration: null }));
  const missed = ev(call({ direction: "incoming", status: "abandoned", duration: null }));
  const ai = ev(call({ direction: "incoming", status: "ai-handled" }));
  const failed = ev(call({ status: "failed" }));
  assert.deepEqual([answered, attempt, missed, ai, failed].map(callOutcome), ["answered", "attempt", "missed", "ai", "other"]);
  assert.deepEqual([answered, attempt, missed, ai, failed].map(movesDate), [true, false, false, false, false]);
  assert.equal(movesDate(ev(text("message.received"))), true);
  assert.equal(movesDate(ev(text("message.delivered"))), true);
  assert.equal(noteSlot(answered), "call:ACcall1");
  assert.equal(noteSlot(attempt), "attempt");
  assert.equal(noteSlot(missed), "missed");
  assert.equal(noteSlot(failed), null);
  assert.equal(noteSlot(ev(text("message.received"))), "text_in");
});

const m = (id: string, over: Partial<Match> = {}): Match => ({ number: "+19185550100", id, owner: true, onClaim: false, lastContact: null, ...over });

test("smart pick: active-claim options, else up to five; dates on every property not already at that day", () => {
  assert.deepEqual(noteTargets([m("1")]), ["1"]);
  assert.deepEqual(noteTargets([m("1", { onClaim: true }), m("2"), m("3", { onClaim: true })]), ["1", "3"]);
  assert.deepEqual(noteTargets(["1", "2", "3", "4", "5", "6", "7"].map((id) => m(id))), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(noteTargets([m("1"), m("1", { number: "+19185550200" })]), ["1"]);
  assert.deepEqual(dateTargets([m("1", { lastContact: "2026-10-27" }), m("2", { lastContact: "2026-10-01" }), m("3")], "2026-10-27"), ["2", "3"]);
});

test("a summary that names a street goes to that property", () => {
  const ms = [m("1", { street: "4512 E Harvard Ave" }), m("2", { street: "12 Elm St" }), m("3", { street: "300 Oak Dr", onClaim: true }), m("4", { street: "77 W 41st St" })];
  assert.deepEqual(namedInText(ms, "The house on Elm Street is available Nov 1."), ["2"]);
  assert.deepEqual(namedInText(ms, "Discussed 4512 Harvard; rent 2400."), ["1"]);
  assert.deepEqual(namedInText(ms, "Talked about Harvard."), ["1"]);
  assert.deepEqual(namedInText(ms, "The oak tree needs trimming."), []);
  assert.deepEqual(namedInText(ms, "Moving on the 41st."), []);
  assert.deepEqual(summaryTargets(ms, "Nothing named here."), ["3"]);
});

test("the team's day, not UTC's", () => {
  assert.equal(localDay("2026-10-28T03:30:00Z"), "2026-10-27"); // 10:30 pm in Tulsa
  assert.equal(localDay("2026-10-28T15:00:00Z"), "2026-10-28");
  assert.equal(displayPhone("+19185550100"), "(918) 555-0100");
  assert.equal(displayPhone("+447700900123"), "+447700900123");
});

test("note wording: who did what, when, which number; never the text", () => {
  const o = { teammate: "Will", owner: true, number: "+19185550100" };
  assert.equal(noteHtml(ev(call({})), o), "📞 <b>Will called the owner</b> · 3 min<br>Oct 27, 2:14 PM · (918) 555-0100 · logged from Quo");
  assert.match(noteHtml(ev(call({ direction: "incoming" })), o) as string, /^📞 <b>The owner called<\/b> · Will answered · 3 min<br>/);
  assert.match(noteHtml(ev(call({ status: "unanswered", duration: null })), o) as string, /Will tried to call the owner<\/b> · no answer/);
  assert.match(noteHtml(ev(call({ direction: "incoming", status: "unanswered", duration: null, hasVoicemail: true })), o) as string, /The owner called<\/b> · missed · left a voicemail/);
  assert.match(noteHtml(ev(text("message.delivered")), { ...o, teammate: null, owner: false }) as string, /^💬 <b>We texted the landlord \/ PM<\/b>/);
  const inbound = noteHtml(ev(text("message.received")), o) as string;
  assert.match(inbound, /^💬 <b>The owner texted<\/b>/);
  assert.equal(inbound.includes("secret"), false);
  assert.equal(noteHtml(ev(call({ status: "failed" })), o), null);
  assert.match(noteHtml(ev(call({})), { ...o, teammate: "<b>x</b>" }) as string, /&lt;b&gt;x&lt;\/b&gt; called/);
});

test("pilot: QUO_LIVE_USERS by id or first name; empty means everyone", () => {
  assert.equal(liveFor("", "US1", "Will"), true);
  assert.equal(liveFor("will, US9", "US1", "Will"), true);
  assert.equal(liveFor("US1", "US1", null), true);
  assert.equal(liveFor("louise", "US1", "Will"), false);
});

test("backfill: the newest answered call or text, with who", () => {
  const calls = [
    { createdAt: "2026-10-20T10:00:00Z", direction: "outgoing" as const, status: "completed", duration: 120, answeredAt: "2026-10-20T10:00:05Z", answeredBy: null, userId: "US1" },
    { createdAt: "2026-10-25T10:00:00Z", direction: "outgoing" as const, status: "no-answer", duration: 0, answeredAt: null, answeredBy: null, userId: "US1" },
  ];
  const messages = [{ createdAt: "2026-10-22T10:00:00Z", direction: "incoming" as const, text: null, hasMedia: false, userId: null }];
  const answered = (c: (typeof calls)[number]) => !!c.answeredAt;
  assert.deepEqual(lastLoggable(calls, messages, answered, { US1: "Will" }), { at: "2026-10-22T10:00:00Z", kind: "text_in", teammate: null });
  assert.deepEqual(lastLoggable(calls, [], answered, { US1: "Will" }), { at: "2026-10-20T10:00:00Z", kind: "call", teammate: "Will" });
  assert.equal(lastLoggable([calls[1]], [], answered), null);
});
