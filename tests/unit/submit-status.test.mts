import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBMIT_STEPS,
  addedLine,
  blockedText,
  firstName,
  submitAriaLabel,
  submitCountsLabel,
  submitDate,
  submitLine,
  submitSteps,
} from "../../lib/submit-status.ts";

// Midday timestamps, so the day is the same in every time zone the tests may run in.
const base = { subitemId: "9900000201", propertyId: "9900000101", reason: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null };

test("three steps with the spec's labels, in order", () => {
  assert.deepEqual(SUBMIT_STEPS.map((s) => s.label), ["To Do", "Ready to Submit", "Option Submitted"]);
});

test("to do: step 1 is current, the rest are still to come", () => {
  assert.deepEqual(submitSteps("todo")?.map((s) => [s.phase, s.mark]), [["now", "1"], ["later", "2"], ["later", "3"]]);
  assert.equal(submitAriaLabel("todo"), "Submit status: To Do, step 1 of 3");
});

test("ready: step 1 is ticked, step 2 is current", () => {
  assert.deepEqual(submitSteps("ready")?.map((s) => [s.phase, s.mark]), [["done", "✓"], ["now", "2"], ["later", "3"]]);
  assert.equal(submitAriaLabel("ready"), "Submit status: Ready to Submit, step 2 of 3");
});

test("submitted: every step is ticked and the last is current", () => {
  assert.deepEqual(submitSteps("submitted")?.map((s) => [s.phase, s.mark]), [["done", "✓"], ["done", "✓"], ["now", "✓"]]);
  assert.equal(submitAriaLabel("submitted"), "Submit status: Option Submitted, step 3 of 3");
});

test("blocked and unknown states have no steps", () => {
  for (const s of ["blocked", "weird", "", null, undefined]) {
    assert.equal(submitSteps(s), null);
    assert.equal(submitAriaLabel(s), null);
  }
});

test("dates read as month and day; bad or missing dates are empty", () => {
  assert.equal(submitDate("2026-11-25T18:00:00.000Z"), "Nov 25");
  assert.equal(submitDate("2026-11-20"), "Nov 20");
  assert.equal(submitDate("not a date"), "");
  assert.equal(submitDate(null), "");
});

test("ready line names the approver and the day; none without an approver", () => {
  assert.equal(submitLine({ ...base, state: "ready", approvedBy: "Theo Brandt", approvedAt: "2026-11-25T18:00:00.000Z" }), "Approved by Theo Brandt · Nov 25");
  assert.equal(submitLine({ ...base, state: "ready", approvedBy: " Theo Brandt ", approvedAt: null }), "Approved by Theo Brandt");
  assert.equal(submitLine({ ...base, state: "ready" }), null);
});

test("submitted line: day first, then the approver", () => {
  const s = { ...base, state: "submitted" as const, approvedBy: "Theo Brandt", approvedAt: "2026-11-25T18:00:00.000Z", submittedBy: "Sam Sample", submittedAt: "2026-11-26T18:00:00.000Z" };
  assert.equal(submitLine(s), "Submitted Nov 26 · approved by Theo Brandt");
  assert.equal(submitLine({ ...s, approvedBy: null }), "Submitted Nov 26");
  assert.equal(submitLine({ ...s, submittedAt: null }), "Approved by Theo Brandt");
  assert.equal(submitLine({ ...s, submittedAt: null, approvedBy: null }), null);
});

test("to do, blocked and no status have no line", () => {
  assert.equal(submitLine({ ...base, state: "todo", approvedBy: "Theo Brandt" }), null);
  assert.equal(submitLine({ ...base, state: "blocked", reason: "claim_closed" }), null);
  assert.equal(submitLine(null), null);
});

test("blocked: the two reasons from the spec", () => {
  assert.deepEqual(blockedText({ reason: "claim_closed", submittedAt: null }), { head: "Blocked: claim closed.", body: "This home can't be submitted." });
  assert.deepEqual(blockedText({ reason: "Claim closed", submittedAt: null }), { head: "Blocked: claim closed.", body: "This home can't be submitted." });
  assert.deepEqual(blockedText({ reason: "already_submitted", submittedAt: "2026-11-20T18:00:00.000Z" }), { head: "Blocked: already submitted.", body: "This home was sent on Nov 20." });
  assert.deepEqual(blockedText({ reason: "already_submitted", submittedAt: null }), { head: "Blocked: already submitted.", body: "This home was already sent." });
});

test("blocked: a sentence from the back end reads on after the colon; no reason still says blocked", () => {
  assert.deepEqual(blockedText({ reason: "Availability has not been checked in the last 7 days.", submittedAt: null }), {
    head: "Blocked: availability has not been checked in the last 7 days.",
    body: "This home can't be submitted.",
  });
  assert.equal(blockedText({ reason: "FRV is missing", submittedAt: null }).head, "Blocked: FRV is missing.");
  assert.deepEqual(blockedText({ reason: null, submittedAt: null }), { head: "Blocked.", body: "This home can't be submitted." });
});

test("claim counts", () => {
  assert.equal(submitCountsLabel({ ready: 3, submitted: 2 }), "3 ready · 2 submitted");
  assert.equal(submitCountsLabel({ ready: 0, submitted: 0 }), "0 ready · 0 submitted");
  assert.equal(submitCountsLabel({ ready: 0, submitted: 0, options: 4 }), "4 to do");
  assert.equal(submitCountsLabel({ ready: 1, submitted: 0, options: 4 }), "1 ready · 0 submitted");
  assert.equal(submitCountsLabel({ ready: 0, submitted: 0, options: 0 }), "No options yet");
  assert.equal(submitCountsLabel({ ready: -1, submitted: Number.NaN }), "0 ready · 0 submitted");
  assert.equal(submitCountsLabel(null), null);
  assert.equal(submitCountsLabel(undefined), null);
});

test("added line uses the first name only", () => {
  assert.equal(firstName("  Dana Whitfield "), "Dana");
  assert.equal(firstName(""), "");
  assert.equal(addedLine("2026-11-26T18:00:00.000Z", "Dana Whitfield"), "Added Nov 26 by Dana");
  assert.equal(addedLine(new Date(2026, 10, 26, 12), null), "Added Nov 26");
});
