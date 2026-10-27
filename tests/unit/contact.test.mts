// node --test tests/unit  (Node 22 strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { callLength, preview, summarise, toE164List, type QuoCall, type QuoMessage } from "../../lib/contact.ts";

const call = (o: Partial<QuoCall>): QuoCall => ({
  createdAt: "2026-10-20T15:00:00Z", direction: "outgoing", status: "completed", duration: 0, answeredAt: null, userId: null, ...o,
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
  assert.deepEqual(toE164List("918-555-0100 ext 22"), ["+19185550100"]);
  assert.deepEqual(toE164List("+44 20 7946 0958"), ["+442079460958"]);
  assert.deepEqual(toE164List("call the office"), []);
  assert.deepEqual(toE164List("555-0100"), []);
  assert.deepEqual(toE164List(null), []);
});

test("summarise counts calls, missed calls and texts across numbers", () => {
  const d = summarise(
    [
      call({ createdAt: "2026-10-20T15:00:00Z", status: "completed", duration: 190, answeredAt: "2026-10-20T15:00:05Z", userId: "US1" }),
      call({ createdAt: "2026-10-22T15:00:00Z", status: "no-answer" }),
      call({ createdAt: "2026-10-21T15:00:00Z", direction: "incoming", status: "missed" }),
      call({ createdAt: "2026-10-23T15:00:00Z", status: "ringing" }),
    ],
    [
      msg({ createdAt: "2026-10-19T10:00:00Z" }),
      msg({ createdAt: "2026-10-19T11:00:00Z" }),
      msg({ createdAt: "2026-10-24T09:00:00Z", direction: "incoming", text: "  Yes it's\n available " }),
    ],
    { US1: "William" },
  );
  assert.equal(d.calls.total, 3, "a call still ringing is not counted");
  assert.equal(d.calls.outgoing, 2);
  assert.equal(d.calls.incoming, 1);
  assert.equal(d.calls.missed, 2);
  assert.deepEqual(d.calls.last, { at: "2026-10-22T15:00:00Z", direction: "outgoing", by: null, answered: false, durationSec: 0 });
  assert.equal(d.texts.sent, 2);
  assert.equal(d.texts.received, 1);
  assert.deepEqual(d.texts.last, { at: "2026-10-24T09:00:00Z", direction: "incoming", by: null, preview: "Yes it's available" });
  assert.equal(d.lastContactAt, "2026-10-24T09:00:00Z");
  assert.equal(d.truncated, false);
});

test("the last call names the teammate", () => {
  const d = summarise([call({ status: "completed", duration: 61, answeredAt: "x", userId: "US1" })], [], { US1: "Virginia" });
  assert.equal(d.calls.last?.by, "Virginia");
  assert.equal(d.calls.last?.answered, true);
  assert.equal(d.calls.last?.durationSec, 61);
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
