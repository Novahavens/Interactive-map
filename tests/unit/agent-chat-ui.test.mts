import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COPY,
  MAX_CHARS,
  MAX_MESSAGES,
  askBody,
  askLabel,
  canUndo,
  chatReducer,
  claimLine,
  cleanInput,
  errorCopy,
  formatElapsed,
  initialChat,
  isListingId,
  joinSpeech,
  latestResultId,
  runningLine,
  runningPercent,
  suggestionsFor,
  summaryText,
} from "../../lib/agent-chat-ui.ts";
import { ASK, CLAIM_ID, HOME } from "../fixtures/map-agent.mjs";

test("formatElapsed: minutes and padded seconds, never negative", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(34_000), "0:34");
  assert.equal(formatElapsed(34_999), "0:34");
  assert.equal(formatElapsed(95_000), "1:35");
  assert.equal(formatElapsed(600_000), "10:00");
  assert.equal(formatElapsed(-5), "0:00");
  assert.equal(formatElapsed(NaN), "0:00");
});

test("runningLine: the spec's wording", () => {
  assert.equal(runningLine(34_000), "0:34 · usually under 90 seconds. You can keep using the map.");
});

test("runningPercent: grows with time and stops short of full", () => {
  assert.equal(runningPercent(0), 4);
  assert.equal(runningPercent(45_000), 50);
  assert.equal(runningPercent(90_000), 96);
  assert.equal(runningPercent(500_000), 96);
});

test("summaryText: homes and new homes, singular, nothing new, none", () => {
  assert.equal(summaryText({ homes: 12, newHomes: 4 }), "12 homes · 4 new");
  assert.equal(summaryText({ homes: 1, newHomes: 1 }), "1 home · 1 new");
  assert.equal(summaryText({ homes: 7, newHomes: 0 }), "7 homes");
  assert.equal(summaryText({ homes: 0, newHomes: 0 }), "0 homes");
  assert.equal(summaryText(null), "");
  assert.equal(summaryText(undefined), "");
});

test("claimLine: name and FRV; no FRV; no claim", () => {
  assert.equal(claimLine({ name: "Ramirez family", frv: 3200 }), "Ramirez family · FRV $3,200");
  assert.equal(claimLine({ name: "Ramirez family", frv: null }), "Ramirez family");
  assert.equal(claimLine({ name: "Ramirez family", frv: 0 }), "Ramirez family");
  assert.equal(claimLine(null), "No claim open");
});

test("suggestionsFor: three chips, and More like this one only with a selected home", () => {
  assert.deepEqual(suggestionsFor(null).map((s) => s.label), ["Within 10 miles", "Show unfurnished", "Cheaper"]);
  const db = suggestionsFor({ id: "9900000101", name: "1418 Juniper Ct" });
  assert.deepEqual(db.map((s) => s.label), ["Within 10 miles", "Show unfurnished", "Cheaper", "More like this one"]);
  assert.equal(db[3].text, "More like 1418 Juniper Ct");
  assert.equal(db[3].listingId, undefined, "a home from our database has no listing id to send");
  const outside = suggestionsFor({ id: HOME.zillowExact, name: "4100 Sample Ave" });
  assert.equal(outside[3].listingId, HOME.zillowExact);
  assert.equal(suggestionsFor({ id: HOME.zillowExact, name: "  " }).length, 3);
});

test("isListingId: uuids only", () => {
  assert.equal(isListingId(HOME.ffArea), true);
  assert.equal(isListingId("9900000101"), false);
  assert.equal(isListingId(""), false);
  assert.equal(isListingId(null), false);
});

test("cleanInput and joinSpeech: trimmed and capped at 500", () => {
  assert.equal(cleanInput("  under 3k \n"), "under 3k");
  assert.equal(cleanInput("   "), "");
  assert.equal(cleanInput("x".repeat(700)).length, MAX_CHARS);
  assert.equal(joinSpeech("", " within ten miles "), "within ten miles");
  assert.equal(joinSpeech("Cheaper, ", "and pets ok"), "Cheaper, and pets ok");
  assert.equal(joinSpeech("Cheaper", ""), "Cheaper");
  assert.equal(joinSpeech("a".repeat(499), "bcd").length, MAX_CHARS);
});

test("askBody: the exact request bodies", () => {
  assert.deepEqual(askBody({ action: "open" }), { action: "open" });
  assert.deepEqual(askBody({ action: "open" }, "  "), { action: "open" });
  assert.deepEqual(askBody({ action: "message", message: "under 3k" }, " Alex Example "), { action: "message", message: "under 3k", user: "Alex Example" });
  assert.deepEqual(askBody({ action: "reject", listingId: HOME.stretch, name: "5 Stretch Ct" }, null), { action: "reject", listingId: HOME.stretch });
  assert.deepEqual(askBody({ action: "more_like", listingId: HOME.zillowExact }, "Alex"), { action: "more_like", listingId: HOME.zillowExact, user: "Alex" });
  assert.deepEqual(askBody({ action: "undo" }, "Alex"), { action: "undo", user: "Alex" });
  assert.equal(askBody({ action: "message", message: "m".repeat(1500) }).message?.length, 1000);
  assert.equal(askBody({ action: "undo" }, "n".repeat(200)).user?.length, 80);
});

test("askLabel: what the person sees as their own line", () => {
  assert.equal(askLabel({ action: "open" }), null);
  assert.equal(askLabel({ action: "message", message: "Cheaper" }), "Cheaper");
  assert.equal(askLabel({ action: "undo" }), "Undo");
  assert.equal(askLabel({ action: "more_like", listingId: HOME.zillowExact, name: "4100 Sample Ave" }), "More like 4100 Sample Ave");
  assert.equal(askLabel({ action: "reject", listingId: HOME.stretch, name: "5 Stretch Ct" }), "Not 5 Stretch Ct");
  assert.equal(askLabel({ action: "reject", listingId: HOME.stretch }), "Not this one");
});

test("errorCopy: the spec's line, and a separate one for the rate limit", () => {
  assert.equal(errorCopy(502), "The search didn't finish. Nothing changed on the map.");
  assert.equal(errorCopy(0), COPY.error);
  assert.equal(errorCopy(429), "Too many messages. Try again in a few minutes.");
});

test("reducer: open, then a message, gives agent / user / agent with result cards", () => {
  let s = initialChat(CLAIM_ID);
  s = chatReducer(s, { type: "sent", ask: { action: "open" }, at: 1_000 });
  assert.equal(s.messages.length, 0, "open shows no line of the person's own");
  assert.deepEqual(s.status, { kind: "running", startedAt: 1_000 });
  assert.equal(s.opened, true);

  s = chatReducer(s, { type: "answered", response: ASK.open, at: 2_000, seen: true });
  assert.deepEqual(s.status, { kind: "idle" });
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].role, "agent");
  assert.equal(s.messages[0].text, "Found 7 homes that fit.");
  assert.deepEqual(s.messages[0].result, { homes: 7, newHomes: 2 });
  assert.deepEqual(s.summary, { homes: 7, newHomes: 2 });
  assert.equal(s.versionNo, 1);
  assert.equal(canUndo(s), false, "nothing to go back to on the first version");
  assert.equal(s.unseen, 0);

  s = chatReducer(s, { type: "sent", ask: { action: "message", message: "under 3k and a bit wider" }, at: 3_000 });
  assert.equal(s.messages[1].role, "user");
  assert.equal(s.messages[1].text, "under 3k and a bit wider");
  assert.equal(canUndo(s), false, "never while a search runs");
  s = chatReducer(s, { type: "answered", response: ASK.message, at: 4_000, seen: true });
  assert.equal(s.messages.length, 3);
  assert.equal(s.versionNo, 2);
  assert.equal(canUndo(s), true);
  assert.equal(latestResultId(s.messages), s.messages[2].id);
  assert.equal(new Set(s.messages.map((m) => m.id)).size, 3, "ids are unique");
  assert.equal(s.messages[2].at, new Date(4_000).toISOString());
});

test("reducer: an answer that lands with the window closed sets the badge; opening clears it", () => {
  let s = chatReducer(initialChat(CLAIM_ID), { type: "sent", ask: { action: "message", message: "Cheaper" }, at: 1 });
  s = chatReducer(s, { type: "answered", response: ASK.message, at: 2, seen: false });
  assert.equal(s.unseen, 3);
  s = chatReducer(s, { type: "seen" });
  assert.equal(s.unseen, 0);
  assert.equal(chatReducer(s, { type: "seen" }), s, "no change, same object");
});

test("reducer: an answer without a summary keeps the last one and shows no card", () => {
  let s = chatReducer(initialChat(CLAIM_ID), { type: "answered", response: ASK.open, at: 1, seen: true });
  s = chatReducer(s, { type: "sent", ask: { action: "undo" }, at: 2 });
  assert.equal(s.messages.at(-1)?.text, "Undo");
  s = chatReducer(s, { type: "answered", response: ASK.nothingToUndo, at: 3, seen: true });
  assert.equal(s.messages.at(-1)?.text, "There is no earlier search to go back to.");
  assert.equal(s.messages.at(-1)?.result, null);
  assert.deepEqual(s.summary, { homes: 7, newHomes: 2 });
  assert.equal(latestResultId(s.messages), s.messages[0].id);
});

test("reducer: the agent switched off (ok:false) is shown, with no card and no summary", () => {
  let s = chatReducer(initialChat(CLAIM_ID), { type: "sent", ask: { action: "open" }, at: 1 });
  s = chatReducer(s, { type: "answered", response: ASK.off, at: 2, seen: true });
  assert.equal(s.messages[0].text, "The agent is switched off.");
  assert.equal(s.messages[0].result, null);
  assert.equal(s.summary, null);
  assert.equal(latestResultId(s.messages), null);
});

test("reducer: failure keeps the messages and what to retry; a failed open may be sent again", () => {
  let s = chatReducer(initialChat(CLAIM_ID), { type: "sent", ask: { action: "open" }, at: 1 });
  s = chatReducer(s, { type: "failed", message: COPY.error });
  assert.deepEqual(s.status, { kind: "error", message: COPY.error });
  assert.equal(s.opened, false);
  assert.deepEqual(s.last, { action: "open" });

  s = chatReducer(s, { type: "sent", ask: { action: "message", message: "Cheaper" }, at: 2 });
  s = chatReducer(s, { type: "failed", message: COPY.error });
  assert.equal(s.messages.length, 1);
  assert.deepEqual(s.last, { action: "message", message: "Cheaper" });
  s = chatReducer(s, { type: "sent", ask: { action: "message", message: "Cheaper" }, at: 3, again: true });
  assert.equal(s.messages.length, 1, "Try again does not repeat the person's line");
  assert.equal(s.status.kind, "running");
});

test("reducer: Stop adds the spec's line and goes idle; it does nothing when no search runs", () => {
  let s = chatReducer(initialChat(CLAIM_ID), { type: "sent", ask: { action: "message", message: "Cheaper" }, at: 1 });
  s = chatReducer(s, { type: "stopped", at: 2 });
  assert.deepEqual(s.status, { kind: "idle" });
  assert.equal(s.messages.at(-1)?.text, "Search stopped. Nothing changed on the map.");
  assert.equal(s.messages.at(-1)?.note, true);
  assert.equal(chatReducer(s, { type: "stopped", at: 3 }), s);
});

test("reducer: another claim starts clean; the same claim changes nothing", () => {
  let s = chatReducer(initialChat(CLAIM_ID), { type: "answered", response: ASK.message, at: 1, seen: false });
  assert.equal(chatReducer(s, { type: "reset", claimId: CLAIM_ID }), s);
  s = chatReducer(s, { type: "reset", claimId: "9900000002" });
  assert.deepEqual(s, initialChat("9900000002"));
  assert.deepEqual(chatReducer(s, { type: "reset", claimId: null }), initialChat(null));
});

test("reducer: the log is capped", () => {
  let s = initialChat(CLAIM_ID);
  for (let i = 0; i < MAX_MESSAGES + 20; i++) s = chatReducer(s, { type: "answered", response: ASK.answer, at: i, seen: true });
  assert.equal(s.messages.length, MAX_MESSAGES);
  assert.equal(s.messages.at(-1)?.id, `a${MAX_MESSAGES + 20}`);
});
