import { existsSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTSIDE_PIN_CAP,
  hasCoords,
  outsideChipText,
  outsidePassesFilters,
  outsidePetsOk,
  outsidePinLabel,
  outsideStyleKey,
  notFitText,
  outsideZIndex,
  pinPrecision,
  pinWeight,
  pinnableOutside,
  sourceLetter,
  sourceLogo,
  sourceName,
} from "../../lib/outside-pins.ts";
import type { OutsideHome } from "../../lib/types";
import { HOME, OUTSIDE } from "../fixtures/map-agent.mjs";

const homes = OUTSIDE.homes as OutsideHome[];
const byId = (id: string) => homes.find((h) => h.listingId === id)!;
const make = (o: Partial<OutsideHome>): OutsideHome => ({ ...byId(HOME.zillowExact), ...o });

test("source letter: Z, F, then the first letter or digit, always one uppercase character", () => {
  assert.equal(sourceLetter("zillow"), "Z");
  assert.equal(sourceLetter(" Zillow "), "Z");
  assert.equal(sourceLetter("furnished_finder"), "F");
  assert.equal(sourceLetter("apartments_com"), "A");
  assert.equal(sourceLetter("_hotpads"), "H");
  assert.equal(sourceLetter("4walls"), "4");
  assert.equal(sourceLetter("<img>"), "I");
  assert.equal(sourceLetter(""), "?");
  assert.equal(sourceLetter(null), "?");
  assert.equal(sourceLetter("***"), "?");
});

test("source name for labels", () => {
  assert.equal(sourceName("zillow"), "Zillow");
  assert.equal(sourceName("furnished_finder"), "Furnished Finder");
  assert.equal(sourceName("apartments_com"), "Apartments com");
  assert.equal(sourceName(null), "another site");
  assert.equal(sourceName("  "), "another site");
});

test("source logo: Zillow and Furnished Finder have one, other sites keep their letter", () => {
  assert.equal(sourceLogo("zillow"), "/logos/zillow.png");
  assert.equal(sourceLogo(" Zillow "), "/logos/zillow.png");
  assert.equal(sourceLogo("furnished_finder"), "/logos/furnished-finder.png");
  assert.equal(sourceLogo("apartments_com"), null);
  assert.equal(sourceLogo("constructor"), null);
  assert.equal(sourceLogo(""), null);
  assert.equal(sourceLogo(null), null);
  assert.equal(sourceLetter("apartments_com"), "A");
});

test("every source logo is a file in public/", () => {
  for (const source of ["zillow", "furnished_finder"]) {
    const path = sourceLogo(source);
    assert.ok(path, `no logo for ${source}`);
    assert.ok(existsSync(new URL(`../../public${path}`, import.meta.url)), `missing ${path}`);
  }
});

test("chip text matches our own pins", () => {
  assert.equal(outsideChipText(3100), "$3.1k");
  assert.equal(outsideChipText(3000), "$3k");
  assert.equal(outsideChipText(2350), "$2.4k");
  assert.equal(outsideChipText(950), "$950");
  assert.equal(outsideChipText(null), "—");
  assert.equal(outsideChipText(undefined), "—");
  assert.equal(outsideChipText(0), "—");
  assert.equal(outsideChipText(Number.NaN), "—");
});

test("coordinates: both must be real numbers", () => {
  assert.equal(hasCoords({ lat: 36.1, lng: -95.9 }), true);
  assert.equal(hasCoords({ lat: null, lng: -95.9 }), false);
  assert.equal(hasCoords({ lat: 36.1, lng: null }), false);
  assert.equal(hasCoords({ lat: Number.NaN, lng: 1 }), false);
  assert.equal(hasCoords({ lat: "36.1" as unknown as number, lng: 1 }), false);
});

test("precision: area is dashed, approx is near, anything else is exact", () => {
  assert.equal(pinPrecision({ precision: "area" }), "area");
  assert.equal(pinPrecision({ precision: "approx" }), "approx");
  assert.equal(pinPrecision({ precision: "exact" }), "exact");
  assert.equal(pinPrecision({ precision: null }), "exact");
  assert.equal(pinPrecision({ precision: "pin" as never }), "exact");
});

test("z-index stays in the 400–500 band: scored homes above unscored, then by score or rank", () => {
  assert.equal(outsideZIndex({ score: 77, rank: 9 }), 489);
  assert.equal(outsideZIndex({ score: 76.6, rank: 9 }), 488);
  assert.equal(outsideZIndex({ score: 0, rank: 1 }), 450);
  assert.equal(outsideZIndex({ score: 100, rank: 1 }), 500);
  assert.equal(outsideZIndex({ score: 250, rank: 1 }), 500);
  assert.equal(outsideZIndex({ score: -5, rank: 1 }), 450);
  assert.equal(outsideZIndex({ score: null, rank: 1 }), 449);
  assert.equal(outsideZIndex({ score: null, rank: 5 }), 445);
  assert.equal(outsideZIndex({ score: null, rank: 400 }), 400);
  assert.ok(outsideZIndex({ score: 0, rank: 99 }) > outsideZIndex({ score: null, rank: 1 }), "any score beats no score");
  assert.equal(pinWeight({ score: null, rank: Number.NaN }), 0);
  for (const h of homes) assert.ok(outsideZIndex(h) >= 400 && outsideZIndex(h) <= 500);
});

test("pinnable: needs coordinates, not on the claim, best first", () => {
  const { homes: pins, capped } = pinnableOutside(homes);
  assert.deepEqual(
    pins.map((h) => h.listingId),
    [HOME.zillowExact, HOME.zillowNew, HOME.zillowApprox, HOME.stretch, HOME.ffArea],
  );
  assert.equal(capped, 0);
  assert.ok(!pins.some((h) => h.listingId === HOME.ffNoCoords || h.listingId === HOME.ffAsked), "no pin without coordinates");
  assert.ok(!pins.some((h) => h.listingId === HOME.zillowOnClaim), "on the claim: drawn by the attached layer");
});

test("pinnable: a home that is already one of our pins is not drawn twice", () => {
  const inDb = make({ listingId: "a", inPropertyDb: true, propertyItemId: "9900000102", onClaim: false });
  assert.equal(pinnableOutside([inDb]).homes.length, 1, "not drawn by us: keeps its outside pin");
  assert.equal(pinnableOutside([inDb], { drawnPropertyIds: new Set(["9900000102"]) }).homes.length, 0);
  assert.equal(pinnableOutside([inDb], { drawnPropertyIds: new Set(["1"]) }).homes.length, 1);
  const numeric = make({ listingId: "b", inPropertyDb: true, propertyItemId: 9900000102 as unknown as string });
  assert.equal(pinnableOutside([numeric], { drawnPropertyIds: new Set(["9900000102"]) }).homes.length, 0);
});

test("pinnable: capped at 50 with the best kept, duplicates dropped", () => {
  const many = Array.from({ length: 60 }, (_, i) => make({ listingId: `h${i}`, rank: i + 1, score: i }));
  const { homes: pins, capped } = pinnableOutside(many);
  assert.equal(OUTSIDE_PIN_CAP, 50);
  assert.equal(pins.length, 50);
  assert.equal(capped, 10);
  assert.equal(pins[0].listingId, "h59");
  assert.equal(pins[49].listingId, "h10");
  assert.equal(pinnableOutside(many, { cap: 3 }).homes.length, 3);
  assert.equal(pinnableOutside([make({ listingId: "x" }), make({ listingId: "x" })]).homes.length, 1);
  const unscored = [make({ listingId: "r3", score: null, rank: 3 }), make({ listingId: "r1", score: null, rank: 1 }), make({ listingId: "s", score: 10, rank: 9 })];
  assert.deepEqual(pinnableOutside(unscored).homes.map((h) => h.listingId), ["s", "r1", "r3"]);
  const order = pinnableOutside(many.concat(unscored)).homes.map((h) => outsideZIndex(h));
  assert.deepEqual(order, [...order].sort((a, b) => b - a), "kept in the order they stack");
  assert.deepEqual(pinnableOutside([]), { homes: [], capped: 0 });
});

test("pets text from the listing sites", () => {
  assert.equal(outsidePetsOk("Pets allowed"), true);
  assert.equal(outsidePetsOk("Cats only"), true);
  assert.equal(outsidePetsOk("No pets"), false);
  assert.equal(outsidePetsOk("Pets not allowed"), false);
  assert.equal(outsidePetsOk(null), null);
  assert.equal(outsidePetsOk("Ask"), null);
});

test("rail filters dim an outside home the way they dim ours", () => {
  const off = { pets: false, photos: false, priced: false };
  const h = byId(HOME.zillowExact);
  assert.equal(outsidePassesFilters(h, off), true);
  assert.equal(outsidePassesFilters(h, null), true);
  assert.equal(outsidePassesFilters(h, { ...off, pets: true, photos: true, priced: true }), true);
  assert.equal(outsidePassesFilters(byId(HOME.zillowApprox), { ...off, pets: true }), false, "pets unknown");
  assert.equal(outsidePassesFilters(byId(HOME.zillowApprox), { ...off, photos: true }), false, "no photo");
  assert.equal(outsidePassesFilters(make({ rent: null }), { ...off, priced: true }), false);
});

test("pin label names the source, the match and the precision in words", () => {
  assert.equal(outsidePinLabel({ title: "905 Larkspur Ln", rent: 3100, source: "zillow", score: 77, precision: "exact" }), "905 Larkspur Ln, $3.1k, outside listing from Zillow, match 77");
  assert.equal(
    outsidePinLabel({ title: "Cozy 3BR near Midtown", rent: 2700, source: "furnished_finder", score: null, precision: "area" }),
    "Cozy 3BR near Midtown, $2.7k, outside listing from Furnished Finder, area only",
  );
  assert.equal(outsidePinLabel({ title: "2300 Fixture Blvd", rent: 2500, source: "zillow", score: 72, precision: "approx" }), "2300 Fixture Blvd, $2.5k, outside listing from Zillow, match 72, approximate location");
  assert.equal(outsidePinLabel({ title: " ", rent: null, source: "", score: null, precision: null }), "Outside listing, —, outside listing from another site");
});

test("style key changes with anything the pin shows, and only then", () => {
  const h = byId(HOME.zillowExact);
  const base = { selected: false, hovered: false, shown: true };
  const k = outsideStyleKey(h, base);
  assert.equal(k, outsideStyleKey({ ...h }, { ...base }));
  assert.equal(k, outsideStyleKey(make({ distanceMiles: 99, isNew: true }), base), "fields the pin does not show");
  const others = [
    outsideStyleKey(h, { ...base, selected: true }),
    outsideStyleKey(h, { ...base, hovered: true }),
    outsideStyleKey(h, { ...base, shown: false }),
    outsideStyleKey(make({ rent: 9999 }), base),
    outsideStyleKey(make({ source: "furnished_finder" }), base),
    outsideStyleKey(make({ precision: "area" }), base),
    outsideStyleKey(make({ precision: "approx" }), base),
    outsideStyleKey(make({ score: 12 }), base),
    outsideStyleKey(make({ title: "Other" }), base),
  ];
  assert.equal(new Set([k, ...others]).size, others.length + 1);
});

test("notFitText: the reasons in plain words, none when the home fits", () => {
  assert.equal(notFitText(["available_late"]), "Not a fit: available too late");
  assert.equal(notFitText(["no_price", "available_late"]), "Not a fit: no price listed, available too late");
  assert.equal(notFitText(["rent", "beds", "distance", "no_location"]), "Not a fit: rent over the limit, too few bedrooms, too far from the loss, no location listed");
  assert.equal(notFitText(["pet_policy", " "]), "Not a fit: pet policy");
  for (const none of [[], null, undefined]) assert.equal(notFitText(none as string[] | null | undefined), null);
});
