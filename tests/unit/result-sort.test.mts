import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestMatchAvailable, effectiveSort, hasPin, itemId, noLocationStart, rowDomId, scoreOf, sortResults, strengthLabel, stretchOf, stretchText,
} from "../../lib/result-sort.ts";
import type { ResultItem } from "../../lib/result-sort.ts";
import type { MatchScore, OutsideHome, Pin } from "../../lib/types";
// @ts-expect-error plain JS fixtures, shared with the browser tests
import * as fx from "../fixtures/map-agent.mjs";

const pin = (id: string, distance: number, status: string = "yellow", extra: Partial<Pin> = {}): Pin =>
  ({ monday_item_id: id, name: `Home ${id}`, distance_miles: distance, map_status: status, monthly_rate: 2000, ...extra }) as Pin;
const score = (propertyId: string, value: number, extra: Partial<MatchScore> = {}): MatchScore => ({
  propertyId, rank: 1, score: value, why: null, stretch: false, stretchBy: null, distanceMiles: null, ...extra,
});
const home = (id: string, extra: Partial<OutsideHome> = {}): OutsideHome => ({
  listingId: id, source: "zillow", url: null, title: id, addressKnown: true, city: null, state: null, beds: 3, baths: 2, rent: 2000,
  lat: 36.1, lng: -95.9, precision: "exact", distanceMiles: 1, rank: 1, score: null, fits: true, excludedBy: [], isNew: false,
  inPropertyDb: false, propertyItemId: null, onClaim: false, hasPhone: false, availableFrom: null, pets: null, photo: null, outreach: null, ...extra,
});
const noPin = { lat: null, lng: null, distanceMiles: null, precision: null } as const;
const ids = (items: ResultItem[]) => items.map(itemId);

const HOMES = fx.OUTSIDE.homes as OutsideHome[];
const SCORES = fx.SCORES.scores as MatchScore[];

test("strengthLabel: Strong 75–100, Fair 50–74, Weak 0–49", () => {
  assert.deepEqual([100, 75, 74.9, 50, 49, 0].map(strengthLabel), ["Strong", "Strong", "Fair", "Fair", "Weak", "Weak"]);
});

test("stretchText: the amount when it is about price, plain Stretch otherwise", () => {
  assert.equal(stretchText(150), "Stretch +$150");
  assert.equal(stretchText(1250.4), "Stretch +$1,250");
  for (const none of [null, undefined, 0, -20, Number.NaN]) assert.equal(stretchText(none), "Stretch");
});

test("stretchOf: the matcher's word wins; without a score, rent up to 10% over the FRV is a stretch", () => {
  assert.deepEqual(stretchOf({ score: score("1", 61, { stretch: true, stretchBy: 250 }) }), { by: 250 });
  assert.deepEqual(stretchOf({ score: score("1", 44, { stretch: true, stretchBy: null }) }), { by: null });
  assert.equal(stretchOf({ score: score("1", 90), rent: 2600, frv: 2500 }), null, "scored and not a stretch: the rent rule is not applied on top");
  assert.deepEqual(stretchOf({ rent: 2600, frv: 2500 }), { by: 100 });
  assert.deepEqual(stretchOf({ rent: 2750, frv: 2500 }), { by: 250 }, "exactly 10% is still a stretch");
  assert.equal(stretchOf({ rent: 2751, frv: 2500 }), null, "over the limit is not a stretch (it is plainly over)");
  assert.equal(stretchOf({ rent: 2500, frv: 2500 }), null);
  for (const src of [{ rent: null, frv: 2500 }, { rent: 2600, frv: null }, { rent: 2600 }, { rent: 2600, frv: 0 }, {}]) assert.equal(stretchOf(src), null);
});

test("hasPin: both coordinates or it is a list row only", () => {
  assert.equal(hasPin({ lat: 36, lng: -95 }), true);
  assert.equal(hasPin({ lat: null, lng: -95 }), false);
  assert.equal(hasPin({ lat: 36, lng: null }), false);
  assert.equal(hasPin({ lat: Number.NaN, lng: -95 }), false);
});

test("nearest, our homes only: exactly today's order (green first, then nearest; red last)", () => {
  const pins = [pin("a", 5), pin("b", 1, "red"), pin("c", 3, "green"), pin("d", 2), pin("e", 9, "green"), pin("f", 4, "something new")];
  const today = [...pins].sort((x, y) => {
    const order = ["green", "yellow", "red"];
    const s = (p: Pin) => order.indexOf(p.map_status === "green" || p.map_status === "red" ? p.map_status : "yellow");
    return s(x) - s(y) || x.distance_miles - y.distance_miles;
  });
  const out = sortResults({ pins, mode: "nearest" });
  assert.deepEqual(ids(out), today.map((p) => p.monday_item_id));
  assert.deepEqual(ids(out), ["c", "e", "d", "f", "a", "b"]);
  assert.ok(out.every((i) => i.kind === "ours" && i.score === null));
});

test("nearest: scores do not change the order, but each row carries its score for the chip", () => {
  const pins = [pin("a", 5), pin("b", 1)];
  const out = sortResults({ pins, scores: [score("a", 99)], mode: "nearest" });
  assert.deepEqual(ids(out), ["b", "a"]);
  assert.equal(out[1].score?.score, 99);
  assert.equal(out[0].score, null);
});

test("nearest: outside homes sit with the neutral homes by distance; ours first on a tie; red after them", () => {
  const pins = [pin("g", 6, "green"), pin("y1", 1), pin("y2", 3), pin("r", 0.1, "red")];
  const outside = [home("o-far", { distanceMiles: 4, rank: 1 }), home("o-near", { distanceMiles: 0.5, rank: 2 }), home("o-tie", { distanceMiles: 3, rank: 3 })];
  assert.deepEqual(ids(sortResults({ pins, outside, mode: "nearest" })), ["g", "o-near", "y1", "y2", "o-tie", "o-far", "r"]);
});

test("nearest: homes with no map location come last, in rank order, under a divider", () => {
  const pins = [pin("y", 2), pin("r", 1, "red")];
  const outside = [home("list-2", { ...noPin, rank: 5 }), home("pinned", { distanceMiles: 9, rank: 9 }), home("list-1", { ...noPin, rank: 2 })];
  const out = sortResults({ pins, outside, mode: "nearest" });
  assert.deepEqual(ids(out), ["y", "pinned", "r", "list-1", "list-2"]);
  assert.deepEqual(noLocationStart(out, "nearest"), { index: 3, count: 2 });
  assert.equal(noLocationStart(out, "best"), null, "no divider in Best match");
  assert.equal(noLocationStart(sortResults({ pins, mode: "nearest" }), "nearest"), null);
  assert.equal(noLocationStart([], "nearest"), null);
  const onlyList = sortResults({ pins: [], outside: [home("x", noPin)], mode: "nearest" });
  assert.deepEqual(noLocationStart(onlyList, "nearest"), { index: 0, count: 1 });
});

test("nearest: a pinned outside home with no distance goes after the ones that have one", () => {
  const out = sortResults({ pins: [pin("y", 40)], outside: [home("o", { distanceMiles: null })], mode: "nearest" });
  assert.deepEqual(ids(out), ["y", "o"]);
});

test("best: score highest first, ties by distance, ours and outside together", () => {
  const pins = [pin("a", 5), pin("b", 1), pin("c", 2, "green")];
  const outside = [home("o1", { score: 85, distanceMiles: 3, rank: 1 }), home("o2", { score: 70, distanceMiles: 0.2, rank: 2 })];
  const scores = [score("a", 85), score("b", 60), score("c", 85)];
  // 85: c (2 mi), o1 (3 mi), a (5 mi); then o2 70; then b 60
  assert.deepEqual(ids(sortResults({ pins, outside, scores, mode: "best" })), ["c", "o1", "a", "o2", "b"]);
});

test("best: on an equal score and distance, our home comes before the outside one", () => {
  const out = sortResults({ pins: [pin("a", 2)], outside: [home("o", { score: 80, distanceMiles: 2 })], scores: [score("a", 80)], mode: "best" });
  assert.deepEqual(ids(out), ["a", "o"]);
});

test("best: red (do not use) homes are always last, even with the top score", () => {
  const pins = [pin("red-top", 0.1, "red"), pin("a", 5), pin("red-none", 0.2, "red"), pin("plain", 1)];
  const out = sortResults({ pins, scores: [score("red-top", 100), score("a", 40)], outside: [home("o", { rank: 1 })], mode: "best" });
  assert.deepEqual(ids(out), ["a", "o", "plain", "red-top", "red-none"]);
});

test("best: outside homes without a score follow the scored rows in rank order, then the rest of ours as today", () => {
  const pins = [pin("scored", 9), pin("far", 8), pin("near", 1), pin("green", 7, "green")];
  const outside = [home("rank3", { rank: 3, distanceMiles: 0.1 }), home("rank1", { rank: 1, ...noPin }), home("rank2", { rank: 2, distanceMiles: 20 })];
  const out = sortResults({ pins, outside, scores: [score("scored", 51)], mode: "best" });
  assert.deepEqual(ids(out), ["scored", "rank1", "rank2", "rank3", "green", "near", "far"]);
});

test("best: homes on the claim are not pulled to the top", () => {
  const outside = [home("on-claim", { score: 60, onClaim: true }), home("better", { score: 90 })];
  assert.deepEqual(ids(sortResults({ pins: [], outside, mode: "best" })), ["better", "on-claim"]);
});

test("best with no scores and no outside homes is the same order as nearest", () => {
  const pins = [pin("a", 5), pin("b", 1, "red"), pin("c", 3, "green"), pin("d", 2)];
  assert.deepEqual(ids(sortResults({ pins, scores: [], mode: "best" })), ids(sortResults({ pins, mode: "nearest" })));
});

test("fits:false outside homes are left out in both orders", () => {
  const outside = [home("ok"), home("no", { fits: false, excludedBy: ["rent"], score: 99 })];
  for (const mode of ["best", "nearest"] as const) assert.deepEqual(ids(sortResults({ pins: [], outside, mode })), ["ok"]);
});

test("a home already in our database that is also one of our pins is not listed twice", () => {
  const pins = [pin("101", 1.5)];
  const twin = home("twin", { inPropertyDb: true, propertyItemId: "101" });
  for (const mode of ["best", "nearest"] as const) assert.deepEqual(ids(sortResults({ pins, outside: [twin, home("other", { distanceMiles: 2 })], mode })), mode === "best" ? ["other", "101"] : ["101", "other"]);
  // in the database but not among the pins shown (outside the radius): it keeps its outside row…
  assert.deepEqual(ids(sortResults({ pins: [], outside: [twin], mode: "nearest" })), ["twin"]);
  // …unless the caller says that home is drawn elsewhere
  assert.deepEqual(ids(sortResults({ pins: [], outside: [twin], mode: "nearest", knownPropertyIds: ["101"] })), []);
  assert.deepEqual(ids(sortResults({ pins: [], outside: [twin], mode: "nearest", knownPropertyIds: new Set(["101"]) })), []);
  // ids compare as text: a numeric id from elsewhere still matches
  const numeric = home("num", { inPropertyDb: true, propertyItemId: 101 as unknown as string });
  assert.deepEqual(ids(sortResults({ pins, outside: [numeric], mode: "nearest" })), ["101"]);
  // inPropertyDb false: the id is not trusted, the row stays
  assert.deepEqual(ids(sortResults({ pins, outside: [home("loose", { propertyItemId: "101", distanceMiles: 2 })], mode: "nearest" })), ["101", "loose"]);
});

test("an outside home that is a scored home of ours (but not a pin) carries the matcher's score", () => {
  const twin = home("twin", { inPropertyDb: true, propertyItemId: "777", score: null });
  const [row] = sortResults({ pins: [], outside: [twin], scores: [score("777", 83)], mode: "best" });
  assert.equal(row.score?.score, 83);
  assert.equal(scoreOf(row), 83);
});

test("the same listing twice is listed once; bad scores are ignored; the first score per home wins", () => {
  const out = sortResults({
    pins: [pin("a", 1), pin("b", 2)],
    outside: [home("dup", { rank: 1 }), home("dup", { rank: 2 })],
    scores: [score("a", Number.NaN), score("b", 70), score("b", 10)],
    mode: "best",
  });
  assert.deepEqual(ids(out), ["b", "dup", "a"]);
  assert.equal(out[0].score?.score, 70);
});

test("empty and missing inputs", () => {
  assert.deepEqual(sortResults({ pins: [], mode: "best" }), []);
  assert.deepEqual(sortResults({ pins: [], outside: null, scores: null, mode: "nearest" }), []);
});

test("the inputs are not reordered", () => {
  const pins = [pin("a", 5), pin("b", 1)];
  const outside = [home("o2", { rank: 2 }), home("o1", { rank: 1 })];
  sortResults({ pins, outside, scores: [score("a", 9)], mode: "best" });
  sortResults({ pins, outside, mode: "nearest" });
  assert.deepEqual(pins.map((p) => p.monday_item_id), ["a", "b"]);
  assert.deepEqual(outside.map((h) => h.listingId), ["o2", "o1"]);
});

test("scoreOf, itemId, rowDomId", () => {
  const ours: ResultItem = { kind: "ours", pin: pin("12", 1), score: score("12", 66) };
  const theirs: ResultItem = { kind: "outside", home: home(fx.HOME.zillowExact, { score: 91 }), score: null };
  assert.equal(scoreOf(ours), 66);
  assert.equal(scoreOf(theirs), 91);
  assert.equal(scoreOf({ kind: "ours", pin: pin("1", 1), score: null }), null);
  assert.equal(scoreOf({ kind: "outside", home: home("x"), score: null }), null);
  assert.equal(itemId(ours), "12");
  assert.equal(rowDomId(ours), "row-12");
  assert.equal(rowDomId(theirs), `row-out-${fx.HOME.zillowExact}`);
});

test("bestMatchAvailable / effectiveSort: Best match needs something to sort by, else Nearest", () => {
  const none = sortResults({ pins: [pin("a", 1)], outside: [home("o")], mode: "nearest" });
  const some = sortResults({ pins: [pin("a", 1)], scores: [score("a", 5)], mode: "nearest" });
  const outsideOnly = sortResults({ pins: [], outside: [home("o", { score: 0 })], mode: "nearest" });
  assert.equal(bestMatchAvailable(none), false);
  assert.equal(bestMatchAvailable(some), true);
  assert.equal(bestMatchAvailable(outsideOnly), true, "a score of 0 is still a score");
  assert.equal(bestMatchAvailable(sortResults({ pins: [pin("a", 1)], scores: [score("zzz", 90)], mode: "nearest" })), false, "scores for homes that are not in the list do not count");
  assert.equal(effectiveSort("best", true), "best");
  assert.equal(effectiveSort("best", false), "nearest");
  assert.equal(effectiveSort("nearest", true), "nearest");
});

test("the shared fixtures: both orders, end to end", () => {
  const pins = ["9900000101", "9900000102", "9900000103", "9900000104", "9900000105", "9900000106"].map((id, i) => pin(id, SCORES[i].distanceMiles!));
  const H = fx.HOME;
  const best = sortResults({ pins, outside: HOMES, scores: SCORES, mode: "best" });
  // 912 Example St is pin 9900000101 (in the database, on the claim): only our row. 5 Stretch Ct does not fit.
  assert.deepEqual(ids(best), [
    "9900000101", H.zillowExact, "9900000102", H.zillowNew, "9900000103", "9900000104", H.zillowApprox, "9900000105", "9900000106",
    H.ffArea, H.ffNoCoords, H.ffAsked,
  ]);
  assert.ok(!ids(best).includes(H.zillowOnClaim) && !ids(best).includes(H.stretch));
  const nearest = sortResults({ pins, outside: HOMES, scores: SCORES, mode: "nearest" });
  assert.deepEqual(ids(nearest), [
    H.zillowExact, "9900000101", H.zillowNew, H.ffArea, "9900000102", "9900000105", H.zillowApprox, "9900000103", "9900000104", "9900000106",
    H.ffNoCoords, H.ffAsked,
  ]);
  assert.deepEqual(noLocationStart(nearest, "nearest"), { index: 10, count: 2 });
  assert.equal(best.length, nearest.length);
});
