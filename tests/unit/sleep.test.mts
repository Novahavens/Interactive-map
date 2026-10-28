import { test } from "node:test";
import assert from "node:assert/strict";
import { sleep } from "../../lib/sleep.ts";

test("sleep: waits the full time without a signal, or with one that doesn't fire", async () => {
  let t = Date.now();
  assert.equal(await sleep(60), true);
  assert.ok(Date.now() - t >= 55);
  t = Date.now();
  assert.equal(await sleep(60, AbortSignal.timeout(5_000)), true);
  assert.ok(Date.now() - t < 1_000);
});

test("sleep: ends early, false, when the signal aborts during the wait (the retry pause can't overrun a deadline)", async () => {
  const t = Date.now();
  assert.equal(await sleep(1_200, AbortSignal.timeout(50)), false);
  assert.ok(Date.now() - t < 500, `took ${Date.now() - t} ms`);
});

test("sleep: false at once for an already-aborted signal", async () => {
  const c = new AbortController();
  c.abort();
  const t = Date.now();
  assert.equal(await sleep(1_000, c.signal), false);
  assert.ok(Date.now() - t < 50);
});
