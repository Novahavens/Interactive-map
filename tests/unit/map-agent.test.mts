import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ID_RE, OUTSIDE_OFF, PHONE_NONE, PHONE_OFF, RateLimiter, UUID_RE, cleanSay, cleanText, clientIp, parseAsk, readAddAnswer,
  readPhoneAnswer, refused, toAskResponse, toClaimContext, toNearsiteClaims, toOutreach, toOutsideResponse, toPhoneLookup,
  toScoresResponse, toSubmitStatusResponse, upstreamFor,
} from "../../lib/map-agent.ts";
// @ts-expect-error plain JS fixtures, shared with the browser tests
import * as fx from "../fixtures/map-agent.mjs";

test("ids: Monday item ids and listing uuids only", () => {
  assert.ok(ID_RE.test("13640003123"));
  for (const bad of ["", "12a", "1 2", "123456789012345678901", "-1"]) assert.equal(ID_RE.test(bad), false, bad);
  assert.ok(UUID_RE.test(fx.HOME.zillowExact));
  for (const bad of ["", "11111111-1111-4111-8111-11111111110", "11111111111141118111111111111101", `${fx.HOME.zillowExact}'`]) assert.equal(UUID_RE.test(bad), false, bad);
});

test("refused: only an object with ok:true passes", () => {
  assert.equal(refused(fx.RAW.forbidden), true);
  assert.equal(refused(null), true);
  assert.equal(refused([]), true);
  assert.equal(refused({ ok: true }), false);
});

test("cleanText strips control, bidi and zero-width characters and enforces the length", () => {
  assert.equal(cleanText("  hello\n\tworld  ", 50), "hello world");
  assert.equal(cleanText("a​b‮c﻿", 50), "abc");
  assert.equal(cleanText("x\u0000y\u0007z", 50), "x y z");
  assert.equal(cleanText(null, 5), "");
  assert.equal(cleanText(undefined, 5), "");
  assert.equal(cleanText(12, 5), undefined);
  assert.equal(cleanText("123456", 5), undefined);
});

test("clientIp reads the first forwarded address", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("rate limiter: N per key per window, keys are separate, the window slides", () => {
  const rl = new RateLimiter(3, 1000);
  assert.deepEqual([rl.allow("a", 0), rl.allow("a", 1), rl.allow("a", 2), rl.allow("a", 3)], [true, true, true, false]);
  assert.equal(rl.allow("b", 3), true);
  assert.equal(rl.allow("a", 999), false);
  assert.equal(rl.allow("a", 1000.5), true); // the hit at t=0 has left the window
  assert.equal(rl.allow("a", 1000.6), false);
});

test("outside homes: numbers from numeric strings, unsafe links dropped, unknown precision is null", () => {
  const out = toOutsideResponse(fx.RAW.outside);
  assert.equal(out.enabled, true);
  assert.equal(out.searchId, fx.OUTSIDE.searchId);
  assert.equal(out.versionNo, 2);
  assert.deepEqual(out.run, { status: "done", found: 3, fitting: 2, newHomes: 1, finishedAt: "2026-11-26T15:04:00+00:00" });
  assert.equal(out.homes.length, 3);
  const [exact, ff, stretch] = out.homes;
  assert.deepEqual(exact, {
    listingId: fx.HOME.zillowExact, source: "zillow", url: "https://example.com/zillow/4100-sample-ave", title: "4100 Sample Ave",
    addressKnown: true, city: "Tulsa", state: "OK", beds: 3, baths: 2, rent: 2350, lat: 36.1612, lng: -95.9801, precision: "exact",
    distanceMiles: 0.9, rank: 1, score: 91, fits: true, excludedBy: [], isNew: true, inPropertyDb: false, propertyItemId: null,
    onClaim: false, hasPhone: true, availableFrom: "2026-12-01", pets: "Pets allowed", photo: "https://example.com/photos/4100.jpg", outreach: null,
  });
  assert.equal(ff.lat, null);
  assert.equal(ff.precision, "area");
  assert.equal(ff.addressKnown, false);
  assert.deepEqual(ff.outreach, { status: "sent", channel: "ff_message", sentAt: "2026-11-25T18:30:00+00:00", sentBy: "Alex Example", repliedAt: null });
  assert.equal(stretch.url, null); // javascript: link
  assert.equal(stretch.precision, null); // "pin" is not a map precision
  assert.equal(stretch.fits, false);
  assert.deepEqual(stretch.excludedBy, ["rent"]);
  assert.equal(stretch.propertyItemId, "9900000101"); // number → text
  assert.equal(stretch.inPropertyDb, true);
});

test("outside homes: nothing searched yet, junk, and half a coordinate", () => {
  assert.deepEqual(toOutsideResponse({ ok: true, search_id: null, version_no: null, run: null, homes: [] }), { ...OUTSIDE_OFF, enabled: true });
  assert.deepEqual(toOutsideResponse(null).homes, []);
  const out = toOutsideResponse({ homes: [{ listing_id: "x", lat: 36.1, lng: null }, { title: "no id" }, "junk", { listing_id: "y", lat: 99, lng: 10 }] });
  assert.equal(out.homes.length, 2);
  assert.deepEqual(out.homes.map((h) => [h.lat, h.lng]), [[null, null], [null, null]]);
  assert.equal(out.homes[0].title, "Outside home");
  assert.equal(OUTSIDE_OFF.enabled, false);
});

test("the mapped fixture rows have exactly the keys of the UI fixtures", () => {
  const keys = (o: object) => Object.keys(o).sort();
  assert.deepEqual(keys(toOutsideResponse(fx.RAW.outside).homes[0]), keys(fx.OUTSIDE.homes[0]));
  assert.deepEqual(keys(toOutsideResponse(fx.RAW.outside)), keys(fx.OUTSIDE));
  assert.deepEqual(keys(toScoresResponse(fx.RAW.scores).scores[0]), keys(fx.SCORES.scores[0]));
  assert.deepEqual(keys(toSubmitStatusResponse(fx.RAW.submit).options[0]), keys(fx.SUBMIT_STATUS.options[0]));
  assert.deepEqual(keys(toNearsiteClaims(fx.RAW.nearsite)[0]), keys(fx.NEARSITE_CLAIMS.claims[0]));
  assert.deepEqual(keys(toPhoneLookup(fx.RAW.phoneFound)), keys(fx.PHONE.found));
  assert.deepEqual(keys(toAskResponse(fx.RAW.chatAnswer)), keys(fx.ASK.open));
  assert.deepEqual(keys(toOutreach(fx.RAW.outside.homes[1].outreach) as object), keys(fx.OUTREACH.sent.outreach));
});

test("the UI fixtures hold what the brief asks for", () => {
  assert.equal(fx.OUTSIDE.homes.length, 8);
  assert.ok(fx.OUTSIDE.homes.some((h: { source: string; precision: string }) => h.source === "zillow" && h.precision === "exact"));
  assert.ok(fx.OUTSIDE.homes.some((h: { source: string; lat: number | null }) => h.source === "furnished_finder" && h.lat === null));
  assert.equal(fx.OUTSIDE.homes.filter((h: { fits: boolean }) => !h.fits).length, 1);
  assert.ok(fx.OUTSIDE.homes.some((h: { isNew: boolean }) => h.isNew));
  assert.ok(fx.OUTSIDE.homes.some((h: { onClaim: boolean }) => h.onClaim));
  assert.equal(fx.SCORES.scores.length, 6);
  assert.equal(fx.NEARSITE_CLAIMS.claims.length, 5);
  assert.equal(fx.PHONE.found.state, "found");
  assert.equal(fx.PHONE.notFound.state, "not_found");
  const text = JSON.stringify(fx);
  assert.ok(!/\+1\d{3}(?!55501)\d{7}/.test(text), "phone numbers must be fictional (555-01xx)");
  assert.ok((text.match(/https?:\/\/[^"]+/g) ?? []).every((u) => u.startsWith("https://example.com/")), "links must point at example.com");
});

test("scores: rows without a property or score are dropped; stretchBy only when above zero", () => {
  const out = toScoresResponse(fx.RAW.scores);
  assert.deepEqual(out, {
    enabled: true,
    scores: [
      { propertyId: "9900000101", rank: 1, score: 96, why: "Margin $1,150/mo", stretch: false, stretchBy: null, distanceMiles: 1.5 },
      { propertyId: "9900000105", rank: 2, score: 61, why: null, stretch: true, stretchBy: 250, distanceMiles: 3 },
    ],
  });
  assert.deepEqual(toScoresResponse({ ok: true, scores: [] }), { enabled: true, scores: [] });
  assert.deepEqual(toScoresResponse(undefined), { enabled: true, scores: [] });
  assert.equal(toScoresResponse({ scores: [{ property_id: "1", score: 5, stretch_by: 0 }] }).scores[0].stretchBy, null);
});

test("submit status: unknown states read as todo, reasons only on blocked, counts recomputed", () => {
  const out = toSubmitStatusResponse(fx.RAW.submit);
  assert.deepEqual(out.options.map((o) => o.state), ["submitted", "ready", "blocked", "todo"]);
  assert.deepEqual(out.options.map((o) => o.reason), [null, null, "Availability has not been checked", null]);
  assert.deepEqual(out.counts, { ready: 1, submitted: 1 });
  assert.equal(out.options[0].submittedBy, "Sam Sample");
  assert.equal(out.options[2].propertyId, null);
  assert.deepEqual(toSubmitStatusResponse(null), { enabled: true, options: [], counts: { ready: 0, submitted: 0 } });
});

test("nearsite claims: numbers parsed, half a coordinate dropped, a missing title gets a name", () => {
  const [a, b] = toNearsiteClaims(fx.RAW.nearsite);
  assert.deepEqual(a, fx.NEARSITE_CLAIMS.claims[0]);
  assert.equal(b.title, "Nearsite claim 90005");
  assert.deepEqual([b.lat, b.lng], [null, null]);
  assert.equal(b.daysLeft, null);
  assert.deepEqual(toNearsiteClaims({ claims: [{ title: "no id" }] }), []);
  assert.deepEqual(toNearsiteClaims("junk"), []);
});

test("phone lookup: found, not found, never looked, off", () => {
  assert.deepEqual(toPhoneLookup(fx.RAW.phoneFound), { state: "found", phone: "+19185550142", source: "lookup", confidence: "high", lookedUpAt: "2026-11-26T15:10:00+00:00" });
  assert.deepEqual(toPhoneLookup(fx.RAW.phoneNotFound), { state: "not_found", phone: null, source: "lookup", confidence: null, lookedUpAt: "2026-11-26T15:10:00+00:00" });
  assert.deepEqual(toPhoneLookup(fx.RAW.phoneNone), PHONE_NONE);
  assert.equal(PHONE_NONE.lookedUpAt, null);
  assert.equal(PHONE_OFF.state, "off");
});

test("phone lookup answer: only a 7–15 digit phone counts", () => {
  assert.deepEqual(readPhoneAnswer({ phone: "+1 (918) 555-0142", source: " lookup ", confidence: "medium" }), { phone: "+19185550142", source: "lookup", confidence: "medium" });
  assert.deepEqual(readPhoneAnswer({ phone: "918-555-0142" }), { phone: "9185550142", source: null, confidence: null });
  assert.deepEqual(readPhoneAnswer({ phone: 9185550142, confidence: "certain" }), { phone: "9185550142", source: null, confidence: null });
  assert.deepEqual(readPhoneAnswer({ phone: "n/a", confidence: "high" }), { phone: null, source: null, confidence: null });
  assert.deepEqual(readPhoneAnswer({ phone: "12345" }), { phone: null, source: null, confidence: null });
  assert.deepEqual(readPhoneAnswer(null), { phone: null, source: null, confidence: null });
});

test("claim context is read defensively", () => {
  assert.deepEqual(toClaimContext(fx.RAW.context), {
    known: true, boardId: "9030696652", searchId: fx.OUTSIDE.searchId, versionNo: 3,
    listing: { found: true, inRun: true, addressKnown: true, onClaim: false, propertyItemId: null, subitemId: null },
  });
  assert.deepEqual(toClaimContext({ ok: true, known: false, board_id: null, search_id: null, version_no: null, listing: null }), {
    known: false, boardId: null, searchId: null, versionNo: null, listing: null,
  });
  assert.equal(toClaimContext({ listing: { found: false } }).listing?.found, false);
});

test("parseAsk: actions, required fields, cleaning", () => {
  assert.deepEqual(parseAsk({ action: "open" }), { action: "open", message: "", listingId: null, user: "" });
  assert.deepEqual(parseAsk({ action: "message", message: "  under 3k\nplease ", user: " Will " }), { action: "message", message: "under 3k please", listingId: null, user: "Will" });
  assert.deepEqual(parseAsk({ action: "reject", listingId: fx.HOME.zillowExact.toUpperCase(), message: "ignored" }), { action: "reject", message: "", listingId: fx.HOME.zillowExact, user: "" });
  assert.deepEqual(parseAsk({ action: "undo", listingId: "junk" }), { action: "undo", message: "", listingId: null, user: "" });
  for (const bad of [null, [], "open", { action: "add" }, { action: "apply" }, { action: "landlord_reply" }, { action: "message" }, { action: "message", message: " \n " },
    { action: "message", message: "x".repeat(1001) }, { action: "message", message: 5 }, { action: "more_like" }, { action: "reject", listingId: "1" },
    { action: "open", user: "x".repeat(81) }]) {
    assert.ok("error" in parseAsk(bad), JSON.stringify(bad));
  }
});

test("upstreamFor: undo becomes 'go back to version N-1'; nothing is sent when there is nothing to undo", () => {
  const ask = (action: "open" | "message" | "reject" | "more_like" | "undo", extra = {}) => ({ action, message: "", listingId: null, user: "", ...extra });
  assert.deepEqual(upstreamFor(ask("undo"), 3), { action: "message", message: "Go back to version 2", listingId: null });
  assert.deepEqual(upstreamFor(ask("undo"), 1), { say: "There is no earlier search to go back to." });
  assert.deepEqual(upstreamFor(ask("undo"), null), { say: "There is no earlier search to go back to." });
  assert.deepEqual(upstreamFor(ask("open"), null), { action: "open", message: "", listingId: null });
  assert.deepEqual(upstreamFor(ask("message", { message: "wider" }), 2), { action: "message", message: "wider", listingId: null });
  assert.deepEqual(upstreamFor(ask("more_like", { listingId: fx.HOME.ffArea }), 2), { action: "more_like", message: "", listingId: fx.HOME.ffArea });
});

test("ask answer: summary from the run, running state, fallbacks", () => {
  assert.deepEqual(toAskResponse(fx.RAW.chatAnswer), {
    ok: true, say: "Capping rent at $3,000. Found 2 homes that fit.", running: false, searchId: fx.OUTSIDE.searchId, versionNo: 3, summary: { homes: 2, newHomes: 1 },
  });
  const running = toAskResponse({ ok: true, say: "Searching.", result: { search_id: "s", version_no: 2, run: { status: "running" }, homes: [] } });
  assert.equal(running.running, true);
  assert.deepEqual(running.summary, { homes: 0, newHomes: 0 });
  // No result: the search and version come from what the map already knew.
  assert.deepEqual(toAskResponse({ ok: true, say: "It was left out because: rent." }, { searchId: "s1", versionNo: 4 }), {
    ok: true, say: "It was left out because: rent.", running: false, searchId: "s1", versionNo: 4, summary: null,
  });
  // More homes fit than are listed: the run's count wins; with no run count, new homes are counted from the list.
  assert.deepEqual(toAskResponse({ ok: true, say: "x", result: { run: { status: "done", fitting: 20 }, homes: [{ is_new: true }, { is_new: true }, {}] } }).summary, { homes: 20, newHomes: 2 });
  assert.equal(toAskResponse({ ok: true }).say, "Done.");
  assert.deepEqual(toAskResponse("junk"), { ok: false, say: "The agent did not answer. Try again in a minute.", running: false, searchId: null, versionNo: null, summary: null });
});

test("the agent's sentence: set-up problems are reworded, control characters and length handled", () => {
  const bad = toAskResponse(fx.RAW.chatBadKey);
  assert.equal(bad.ok, false);
  assert.ok(!/key/i.test(bad.say));
  assert.equal(cleanSay("Hidden.‮\nThat home will not come back."), "Hidden. That home will not come back.");
  assert.equal(cleanSay("x".repeat(900)).length, 600);
  assert.equal(cleanSay(42), "");
});

test("add answer: added only when the workflow names this listing", () => {
  assert.equal(readAddAnswer(fx.RAW.chatAdded, fx.HOME.zillowExact), "added");
  assert.equal(readAddAnswer(fx.RAW.chatAdded, fx.HOME.zillowExact.toUpperCase()), "added");
  assert.equal(readAddAnswer(fx.RAW.chatAdded, fx.HOME.zillowNew), "failed");
  assert.equal(readAddAnswer(fx.RAW.chatAlready, fx.HOME.zillowExact), "already");
  assert.equal(readAddAnswer(fx.RAW.chatAddRefused, fx.HOME.zillowExact), "failed");
  assert.equal(readAddAnswer(fx.RAW.chatBadKey, fx.HOME.zillowExact), "failed");
  assert.equal(readAddAnswer(null, fx.HOME.zillowExact), "failed");
});
