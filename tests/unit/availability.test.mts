import { test } from "node:test";
import assert from "node:assert/strict";
import { availabilityPill, localToday } from "../../lib/availability.ts";

const TODAY = "2026-10-27";
const pill = (availability: string | null, next: string | null = null, checked: string | null = null) =>
  availabilityPill({ availability, next_availability: next, availability_checked: checked }, TODAY);

test("nothing known: no pill", () => {
  assert.equal(pill(null), null);
  assert.equal(pill("   "), null);
  assert.equal(availabilityPill({}, TODAY), null);
});

test("each status gets the list-row label and its tone", () => {
  assert.deepEqual(pill("Available Now"), { label: "Available now", detail: null, tone: "ok", stale: false });
  assert.deepEqual(pill("Available Soon"), { label: "Available soon", detail: null, tone: "info", stale: false });
  assert.deepEqual(pill("Available (Unverified)"), { label: "Unverified", detail: null, tone: "muted", stale: false });
  assert.deepEqual(pill("Unavailable"), { label: "Unavailable", detail: null, tone: "bad", stale: false });
  assert.deepEqual(pill("Listing Removed"), { label: "Listing removed", detail: null, tone: "removed", stale: false });
  assert.deepEqual(pill("  available now "), { label: "Available now", detail: null, tone: "ok", stale: false });
});

test("Check Failed, blank and unknown labels read as unknown", () => {
  assert.deepEqual(pill("Check Failed"), { label: "Availability unknown", detail: null, tone: "muted", stale: false });
  assert.deepEqual(pill("Something new"), { label: "Availability unknown", detail: null, tone: "muted", stale: false });
  // Blank status, but a date is known: still a pill
  assert.deepEqual(pill(null, "2026-11-01"), { label: "Availability unknown", detail: "from Nov 1", tone: "muted", stale: false });
  assert.deepEqual(pill("", null, "2026-10-22"), { label: "Availability unknown", detail: "checked Oct 22", tone: "muted", stale: false });
});

test("detail joins the next date (today or later) and the check date", () => {
  assert.equal(pill("Available Soon", "2026-11-01", "2026-10-22")?.detail, "from Nov 1 · checked Oct 22");
  assert.equal(pill("Available Soon", TODAY)?.detail, "from Oct 27");
  assert.equal(pill("Available Now", "2026-11-01")?.detail, "from Nov 1");
  assert.equal(pill("Available Now", null, "2026-10-22T09:30:00Z")?.detail, "checked Oct 22");
  // another year carries the year
  assert.equal(pill("Available Soon", "2027-01-05", "2025-12-30")?.detail, "from Jan 5, 2027 · checked Dec 30, 2025");
});

test("a passed date is stale unless the status is settled", () => {
  for (const s of ["Available Soon", "Available (Unverified)", "Check Failed", null]) {
    const r = pill(s, "2025-03-01", "2026-10-22");
    assert.equal(r?.stale, true, String(s));
    assert.equal(r?.detail, "date passed (Mar 1, 2025) · checked Oct 22", String(s));
  }
  assert.equal(pill("Available Soon", "2026-10-26")?.detail, "date passed (Oct 26, 2026)");
  for (const s of ["Available Now", "Unavailable", "Listing Removed"]) {
    const r = pill(s, "2025-03-01", "2026-10-22");
    assert.equal(r?.stale, false, s);
    assert.equal(r?.detail, "checked Oct 22", s);
  }
  assert.deepEqual(pill("Unavailable", "2025-03-01"), { label: "Unavailable", detail: null, tone: "bad", stale: false });
});

test("unreadable dates are left out", () => {
  assert.deepEqual(pill("Available Soon", "soon", "n/a"), { label: "Available soon", detail: null, tone: "info", stale: false });
  assert.equal(pill("Available Soon", "2026-13-01")?.detail, null);
});

test("localToday is the local calendar date", () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localToday(new Date(2026, 10, 30, 0, 0)), "2026-11-30");
});
