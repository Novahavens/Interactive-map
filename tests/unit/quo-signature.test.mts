import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MAX_AGE_SEC, verifyQuoSignature } from "../../lib/quo-signature.ts";

// A fictional key in Quo's format: whsec_ + base64 bytes.
const KEY = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
const OTHER = `whsec_${Buffer.from("fedcba9876543210fedcba9876543210").toString("base64")}`;
const sign = (key: string, id: string, ts: string, body: string) =>
  createHmac("sha256", Buffer.from(key.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");

const body = '{"id":"EV1","type":"call.completed"}';
const now = 1_793_200_000;
const ts = String(now);

test("a delivery signed with the key verifies; the raw body is what's signed", () => {
  const h = { id: "msg_1", timestamp: ts, signature: `v1,${sign(KEY, "msg_1", ts, body)}` };
  assert.equal(verifyQuoSignature(body, h, [KEY], now), true);
  assert.equal(verifyQuoSignature(body.replace("call", "cal "), h, [KEY], now), false);
  assert.equal(verifyQuoSignature(JSON.stringify(JSON.parse(body), null, 1), h, [KEY], now), false);
});

test("several signatures, several keys (a rotation): any match is enough", () => {
  const h = { id: "msg_1", timestamp: ts, signature: `v1,${sign(OTHER, "msg_1", ts, body)} v1,${sign(KEY, "msg_1", ts, body)}` };
  assert.equal(verifyQuoSignature(body, h, [KEY], now), true);
  assert.equal(verifyQuoSignature(body, { ...h, signature: `v1,${sign(OTHER, "msg_1", ts, body)}` }, [KEY, OTHER], now), true);
});

test("refused: wrong key, other id, stale or future timestamp, missing headers, no keys", () => {
  const good = { id: "msg_1", timestamp: ts, signature: `v1,${sign(KEY, "msg_1", ts, body)}` };
  assert.equal(verifyQuoSignature(body, good, [OTHER], now), false);
  assert.equal(verifyQuoSignature(body, { ...good, id: "msg_2" }, [KEY], now), false);
  assert.equal(verifyQuoSignature(body, good, [KEY], now + MAX_AGE_SEC + 1), false);
  assert.equal(verifyQuoSignature(body, good, [KEY], now - MAX_AGE_SEC - 1), false);
  assert.equal(verifyQuoSignature(body, { ...good, signature: null }, [KEY], now), false);
  assert.equal(verifyQuoSignature(body, { ...good, signature: sign(KEY, "msg_1", ts, body) }, [KEY], now), false);
  assert.equal(verifyQuoSignature(body, good, [], now), false);
  assert.equal(verifyQuoSignature(body, { ...good, timestamp: "12.5" }, [KEY], now), false);
});
