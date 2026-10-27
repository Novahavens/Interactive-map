// npm run test:unit  (Node 22 strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { callLength, isAnswered, preview, summarise, toE164List, type QuoCall, type QuoMessage } from "../../lib/contact.ts";

const call = (o: Partial<QuoCall>): QuoCall => ({
  createdAt: "2026-10-20T15:00:00Z", direction: "outgoing", status: "completed", duration: 0, answeredAt: null, answeredBy: null, userId: null, ...o,
});
const msg = (o: Partial<QuoMessage>): QuoMessage => ({
  createdAt: "2026-10-20T15:00:00Z", direction: "outgoing", text: "Hi", hasMedia: false, userId: null, ...o,
});

test("toE164List reads the formats on the property board", () => {
  assert.deepEqual(toE164List("(918) 555-0100"), ["+19185550100"]);
  assert.deepEqual(toE164List("918.555.0100"), ["+19185550100"]);
  assert.deepEqual(toE164List("+1 918 555 0100"), ["+19185550100"]);
  assert.deepEqual(toE164List("19185550100"), ["+19185550100"]);
  assert.deepEqual(toE164List("918-555-0100 / 918-555-0200"), ["+19185550100", "+19185550200"]);
  assert.deepEqual(toE164List("918-555-0100 or 918-555-0200"), ["+19185550100", "+19185550200"]);
  assert.deepEqual(toE164List("918-555-0100 ext 22"), ["+19185550100"]);
  assert.deepEqual(toE164List("+44 20 7946 0958"), ["+442079460958"]);
  assert.deepEqual(toE164List("call the office"), []);
  assert.deepEqual(toE164List("555-0100"), []);
  assert.deepEqual(toE164List(null), []);
});

test("toE164List never invents a US number out of other digits", () => {
  assert.deepEqual(toE164List("+49 1512 3456789"), ["+4915123456789"], "German mobile");
  assert.deepEqual(toE164List("+44 2079460958"), ["+442079460958"], "UK, no spaces");
  assert.deepEqual(toE164List("91855501002"), [], "11 digits not starting with 1");
  assert.deepEqual(toE164List("000-000-0000"), [], "area code can't start with 0");
  assert.deepEqual(toE164List("918-155-0100"), [], "exchange can't start with 1");
  assert.deepEqual(toE164List("+44 20 7946 0958 918-555-0100"), ["+19185550100"], "an over-long run is not guessed at; the US number survives");
});

test("isAnswered follows Quo's call fields", () => {
  assert.equal(isAnswered(call({ direction: "incoming", status: "completed", duration: 40 })), false, "voicemail: incoming, nobody answered");
  assert.equal(isAnswered(call({ direction: "incoming", status: "completed", duration: 40, answeredBy: "US1" })), true);
  assert.equal(isAnswered(call({ status: "answered" })), true);
  assert.equal(isAnswered(call({ status: "completed", duration: 25 })), true, "outgoing call that ran");
  assert.equal(isAnswered(call({ status: "no-answer" })), false);
  assert.equal(isAnswered(call({ status: "forwarded" })), true);
});

test("summarise counts calls, missed calls and texts across numbers", () => {
  const d = summarise(
    [
      call({ createdAt: "2026-10-20T15:00:00Z", status: "completed", duration: 190, answeredAt: "2026-10-20T15:00:05Z", userId: "US1" }),
      call({ createdAt: "2026-10-22T15:00:00Z", status: "no-answer" }),
      call({ createdAt: "2026-10-21T15:00:00Z", direction: "incoming", status: "missed" }),
      call({ createdAt: "2026-10-23T15:00:00Z", status: "ringing" }),
      call({ createdAt: "2026-10-23T16:00:00Z", status: "failed" }),
      call({ createdAt: "2026-10-23T17:00:00Z", status: "canceled" }),
    ],
    [
      msg({ createdAt: "2026-10-19T10:00:00Z" }),
      msg({ createdAt: "2026-10-19T11:00:00Z" }),
      msg({ createdAt: "2026-10-24T09:00:00Z", direction: "incoming", text: "  Yes it's\n available " }),
    ],
    { US1: "William" },
  );
  assert.equal(d.calls.total, 3, "ringing, failed and cancelled calls aren't contact");
  assert.equal(d.calls.outgoing, 2);
  assert.equal(d.calls.incoming, 1);
  assert.equal(d.calls.missed, 2);
  assert.deepEqual(d.calls.last, { at: "2026-10-22T15:00:00Z", direction: "outgoing", by: null, answered: false, durationSec: 0 });
  assert.equal(d.texts.sent, 2);
  assert.equal(d.texts.received, 1);
  assert.deepEqual(d.texts.last, { at: "2026-10-24T09:00:00Z", direction: "incoming", by: null, preview: "Yes it's available" });
  assert.equal(d.lastContactAt, "2026-10-24T09:00:00Z");
  assert.equal(d.calls.truncated, false);
  assert.equal(d.texts.truncated, false);
});

test("the last call names the teammate", () => {
  const d = summarise([call({ status: "completed", duration: 61, answeredAt: "x", userId: "US1" })], [], { US1: "Virginia" });
  assert.equal(d.calls.last?.by, "Virginia");
  assert.equal(d.calls.last?.answered, true);
  assert.equal(d.calls.last?.durationSec, 61);
});

test("truncation is tracked per kind", () => {
  const d = summarise([], [msg({})], {}, { calls: false, texts: true });
  assert.equal(d.calls.truncated, false);
  assert.equal(d.texts.truncated, true);
});

test("no history is a digest of zeros, not null", () => {
  const d = summarise([], []);
  assert.equal(d.calls.total, 0);
  assert.equal(d.calls.last, null);
  assert.equal(d.texts.last, null);
  assert.equal(d.lastContactAt, null);
});

test("preview trims, shortens and names a photo", () => {
  assert.equal(preview(msg({ text: "a".repeat(200) }))?.length, 90);
  assert.ok(preview(msg({ text: "a".repeat(200) }))?.endsWith("…"));
  assert.equal(preview(msg({ text: "", hasMedia: true })), "(photo)");
  assert.equal(preview(msg({ text: null })), null);
});

test("callLength", () => {
  assert.equal(callLength(45), "45 s");
  assert.equal(callLength(190), "3 min");
  assert.equal(callLength(3900), "1 h 5 min");
  assert.equal(callLength(3600), "1 h");
});
