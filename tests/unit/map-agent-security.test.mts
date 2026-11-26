import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSay, toClaimContext } from "../../lib/map-agent.ts";

test("cleanSay: a phone number or an email in the agent's words is redacted", () => {
  assert.equal(cleanSay("Call the tenant on (918) 555-0142 about the lease."), "Call the tenant on [number removed] about the lease.");
  assert.equal(cleanSay("Email marisol.v@example.com for the file."), "Email [email removed] for the file.");
  assert.equal(cleanSay("Try +1 918-555-0199 or 9185550100."), "Try [number removed] or [number removed].");
});

test("cleanSay: ordinary numbers in the agent's words are kept", () => {
  assert.equal(cleanSay("1418 Juniper Ct, 3 bd, $2,400 a month, 9 homes · 3 new."), "1418 Juniper Ct, 3 bd, $2,400 a month, 9 homes · 3 new.");
});

test("toClaimContext: the in-run flag is read; a missing flag counts as not in the search", () => {
  const withRun = toClaimContext({ known: true, listing: { found: true, in_run: true, on_claim: false, address_known: true } });
  assert.equal(withRun.listing?.inRun, true);
  const without = toClaimContext({ known: true, listing: { found: true, address_known: true } });
  assert.equal(without.listing?.inRun, false);
  assert.equal(toClaimContext({ known: false }).known, false);
});
