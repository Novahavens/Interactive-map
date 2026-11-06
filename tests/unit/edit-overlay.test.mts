import { test } from "node:test";
import assert from "node:assert/strict";
import { overlayDetail } from "../../lib/edit-overlay.ts";

test("overlay: changes replace fields; move_in_total follows the costs like the generated column", () => {
  const detail = { monthly_rate: 2000, security_deposit: 500, pet_rent: 50, other_fee_1: "25", move_in_total: 2525, notes: "a" };
  const out = overlayDetail(detail, { monthly_rate: 2400, pet_rent: 75 });
  assert.equal(out.monthly_rate, 2400);
  assert.equal(out.pet_rent, 75);
  assert.equal(out.move_in_total, 2925, "rent + deposit + other fee; pet rent is not part of it");
  assert.equal(detail.monthly_rate, 2000, "the input is not mutated");
});

test("overlay: clearing a cost counts it as 0; a change to no cost leaves move_in_total alone", () => {
  assert.equal(overlayDetail({ monthly_rate: 2000, security_deposit: 500, move_in_total: 2500 }, { security_deposit: null }).move_in_total, 2000);
  const same = overlayDetail({ monthly_rate: 2000, move_in_total: 9999, notes: "a" }, { notes: null, pet_rent: 10 });
  assert.equal(same.move_in_total, 9999);
  assert.equal(same.notes, null);
});

test("an address lands on the record's own columns and marks the pin exact", () => {
  const before = { address: "Los Angeles, CA", city: "Los Angeles", state: "CA", zipcode: null, lat: 34, lng: -118, geocode_status: "ok", location_precision: "approximate", monthly_rate: 2200 };
  const after = overlayDetail(before, { address: { address: "1 Main St, Tulsa, OK 74106, USA", lat: 36.1, lng: -95.9, city: "Tulsa", state: "OK" }, monthly_rate: 2400 });
  assert.deepEqual(after, { address: "1 Main St, Tulsa, OK 74106, USA", city: "Tulsa", state: "OK", zipcode: null, lat: 36.1, lng: -95.9, geocode_status: "ok", location_precision: "exact", monthly_rate: 2400, move_in_total: 2400 });
});
