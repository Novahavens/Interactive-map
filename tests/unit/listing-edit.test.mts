import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EDIT_FIELDS, FIELD_BY_KEY, conflicts, currentValue, diffLines, displayValue, fromMondayText, mondayColumnValues,
  normaliseValue, parseEditRequest, sameValue, type EditField,
} from "../../lib/listing-edit.ts";

const f = (k: string) => FIELD_BY_KEY.get(k) as EditField;

test("every field has a unique key and Monday column", () => {
  assert.equal(new Set(EDIT_FIELDS.map((x) => x.key)).size, EDIT_FIELDS.length);
  assert.equal(new Set(EDIT_FIELDS.map((x) => x.column)).size, EDIT_FIELDS.length);
  // The availability status belongs to the availability monitor and is never editable from the map.
  assert.equal(FIELD_BY_KEY.has("availability"), false);
  for (const k of ["owner_phone", "owner_name", "name", "city", "state", "zipcode", "lat", "lng", "landlord_phone"]) assert.equal(FIELD_BY_KEY.has(k), false, k);
  assert.equal(f("address").column, "location_mm416w07");
});

test("numbers: text or number in, number out; ranges and kinds enforced", () => {
  assert.deepEqual(normaliseValue(f("monthly_rate"), "$2,400"), { ok: true, value: 2400 });
  assert.deepEqual(normaliseValue(f("monthly_rate"), 2400.456), { ok: true, value: 2400.46 });
  assert.deepEqual(normaliseValue(f("bathrooms"), "2.5"), { ok: true, value: 2.5 });
  assert.equal(normaliseValue(f("bathrooms"), "2.3").ok, false);
  assert.equal(normaliseValue(f("bedrooms"), "3.5").ok, false);
  assert.equal(normaliseValue(f("bedrooms"), "-1").ok, false);
  assert.equal(normaliseValue(f("monthly_rate"), "200000").ok, false);
  assert.equal(normaliseValue(f("monthly_rate"), "abc").ok, false);
  assert.deepEqual(normaliseValue(f("monthly_rate"), ""), { ok: true, value: null });
  assert.deepEqual(normaliseValue(f("monthly_rate"), null), { ok: true, value: null });
});

test("dates: real calendar dates between 2020 and 2035 only", () => {
  assert.deepEqual(normaliseValue(f("next_availability"), "2026-11-01"), { ok: true, value: "2026-11-01" });
  assert.equal(normaliseValue(f("next_availability"), "2026-02-30").ok, false);
  assert.equal(normaliseValue(f("next_availability"), "11/01/2026").ok, false);
  assert.equal(normaliseValue(f("next_availability"), "0026-11-01").ok, false);
  assert.equal(normaliseValue(f("next_availability"), "2206-11-01").ok, false);
});

test("yes/no, links and notes", () => {
  assert.deepEqual(normaliseValue(f("pet_status"), "yes"), { ok: true, value: "Yes" });
  assert.deepEqual(normaliseValue(f("furnished"), "No"), { ok: true, value: "No" });
  assert.equal(normaliseValue(f("pet_status"), "maybe").ok, false);
  assert.deepEqual(normaliseValue(f("property_link"), " https://example.com/x "), { ok: true, value: "https://example.com/x" });
  assert.equal(normaliseValue(f("property_link"), "javascript:alert(1)").ok, false);
  assert.equal(normaliseValue(f("property_link"), "example.com").ok, false);
  assert.deepEqual(normaliseValue(f("property_link"), "HTTPS://Example.com/A"), { ok: true, value: "https://Example.com/A" });
  assert.equal(normaliseValue(f("property_link"), "http:example.com").ok, false);
  assert.deepEqual(normaliseValue(f("notes"), "Line one\r\nLine two​"), { ok: true, value: "Line one\nLine two" });
  assert.equal(normaliseValue(f("notes"), "x".repeat(2001)).ok, false);
  assert.deepEqual(normaliseValue(f("notes"), "   "), { ok: true, value: null });
});

test("request: needs a name and at least one known field; base is normalised alongside", () => {
  assert.deepEqual(parseEditRequest({ editor: "  Will  ", changes: { monthly_rate: "2,400" }, base: { monthly_rate: 2200 } }), {
    ok: true, editor: "Will", changes: { monthly_rate: 2400 }, base: { monthly_rate: 2200 },
  });
  assert.equal(parseEditRequest({ editor: "", changes: { monthly_rate: 1 } }).ok, false);
  assert.equal(parseEditRequest({ editor: "x".repeat(81), changes: { monthly_rate: 1 } }).ok, false);
  assert.equal(parseEditRequest({ editor: "https://evil", changes: { monthly_rate: 1 } }).ok, false);
  assert.equal(parseEditRequest({ editor: "Will", changes: {} }).ok, false);
  assert.equal(parseEditRequest({ editor: "Will", changes: { owner_phone: "1" } }).ok, false);
  assert.equal(parseEditRequest({ editor: "Will", changes: { availability: "Available Now" } }).ok, false);
  assert.equal(parseEditRequest({ editor: "Will", changes: { monthly_rate: "lots" } }).ok, false);
  assert.equal(parseEditRequest([]).ok, false);
  assert.equal(parseEditRequest(null).ok, false);
});

test("Monday column values: the formats change_multiple_column_values takes", () => {
  assert.deepEqual(
    mondayColumnValues({ monthly_rate: 2400, next_availability: "2026-11-01", pet_status: "Yes", notes: "Hi", property_link: "https://a.b", bedrooms: null }),
    {
      numeric_mm44b6ew: "2400",
      date_mm4416ne: { date: "2026-11-01" },
      dropdown_mm3ywgac: { labels: ["Yes"] },
      long_text_mm4jpg99: { text: "Hi" },
      text_mm3ykmnv: "https://a.b",
      numeric_mm44r6x9: null,
    },
  );
  assert.deepEqual(mondayColumnValues({ next_availability: null, pet_status: null, notes: null }), {
    date_mm4416ne: null, dropdown_mm3ywgac: null, long_text_mm4jpg99: null,
  });
});

test("Monday column values: every clear is a JSON null (an empty string on a numbers column does not clear it)", () => {
  const all = Object.fromEntries(EDIT_FIELDS.map((x) => [x.key, null]));
  const out = mondayColumnValues(all);
  // The address is the pin: it is never cleared, so a null address writes nothing.
  const clearable = EDIT_FIELDS.filter((x) => x.kind !== "address");
  assert.equal(Object.keys(out).length, clearable.length);
  for (const x of clearable) assert.equal(out[x.column], null, `${x.key} must clear with null`);
  assert.equal(mondayColumnValues({ bedrooms: 0 }).numeric_mm44r6x9, "0", "a real zero is still sent as 0");
});

test("base: a value Monday holds that would not validate stays comparable, so it is not a conflict for ever", () => {
  const p = parseEditRequest({ editor: "Will", changes: { pet_status: "Yes", bedrooms: 3, next_availability: "2026-11-01" }, base: { pet_status: "N/D", bedrooms: 3.5, next_availability: "2019-05-01" } });
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.deepEqual(p.base, { pet_status: "N/D", bedrooms: "3.5", next_availability: "2019-05-01" });
  const current = {
    pet_status: fromMondayText(f("pet_status"), "N/D"),
    bedrooms: fromMondayText(f("bedrooms"), "3.5"),
    next_availability: fromMondayText(f("next_availability"), "2019-05-01"),
  };
  assert.deepEqual(conflicts(p.base, current), []);
  const odd = parseEditRequest({ editor: "Will", changes: { pet_status: "Yes" }, base: { pet_status: { x: 1 } } });
  assert.deepEqual(odd.ok && odd.base, { pet_status: null });
});

test("current values from the mirror and from Monday's text compare equal to an edit", () => {
  assert.equal(currentValue(f("monthly_rate"), { monthly_rate: "2400" }), 2400);
  assert.equal(currentValue(f("pet_status"), { pet_status: "N/D" }), "N/D");
  assert.equal(currentValue(f("next_availability"), { next_availability: null }), null);
  assert.equal(fromMondayText(f("monthly_rate"), "2400"), 2400);
  assert.equal(fromMondayText(f("next_availability"), "2026-10-26"), "2026-10-26");
  assert.equal(fromMondayText(f("notes"), ""), null);
  assert.ok(sameValue(2400, 2400.001));
  assert.ok(sameValue(null, undefined));
  assert.ok(!sameValue("Yes", "No"));
});

test("diff lines for the Monday note, conflicts for the 409", () => {
  assert.deepEqual(
    diffLines({ monthly_rate: 2400, pet_status: "Yes", next_availability: "2026-11-01" }, { monthly_rate: 2200, pet_status: "Yes", next_availability: null }),
    ["Next availability: blank → Nov 1, 2026", "Monthly rent: $2,200 → $2,400"],
  );
  assert.deepEqual(conflicts({ monthly_rate: 2200, bedrooms: 3 }, { monthly_rate: 2300, bedrooms: 3 }), ["monthly_rate"]);
  assert.equal(displayValue(f("notes"), "x".repeat(80)).length <= 62, true);
});

test("request source: a Quo call id is kept; anything else is dropped without failing the edit", () => {
  const ok = parseEditRequest({ editor: "Will", changes: { monthly_rate: 2400 }, source: { kind: "quo_call", callId: "ACa29ee906a4e04312" } });
  assert.deepEqual(ok.ok && ok.source, { kind: "quo_call", callId: "ACa29ee906a4e04312" });
  for (const source of [{ kind: "quo_call", callId: "not a call" }, { kind: "other", callId: "ACa29ee906a4e04312" }, "AC123", null]) {
    const p = parseEditRequest({ editor: "Will", changes: { monthly_rate: 2400 }, source });
    assert.equal(p.ok, true);
    assert.equal(p.ok && "source" in p, false);
  }
});

const PLACE = { address: " 1601 E Marshall St, Tulsa, OK 74106, USA ", lat: 36.1712345678, lng: -95.9598765432, city: "Tulsa", state: "OK", zipcode: "74106" };
const PICKED = { address: "1601 E Marshall St, Tulsa, OK 74106, USA", lat: 36.1712346, lng: -95.9598765, city: "Tulsa", state: "OK", zipcode: "74106" };

test("address: a picked place (object or the form's JSON) is cleaned and rounded; typed text and blanks are refused", () => {
  assert.deepEqual(normaliseValue(f("address"), PLACE), { ok: true, value: PICKED });
  assert.deepEqual(normaliseValue(f("address"), JSON.stringify(PLACE)), { ok: true, value: PICKED });
  // Parts are optional and dropped when empty; nothing else is kept.
  assert.deepEqual(normaliseValue(f("address"), { address: "1 Main St", lat: 1, lng: 2, city: "", state: null, placeId: "x" }), { ok: true, value: { address: "1 Main St", lat: 1, lng: 2 } });
  for (const bad of ["1601 E Marshall", "", null, undefined, "{not json", { address: "", lat: 1, lng: 2 }, { lat: 1, lng: 2 }]) {
    const r = normaliseValue(f("address"), bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    if (!r.ok) assert.equal(r.error, "Pick an address from the suggestions");
  }
  // Monday's limits: latitude strictly inside ±90, longitude within ±180.
  for (const [lat, lng] of [[90, 0], [-90, 0], [0, 181], [Number.NaN, 0], ["abc", 0]]) assert.equal(normaliseValue(f("address"), { address: "x", lat, lng }).ok, false, `${lat},${lng}`);
  assert.equal(normaliseValue(f("address"), { address: "x", lat: 0, lng: 180 }).ok, true);
  assert.equal(normaliseValue(f("address"), { address: "x".repeat(301), lat: 0, lng: 0 }).ok, false);
  assert.equal(normaliseValue(f("address"), { address: "x", lat: 0, lng: 0, city: "y".repeat(101) }).ok, false);
  assert.equal(normaliseValue(f("address"), { address: "x", lat: 0, lng: 0, city: 5 }).ok, false);
});

test("address: compared by text, spacing and case aside; shown as its text; the pin never conflicts by itself", () => {
  assert.equal(sameValue(PICKED, "1601 e marshall st,  tulsa, ok 74106, usa"), true);
  assert.equal(sameValue(PICKED, { ...PICKED, lat: 1, lng: 1 }), true);
  assert.equal(sameValue(PICKED, "Los Angeles, CA"), false);
  assert.equal(sameValue(null, "Los Angeles, CA", f("address")), false);
  assert.equal(sameValue("a b", "A  B", f("address")), true);
  assert.equal(sameValue("a b", "A  B"), false); // other fields compare text exactly
  assert.equal(displayValue(f("address"), PICKED), PICKED.address);
  assert.equal(displayValue(f("address"), null), "blank");
  assert.deepEqual(diffLines({ address: PICKED }, { address: "Los Angeles, CA" }), ["Address: Los Angeles, CA → 1601 E Marshall St, Tulsa, OK 74106, USA"]);
  assert.deepEqual(diffLines({ address: PICKED }, { address: "1601 E Marshall St, Tulsa, OK 74106, USA" }), []);
  assert.deepEqual(conflicts({ address: "Los Angeles, CA" }, { address: "los angeles, ca" }), []);
  assert.deepEqual(conflicts({ address: "Los Angeles, CA" }, { address: "Tulsa, OK" }), ["address"]);
  assert.deepEqual(conflicts({ address: null }, { address: null }), []);
});

test("address: the record's value needs a pin; Monday's location column reads back as text", () => {
  assert.deepEqual(currentValue(f("address"), { address: "1 Main St", lat: 1, lng: 2 }), { address: "1 Main St", lat: 1, lng: 2 });
  assert.deepEqual(currentValue(f("address"), { address: null, lat: 1, lng: 2 }), { address: "", lat: 1, lng: 2 });
  assert.equal(currentValue(f("address"), { address: "Tulsa, OK", lat: null, lng: null }), null);
  assert.equal(fromMondayText(f("address"), " 1 Main St "), "1 Main St");
  assert.equal(fromMondayText(f("address"), ""), null);
});

test("address: Monday gets the location column (numbers as strings) plus the City / State / Zip columns; never a clear", () => {
  assert.deepEqual(mondayColumnValues({ address: PICKED }), {
    location_mm416w07: { lat: "36.1712346", lng: "-95.9598765", address: PICKED.address },
    text_mm3yzy0x: "Tulsa", text_mm3yw9nf: "OK", text_mm3y5tq6: "74106",
  });
  assert.deepEqual(mondayColumnValues({ address: { address: "1 Main St", lat: 1, lng: 2 } }), { location_mm416w07: { lat: "1", lng: "2", address: "1 Main St" } });
  assert.deepEqual(mondayColumnValues({ address: null }), {});
});

test("address: the request carries the place; its base is compared as text", () => {
  const r = parseEditRequest({ editor: "Lou", changes: { address: PLACE }, base: { address: { address: "Los Angeles, CA", lat: 34, lng: -118 } } });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.changes, { address: PICKED });
    assert.deepEqual(r.base, { address: "Los Angeles, CA" });
  }
  const r2 = parseEditRequest({ editor: "Lou", changes: { address: PLACE }, base: { address: "" } });
  assert.ok(r2.ok && r2.base.address === null);
  const r3 = parseEditRequest({ editor: "Lou", changes: { address: "1601 E Marshall" }, base: {} });
  assert.equal(r3.ok, false);
  const r4 = parseEditRequest({ editor: "Lou", changes: { address: null }, base: {} });
  assert.equal(r4.ok, false);
});
