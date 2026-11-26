import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURE_KEYS, NO_FEATURES, parseFeatures } from "../../lib/feature-keys.ts";

const ALL = { secret: true, chat: true, phone: true };
const on = (raw: string | null | undefined, needs = ALL) =>
  Object.entries(parseFeatures(raw, needs)).filter(([, v]) => v).map(([k]) => k).sort();

test("every feature is off by default", () => {
  assert.deepEqual(parseFeatures(undefined, ALL), NO_FEATURES);
  assert.deepEqual(parseFeatures(null, ALL), NO_FEATURES);
  assert.deepEqual(parseFeatures("", ALL), NO_FEATURES);
  assert.deepEqual(parseFeatures(" , ,", ALL), NO_FEATURES);
  assert.deepEqual(Object.keys(NO_FEATURES).sort(), [...FEATURE_KEYS].sort());
  assert.ok(Object.values(NO_FEATURES).every((v) => v === false));
});

test("a comma list turns on only the named features; case, spaces and unknown names don't matter", () => {
  assert.deepEqual(on("outside"), ["outside"]);
  assert.deepEqual(on(" Outside , BESTMATCH,nonsense,, mine "), ["bestMatch", "mine", "outside"]);
  assert.deepEqual(on("bestmatch,addoutside,findphone"), ["addOutside", "bestMatch", "findPhone"]);
  assert.deepEqual(on("1"), []);
  assert.deepEqual(on("true"), []);
});

test("'all' names every feature", () => {
  assert.deepEqual(on("all"), [...FEATURE_KEYS].sort());
  assert.deepEqual(on("ALL, outside"), [...FEATURE_KEYS].sort());
});

test("chat and addOutside stay off without the webhook address and key", () => {
  assert.deepEqual(on("chat,addOutside,outside", { secret: true, chat: false, phone: true }), ["outside"]);
  assert.deepEqual(on("chat,addOutside", ALL), ["addOutside", "chat"]);
});

test("findPhone stays off without the lookup address", () => {
  assert.deepEqual(on("findPhone,templates", { secret: true, chat: true, phone: false }), ["templates"]);
});

test("without the database secret only 'mine' can be on", () => {
  assert.deepEqual(on("all", { secret: false, chat: true, phone: true }), ["mine"]);
});

test("the result is a fresh object each time and NO_FEATURES can't be changed", () => {
  const a = parseFeatures("outside", ALL);
  a.chat = true;
  assert.equal(parseFeatures("outside", ALL).chat, false);
  assert.throws(() => { (NO_FEATURES as Record<string, boolean>).outside = true; });
  assert.equal(NO_FEATURES.outside, false);
});
