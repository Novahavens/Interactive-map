import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_AGENT, canSubmit, claimCounts, homeActions, homeStep, parseAgentEvent, toAgentState } from "../../lib/agent-graph.ts";

const answer = {
  ok: true,
  claim_key: "nearsite:90001",
  state: {
    stage: "ready",
    label: "Ready to submit",
    waiting_on: null,
    homes: {
      "111": { status: "suggested", label: "Suggested", waiting_on: "a person to tick or X", draft: null },
      "222": { status: "accepted", label: "Accepted", waiting_on: null, draft: "Hi! This is the housing team." },
      "333": { status: "ready", label: "Ready", waiting_on: null },
      bad: { label: "no status" },
    },
    held: ["w1", "w2"],
  },
};

test("toAgentState reads the projection and drops malformed homes", () => {
  const st = toAgentState(answer);
  assert.equal(st.enabled, true);
  assert.equal(st.claimKey, "nearsite:90001");
  assert.equal(st.stage, "ready");
  assert.deepEqual(Object.keys(st.homes), ["111", "222", "333"]);
  assert.equal(st.homes["222"].draft, "Hi! This is the housing team.");
  assert.equal(st.homes["333"].draft, null);
  assert.equal(st.held, 2);
});

test("toAgentState: a refusal or an unknown claim reads as not running", () => {
  for (const d of [null, { ok: false, error: "forbidden" }, { ok: true, claim_key: null, state: null }, "x"]) {
    const st = toAgentState(d);
    assert.equal(st.enabled, true);
    assert.equal(st.claimKey, null);
    assert.deepEqual(st.homes, {});
  }
  assert.equal(NO_AGENT.enabled, false);
});

test("homeActions: tick or X only when suggested; message once accepted; hand back when it needs a person", () => {
  assert.deepEqual(homeActions("suggested"), { pick: true, message: false, sendBack: false });
  assert.deepEqual(homeActions("accepted"), { pick: false, message: true, sendBack: false });
  assert.deepEqual(homeActions("needs_person"), { pick: false, message: false, sendBack: true });
  assert.deepEqual(homeActions("verified"), { pick: false, message: false, sendBack: false });
  assert.deepEqual(homeActions(undefined), { pick: false, message: false, sendBack: false });
});

test("Submit shows only when the claim is ready", () => {
  const st = toAgentState(answer);
  assert.equal(canSubmit(st), true);
  assert.equal(canSubmit({ ...st, stage: "sourcing" }), false);
  assert.equal(canSubmit(NO_AGENT), false);
});

test("homeStep and claimCounts", () => {
  const st = toAgentState(answer);
  assert.equal(homeStep(st, "111")?.status, "suggested");
  assert.equal(homeStep(st, "999"), null);
  assert.equal(homeStep(null, "111"), null);
  assert.deepEqual(claimCounts(st), { homes: 3, needYou: 1, ready: 1 });
});

test("parseAgentEvent accepts only the four decisions a person can make", () => {
  assert.deepEqual(parseAgentEvent({ type: "submit_pressed" }), { ok: true, type: "submit_pressed", homeKey: null, payload: {} });
  assert.deepEqual(parseAgentEvent({ type: "human_pick", homeKey: "111", decision: "accept" }), {
    ok: true, type: "human_pick", homeKey: "111", payload: { decision: "accept" },
  });
  assert.deepEqual(parseAgentEvent({ type: "person_action", homeKey: "111", action: "resume", resumeTo: "verified" }), {
    ok: true, type: "person_action", homeKey: "111", payload: { action: "resume", resume_to: "verified" },
  });
  assert.equal(parseAgentEvent({ type: "person_action", homeKey: "111", action: "drop" }).ok, true);
  for (const bad of [
    null,
    [],
    { type: "send_text" },
    { type: "human_pick", homeKey: "111", decision: "maybe" },
    { type: "human_pick", homeKey: "../x", decision: "accept" },
    { type: "human_pick", decision: "accept" },
    { type: "person_action", homeKey: "111", action: "resume", resumeTo: "submitted" },
    { type: "person_action", homeKey: "111", action: "delete" },
  ]) {
    assert.equal(parseAgentEvent(bad).ok, false, JSON.stringify(bad));
  }
});
