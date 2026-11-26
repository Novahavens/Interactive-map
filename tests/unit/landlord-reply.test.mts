import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LANDLORD_REPLY_OFF, GeocoderError, addressWrite, extractedRecord, geocodeStreet, interpretPrepare, interpretSave, normalizePhone,
  parseCensusMatch, parseLandlordReply, planReply, replyFingerprint, replyResponse, samePhone, sameStreet, oneLine,
} from "../../lib/landlord-reply.ts";

const NONE = { addressLine: null, unit: null, city: null, state: null, zip: null };

test("a normal reply: street, city, state, zip, and the phone for the record", () => {
  const r = parseLandlordReply("Sure! It's 1234 N Harvard Ave, Tulsa, OK 74136. Call me at (918) 555-0100.");
  assert.equal(r.status, "address");
  assert.deepEqual(r.address, { addressLine: "1234 N Harvard Ave", houseNumber: "1234", unit: null, city: "Tulsa", state: "OK", zip: "74136" });
  assert.deepEqual(r.phones, ["+19185550100"]);
  assert.equal(r.candidates, 1);
});

test("a unit after the street (Apt, #) is kept; the street stays as typed", () => {
  const apt = parseLandlordReply("123 Main St Apt 4B, Tulsa OK 74104");
  assert.equal(apt.address?.unit, "4B");
  assert.equal(apt.address?.addressLine, "123 Main St");
  const hash = parseLandlordReply("456 Oak Ave #12, Tulsa, OK 74105");
  assert.equal(hash.address?.unit, "12");
  assert.equal(hash.address?.addressLine, "456 Oak Ave");
});

test("a house number that is not in the text is rejected", () => {
  assert.equal(parseLandlordReply("It is on Main St, Tulsa OK 74104").status, "no_address");
  assert.equal(parseLandlordReply("It is on Five Main St, Tulsa OK 74104").status, "no_address");
  // The five digits of the zip are not a house number.
  assert.equal(parseLandlordReply("Harvard Ave, Tulsa OK 74136").status, "no_address");
});

test("two different addresses are rejected as ambiguous; the same address twice is one", () => {
  const two = parseLandlordReply("123 Main St, Tulsa OK 74104 or 456 Oak Ave, Tulsa OK 74105");
  assert.equal(two.status, "ambiguous");
  assert.equal(two.address, null);
  assert.equal(two.candidates, 2);
  const same = parseLandlordReply("123 Main St, Tulsa OK 74104. Yes, 123 Main Street is the one.");
  assert.equal(same.status, "address");
  assert.equal(same.candidates, 1);
});

test("a bad state code is dropped, the zip and city stay", () => {
  const r = parseLandlordReply("123 Main St, Tulsa, XX 74104");
  assert.equal(r.status, "address");
  assert.equal(r.address?.state, null);
  assert.equal(r.address?.city, "Tulsa");
  assert.equal(r.address?.zip, "74104");
});

test("a phone that does not match is recorded and does not change the address", () => {
  const r = parseLandlordReply("123 Main St, Tulsa OK 74104. The other line is 918-555-0199.");
  assert.equal(r.status, "address");
  assert.deepEqual(r.phones, ["+19185550199"]);
  assert.equal(samePhone(r.phones[0] ?? null, "+19185550100"), false);
  assert.equal(samePhone("+19185550100", "(918) 555-0100"), true);
  assert.equal(samePhone(null, "+19185550100"), false);
});

test("a reply with a phone but no address: nothing is written", () => {
  const r = parseLandlordReply("Call me at 918-555-0100 after 5.");
  assert.equal(r.status, "no_address");
  assert.equal(r.address, null);
  assert.deepEqual(r.phones, ["+19185550100"]);
});

test("an empty reply", () => {
  for (const v of ["", "   \n\t ", null, undefined, 42]) {
    const r = parseLandlordReply(v);
    assert.equal(r.status, "empty", String(v));
    assert.equal(r.address, null);
  }
});

test("an address with a city only: accepted, but the map cannot place it without a state or zip", () => {
  const r = parseLandlordReply("123 Main St, Tulsa.");
  assert.equal(r.status, "address");
  assert.equal(r.address?.city, "Tulsa");
  assert.equal(r.address?.state, null);
  assert.equal(r.address?.zip, null);
  assert.deepEqual(planReply(r, NONE), { outcome: "needs_city_or_zip", address: r.address, geocode: null });
});

test("ordinal and numbered streets, and a price before the street are not confused", () => {
  assert.equal(parseLandlordReply("2101 E 21st St, Tulsa OK 74114").address?.addressLine, "2101 E 21st St");
  assert.equal(parseLandlordReply("Rent is $2,400 at 555 Pine Rd, Tulsa OK 74104").address?.addressLine, "555 Pine Rd");
  assert.equal(parseLandlordReply("Apt 4 at 12 Oak St, Tulsa OK 74104").address?.addressLine, "12 Oak St");
});

test("a state code written in lower case with no zip is not taken as the state", () => {
  const r = parseLandlordReply("123 Main St, Tulsa, it's ok to call");
  assert.equal(r.address?.state, null);
});

test("the plan: a new street with a zip asks for a geocode; the one-line address is the reply's own", () => {
  const r = parseLandlordReply("123 Main St, Tulsa, OK 74104");
  const plan = planReply(r, NONE);
  assert.equal(plan.outcome, "address_saved");
  assert.deepEqual(plan.geocode, { oneLine: "123 Main St, Tulsa, OK 74104", houseNumber: "123" });
  assert.equal(oneLine(r.address as NonNullable<typeof r.address>), "123 Main St, Tulsa, OK 74104");
});

test("never overwrite: a listing that has a street keeps it; the same street is recognised", () => {
  const r = parseLandlordReply("It's 123 Main Street, Tulsa OK 74104");
  const same = planReply(r, { ...NONE, addressLine: "123 Main St", city: "Tulsa", zip: "74104" });
  assert.equal(same.outcome, "same_address");
  assert.equal(same.geocode, null);
  const other = planReply(parseLandlordReply("456 Oak Ave, Tulsa OK 74105"), { ...NONE, addressLine: "123 Main St" });
  assert.equal(other.outcome, "kept_existing");
  assert.equal(other.geocode, null);
  assert.equal(sameStreet("123 Main Street", "123 main st."), true);
  assert.equal(sameStreet("123 Main St", "1230 Main St"), false);
});

test("no street, several streets and an empty reply plan to a final outcome with no geocode", () => {
  assert.equal(planReply(parseLandlordReply("Call me"), NONE).outcome, "no_address");
  assert.equal(planReply(parseLandlordReply("1 Oak St or 2 Elm St, Tulsa OK 74104"), NONE).outcome, "ambiguous");
  const e = planReply(parseLandlordReply(""), NONE);
  assert.deepEqual(e, { outcome: "empty", address: null, geocode: null });
});

test("the fingerprint ignores case and spacing, and differs for different text", () => {
  const a = replyFingerprint("123 Main St,  Tulsa OK 74104");
  assert.equal(a, replyFingerprint("123 main st, tulsa ok 74104 "));
  assert.notEqual(a, replyFingerprint("123 Main St, Tulsa OK 74105"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("phones: US numbers only, as +1 and ten digits", () => {
  assert.equal(normalizePhone("(918) 555-0100"), "+19185550100");
  assert.equal(normalizePhone("+1 918.555.0100"), "+19185550100");
  assert.equal(normalizePhone("1-918-555-0100"), "+19185550100");
  assert.equal(normalizePhone("555-0100"), null);
});

test("the Census match: the same house number only, coordinates x = lng and y = lat", () => {
  const ok = {
    result: { addressMatches: [{ matchedAddress: "1234 N HARVARD AVE, TULSA, OK, 74136", coordinates: { x: -95.9, y: 36.1 } }] },
  };
  assert.deepEqual(parseCensusMatch(ok, "1234"), { lat: 36.1, lng: -95.9 });
  const neighbour = { result: { addressMatches: [{ matchedAddress: "1230 N HARVARD AVE, TULSA, OK", coordinates: { x: -95.9, y: 36.1 } }] } };
  assert.equal(parseCensusMatch(neighbour, "1234"), null);
  assert.equal(parseCensusMatch({ result: { addressMatches: [] } }, "1234"), null);
  assert.equal(parseCensusMatch({ result: {} }, "1234"), null);
  assert.equal(parseCensusMatch(null, "1234"), null);
  const badXY = { result: { addressMatches: [{ matchedAddress: "1234 N HARVARD AVE", coordinates: { x: "nope", y: 36 } }] } };
  assert.equal(parseCensusMatch(badXY, "1234"), null);
});

test("the Census lookup: a no-match is final (null); a failed lookup throws so nothing is saved", async () => {
  const seen: string[] = [];
  const fetchOk = async (url: string | URL | Request) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: "123 MAIN ST, TULSA, OK, 74104", coordinates: { x: -95.97, y: 36.15 } }] } }), { status: 200 });
  };
  const got = await geocodeStreet({ oneLine: "123 Main St, Tulsa, OK 74104", houseNumber: "123" }, fetchOk as typeof fetch);
  assert.deepEqual(got, { lat: 36.15, lng: -95.97 });
  assert.equal(seen.length, 1);
  assert.ok(seen[0]?.startsWith("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address="));
  assert.ok(seen[0]?.includes(encodeURIComponent("123 Main St, Tulsa, OK 74104")));

  const noMatch = async () => new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200 });
  assert.equal(await geocodeStreet({ oneLine: "x", houseNumber: "1" }, noMatch as typeof fetch), null);

  const down = async () => new Response("", { status: 503 });
  await assert.rejects(geocodeStreet({ oneLine: "x", houseNumber: "1" }, down as typeof fetch), GeocoderError);
  const broken = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(geocodeStreet({ oneLine: "x", houseNumber: "1" }, broken as typeof fetch), GeocoderError);
});

test("the write: approximate precision (Census interpolates), only the address fields", () => {
  const r = parseLandlordReply("123 Main St Apt 2, Tulsa OK 74104");
  assert.deepEqual(addressWrite(r.address as NonNullable<typeof r.address>, { lat: 36.1, lng: -95.9 }), {
    address_line: "123 Main St", unit: "2", city: "Tulsa", state: "OK", zip: "74104", lat: 36.1, lng: -95.9, precision: "approx",
  });
});

test("the stored record: no full reply, and the phone and address only as the record needs", () => {
  const r = parseLandlordReply("123 Main St, Tulsa OK 74104 call 918-555-0100 thanks");
  const rec = extractedRecord(r, "address_saved", true);
  assert.equal(rec.phone, "+19185550100");
  assert.equal(rec.placed, true);
  assert.equal(JSON.stringify(rec).includes("thanks"), false);
});

test("duplicate handling: a reply already recorded for this home answers duplicate and writes nothing", () => {
  const prepared = interpretPrepare({ ok: true, found: true, source: "furnished_finder", address_line: null, recorded: true, host_phone: null });
  assert.equal(prepared.kind, "ready");
  if (prepared.kind !== "ready") return;
  assert.equal(prepared.recorded, true);
  const dup = interpretSave({ ok: true, found: true, status: "duplicate", address_written: false, address_line: null });
  assert.equal(dup.kind, "duplicate");
  if (dup.kind !== "duplicate") return;
  const out = replyResponse("address_saved", { duplicate: true, addressWritten: false, address: null, propertyItemId: null, possibleDuplicates: 0 });
  assert.equal(out.outcome, "duplicate");
  assert.equal(out.duplicate, true);
  assert.equal(out.addressWritten, false);
});

test("a street that appeared between the check and the save is reported as kept, not saved", () => {
  const saved = interpretSave({
    ok: true, found: true, status: "saved", outreach_id: "00000000-0000-4000-8000-000000000001", address_written: false,
    address_line: "999 Elm St", unit: null, city: "Tulsa", state: "OK", zip: "74104", property_item_id: null,
    possible_duplicates: [], property_db_matches: [],
  });
  assert.equal(saved.kind, "saved");
  if (saved.kind !== "saved") return;
  const out = replyResponse("address_saved", { duplicate: false, addressWritten: saved.addressWritten, address: saved.address, propertyItemId: null, possibleDuplicates: 0 });
  assert.equal(out.outcome, "kept_existing");
  assert.equal(out.address?.addressLine, "999 Elm St");
});

test("a written address on a home with a PROPERTY DATABASE item asks for a copy, and flags duplicates", () => {
  const saved = interpretSave({
    ok: true, found: true, status: "saved", outreach_id: "00000000-0000-4000-8000-000000000002", address_written: true,
    address_line: "123 Main St", unit: null, city: "Tulsa", state: "OK", zip: "74104", property_item_id: "13640003123",
    possible_duplicates: ["00000000-0000-4000-8000-000000000009"], property_db_matches: [],
  });
  assert.equal(saved.kind, "saved");
  if (saved.kind !== "saved") return;
  assert.equal(saved.possibleDuplicates, 1);
  const out = replyResponse("address_saved", { duplicate: false, addressWritten: true, address: saved.address, propertyItemId: saved.propertyItemId, possibleDuplicates: saved.possibleDuplicates });
  assert.equal(out.outcome, "address_saved");
  assert.equal(out.copyToPropertyDb, true);
  assert.equal(out.possibleDuplicates, 1);
  const noItem = replyResponse("address_saved", { duplicate: false, addressWritten: true, address: saved.address, propertyItemId: null, possibleDuplicates: 0 });
  assert.equal(noItem.copyToPropertyDb, false);
});

test("the refusals: a wrong secret, a missing home and a home that is not Furnished Finder each stop the write", () => {
  assert.equal(interpretPrepare({ ok: false, error: "forbidden" }).kind, "forbidden");
  assert.equal(interpretPrepare({ ok: true, found: false }).kind, "not_found");
  assert.equal(interpretPrepare({ ok: true, found: true, source: "zillow" }).kind, "wrong_source");
  assert.equal(interpretSave({ ok: false, error: "wrong_source" }).kind, "wrong_source");
  assert.equal(interpretSave({ ok: true, found: false }).kind, "not_found");
  assert.equal(interpretSave(null).kind, "error");
  assert.equal(interpretSave({ ok: true, found: true, status: "weird" }).kind, "error");
});

test("the switched-off answer is 503 with feature_off, as the other outside routes use", () => {
  assert.equal(LANDLORD_REPLY_OFF.status, 503);
  assert.equal(LANDLORD_REPLY_OFF.body.code, "feature_off");
});
