import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHONE_START,
  TEMPLATE_MENU,
  canRetry,
  checkedLine,
  confidenceWords,
  dayLabel,
  foundLine,
  menuText,
  outreachLine,
  phoneReducer,
  sameDay,
  sourceWords,
  stateOf,
  type PhoneState,
} from "../../lib/phone-lookup-ui.ts";
import { templateText } from "../../lib/text-templates.ts";
import { OUTREACH, PHONE } from "../fixtures/map-agent.mjs";

const TZ = "America/Chicago";
const FULL = { to: "Jane Doe", address: "12 Elm St, Tulsa, OK 74133, USA", from: "Will", beds: 3, city: "Tulsa", moveIn: "2026-12-01" };

test("dayLabel: short month and day in the given zone, empty for junk", () => {
  assert.equal(dayLabel("2026-11-26T15:10:00.000Z", TZ), "Nov 26");
  assert.equal(dayLabel("2026-11-26T03:00:00.000Z", TZ), "Nov 25"); // still the evening before in Chicago
  assert.equal(dayLabel("2026-11-26T03:00:00.000Z", "UTC"), "Nov 26");
  assert.equal(dayLabel(null), "");
  assert.equal(dayLabel("not a date"), "");
});

test("sameDay and canRetry: Try again comes back the day after", () => {
  const now = new Date("2026-11-26T20:00:00.000Z");
  assert.equal(sameDay("2026-11-26T15:10:00.000Z", now, TZ), true);
  assert.equal(canRetry("2026-11-26T15:10:00.000Z", now, TZ), false);
  assert.equal(canRetry("2026-11-25T15:10:00.000Z", now, TZ), true);
  assert.equal(canRetry(null, now, TZ), true);
  assert.equal(canRetry("junk", now, TZ), true);
});

test("confidence words", () => {
  assert.equal(confidenceWords("high"), "likely right (high)");
  assert.equal(confidenceWords("medium"), "may be right (medium)");
  assert.equal(confidenceWords("low"), "a guess: check before you call (low)");
  assert.equal(confidenceWords(null), "");
});

test("source words and the found line", () => {
  assert.equal(sourceWords("lookup"), "Public records");
  assert.equal(sourceWords(null), "Public records");
  assert.equal(sourceWords("county_assessor"), "County assessor");
  assert.equal(foundLine(PHONE.found), "Public records · likely right (high)");
  assert.equal(foundLine(PHONE.foundLow), "Public records · a guess: check before you call (low)");
  assert.equal(foundLine({ source: "lookup", confidence: null }), "Public records");
});

test("checked line carries the date when there is one", () => {
  assert.equal(checkedLine("2026-11-26T15:10:00.000Z", TZ), "Checked Nov 26. Try the listing page, or text through the listing site.");
  assert.equal(checkedLine(null), "Try the listing page, or text through the listing site.");
});

test("stateOf reads the route's answers", () => {
  assert.deepEqual(stateOf(PHONE.off), { kind: "off" });
  assert.deepEqual(stateOf(PHONE.idle), { kind: "idle" });
  assert.deepEqual(stateOf(PHONE.notFound), { kind: "not_found", lookedUpAt: "2026-11-26T15:10:00.000Z" });
  assert.deepEqual(stateOf(PHONE.found), { kind: "found", phone: "+19185550142", source: "lookup", confidence: "high", lookedUpAt: "2026-11-26T15:10:00.000Z" });
  assert.deepEqual(stateOf({ ...PHONE.found, phone: " " }), { kind: "not_found", lookedUpAt: "2026-11-26T15:10:00.000Z" }); // found without a number is a miss
  assert.deepEqual(stateOf(null), { kind: "idle" });
});

test("reducer: load, search, answer, fail, dismiss", () => {
  let s: PhoneState = PHONE_START;
  assert.equal(s.kind, "loading");
  assert.equal(phoneReducer(s, { type: "search" }).kind, "loading"); // not before the first read
  assert.equal(phoneReducer(s, { type: "load_failed" }).kind, "idle");
  s = phoneReducer(s, { type: "answer", lookup: PHONE.idle });
  assert.equal(s.kind, "idle");
  s = phoneReducer(s, { type: "search" });
  assert.equal(s.kind, "searching");
  assert.equal(phoneReducer(s, { type: "search" }), s); // no double lookup
  assert.deepEqual(phoneReducer(s, { type: "failed", status: 502 }), { kind: "error", busy: false });
  assert.deepEqual(phoneReducer(s, { type: "failed", status: 429 }), { kind: "error", busy: true });
  assert.equal(phoneReducer({ kind: "error", busy: false }, { type: "search" }).kind, "searching");
  const found = phoneReducer(s, { type: "answer", lookup: PHONE.found });
  assert.equal(found.kind, "found");
  assert.equal(phoneReducer(found, { type: "search" }), found);
  assert.deepEqual(phoneReducer(found, { type: "dismiss" }), { kind: "idle" });
  assert.equal(phoneReducer(s, { type: "answer", lookup: PHONE.notFound }).kind, "not_found");
  assert.equal(phoneReducer({ kind: "not_found", lookedUpAt: null }, { type: "search" }).kind, "searching");
  assert.equal(phoneReducer(s, { type: "answer", lookup: PHONE.off }).kind, "off"); // the provider is not set up
  assert.equal(phoneReducer({ kind: "off" }, { type: "search" }).kind, "off");
  assert.deepEqual(phoneReducer({ kind: "idle" }, { type: "dismiss" }), { kind: "idle" });
  assert.deepEqual(phoneReducer({ kind: "idle" }, { type: "failed", status: 502 }), { kind: "idle" });
});

test("menu: the spec's four entries in order", () => {
  assert.deepEqual(TEMPLATE_MENU.map((t) => t.key), ["availability", "address", "rate", "blank"]);
  assert.deepEqual(TEMPLATE_MENU.map((t) => t.label), ["Ask availability", "Ask for the address", "Confirm the rate", "Blank text"]);
});

test("menuText: the shared templates, the rent in Confirm the rate, nothing for Blank", () => {
  assert.equal(menuText("availability", FULL), templateText("availability", FULL));
  assert.equal(menuText("address", FULL), templateText("address", FULL));
  assert.equal(menuText("rate", FULL), templateText("rate", FULL)); // no rent known: ask what it is
  assert.equal(menuText("rate", { ...FULL, rent: 0 }), templateText("rate", FULL));
  assert.equal(
    menuText("rate", { ...FULL, rent: 3350 }),
    "Hi Jane, it's Will from Nova Havens about 12 Elm St. Can you confirm $3,350 a month for a stay starting Dec 1, and what the deposit is? ",
  );
  assert.equal(menuText("rate", { to: "Acme Properties LLC", rent: 2400.4 }), "Hi, this is Nova Havens. Can you confirm $2,400 a month, and what the deposit is? ");
  assert.equal(menuText("blank", FULL), "");
});

test("outreach line", () => {
  assert.deepEqual(outreachLine(OUTREACH.sent.outreach, TZ), { kind: "asked", text: "Asked Nov 25 · no reply yet" });
  assert.deepEqual(outreachLine(OUTREACH.replied.outreach, TZ), { kind: "replied", text: "Replied Nov 25" });
  assert.equal(outreachLine(OUTREACH.none.outreach), null);
  assert.equal(outreachLine({ status: "queued", channel: null, sentAt: null, sentBy: null, repliedAt: null }), null);
  assert.deepEqual(outreachLine({ status: "address_found", channel: null, sentAt: "2026-11-24T18:30:00.000Z", sentBy: null, repliedAt: null }, TZ), { kind: "replied", text: "Replied" });
  assert.deepEqual(outreachLine({ status: "no_answer", channel: null, sentAt: "2026-11-24T18:30:00.000Z", sentBy: null, repliedAt: null }, TZ), { kind: "asked", text: "Asked Nov 24 · no reply yet" });
});
