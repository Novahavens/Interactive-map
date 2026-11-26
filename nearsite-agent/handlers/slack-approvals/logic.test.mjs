import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySlack, toApprovalRow, statusLine } from "./logic.mjs";

const APPROVERS = { U00000000A1: "william", U00000000B2: "lou" };
const press = (user, action, batch = "b1", block = `nearsite_approval:${batch}`) => ({
  type: "block_actions", user: { id: user }, actions: [{ action_id: action, value: batch, block_id: block }],
});
const sign = (secret, ts, body) => "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex");

test("valid Slack signature passes, tampered or stale fails", async () => {
  const body = "payload=%7B%7D", ts = "1790000000";
  const sig = sign("s3cret", ts, body);
  assert.equal((await verifySlack({ signingSecret: "s3cret", timestamp: ts, signature: sig, rawBody: body, nowSec: 1790000010 })).ok, true);
  assert.equal((await verifySlack({ signingSecret: "s3cret", timestamp: ts, signature: sig, rawBody: body + "x", nowSec: 1790000010 })).ok, false);
  assert.equal((await verifySlack({ signingSecret: "s3cret", timestamp: ts, signature: sig, rawBody: body, nowSec: 1790000400 })).ok, false);
  assert.equal((await verifySlack({ signingSecret: "", timestamp: ts, signature: sig, rawBody: body, nowSec: 1790000010 })).ok, false);
});

test("only William and Lou can approve", () => {
  assert.deepEqual(toApprovalRow(press("U00000000A1", "approve"), APPROVERS).row,
    { batch_id: "b1", person: "william", action: "approve", slack_user: "U00000000A1" });
  assert.equal(toApprovalRow(press("U00000000B2", "hold"), APPROVERS).row.person, "lou");
  assert.match(toApprovalRow(press("UOTHER", "approve"), APPROVERS).refuse, /only William and Lou/);
});

test("bad presses are refused", () => {
  assert.ok(toApprovalRow(press("U00000000A1", "delete"), APPROVERS).refuse);
  assert.ok(toApprovalRow(press("U00000000A1", "approve", "b1", "other_card:b1"), APPROVERS).refuse);
  assert.ok(toApprovalRow(press("U00000000A1", "approve", "b1", "nearsite_approval:b2"), APPROVERS).refuse);
  assert.ok(toApprovalRow({ type: "view_submission" }, APPROVERS).refuse);
});

test("both must approve; the latest press per person counts", () => {
  const req = ["william", "lou"];
  assert.equal(statusLine([{ person: "william", action: "approve" }], req, {}).allApproved, false);
  assert.equal(statusLine([{ person: "william", action: "approve" }, { person: "lou", action: "approve" }], req, {}).allApproved, true);
  assert.equal(statusLine([{ person: "william", action: "approve" }, { person: "lou", action: "approve" }, { person: "lou", action: "hold" }], req, {}).allApproved, false);
});
