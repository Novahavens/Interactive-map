import { test } from "node:test";
import assert from "node:assert/strict";
import { readFacts, sentences } from "../../lib/owner-said.ts";

const facts = (lines: string[], day = "2026-10-27") => Object.fromEntries(readFacts(lines, day).map((f) => [f.key, f.value]));

test("summary lines split into sentences", () => {
  assert.deepEqual(sentences(["Owner called back.  Rent is $2,400. Pets OK!"]), ["Owner called back.", "Rent is $2,400.", "Pets OK!"]);
});

test("the facts an owner states, each with its sentence", () => {
  const f = readFacts(["The owner said the house will be available November 1st at $2,400 per month with a $500 deposit. Two small dogs are fine."], "2026-10-27");
  assert.deepEqual(Object.fromEntries(f.map((x) => [x.key, x.value])), { next_availability: "2026-11-01", monthly_rate: 2400, security_deposit: 500, pet_status: "Yes" });
  assert.equal(f.find((x) => x.key === "pet_status")?.evidence, "Two small dogs are fine.");
});

test("availability: now, numeric, month only, end of month, next year", () => {
  assert.deepEqual(facts(["The property is available now."]), { next_availability: "2026-10-27" });
  assert.deepEqual(facts(["The unit is available 12/15."]), { next_availability: "2026-12-15" });
  assert.deepEqual(facts(["They expect a vacancy in December."]), { next_availability: "2026-12-01" });
  assert.deepEqual(facts(["Available end of November."]), { next_availability: "2026-11-30" });
  assert.deepEqual(facts(["Available mid-January."]), { next_availability: "2027-01-15" });
  assert.deepEqual(facts(["It will be available on the 3rd of February 2027."]), { next_availability: "2027-02-03" });
  // A date a few weeks back stays this year; one well behind the call is next year's.
  assert.deepEqual(facts(["Available since October 10."]), { next_availability: "2026-10-10" });
  assert.deepEqual(facts(["Available March 1."]), { next_availability: "2027-03-01" });
  // A date with no availability word is not an availability date.
  assert.deepEqual(facts(["The tenant moves out November 1."]), {});
});

test("money: nearest cost word wins; a period alone means rent; other costs are left alone", () => {
  assert.deepEqual(facts(["Rent is $1,850 a month plus $150 a month for utilities."]), { monthly_rate: 1850 });
  assert.deepEqual(facts(["Discussed pet deposit of $300 and pet rent of $35/month. The monthly rent is $2.4k."]), { monthly_rate: 2400, pet_deposit: 300, pet_rent: 35 });
  assert.deepEqual(facts(["Owner is open to a 6 month lease at 2,100 dollars."]), { monthly_rate: 2100 });
  assert.deepEqual(facts(["There is a $75 pet fee and a $50 application fee."]), { pet_fee: 75 });
  assert.deepEqual(facts(["Security deposit is $1,000."]), { security_deposit: 1000 });
  assert.deepEqual(facts(["The owner mentioned $500."]), {});
});

test("pets and furnished: yes, no, and both at once is neither", () => {
  assert.deepEqual(facts(["Owner confirmed no pets are allowed and the home is unfurnished."]), { pet_status: "No", furnished: "No" });
  assert.deepEqual(facts(["Owner said it is not pet-friendly."]), { pet_status: "No" });
  assert.deepEqual(facts(["The home is pet friendly and comes fully furnished."]), { pet_status: "Yes", furnished: "Yes" });
  assert.deepEqual(facts(["Small dogs are fine but no cats."]), {});
  assert.deepEqual(facts(["The owner doesn't allow pets."]), { pet_status: "No" });
});

test("a fact said two different ways is dropped, not guessed", () => {
  assert.deepEqual(facts(["Available Nov 1 or maybe Nov 15 depending on repairs."]), {});
  assert.deepEqual(facts(["Rent is $2,400.", "Later the owner said rent would be $2,500."]), {});
  assert.deepEqual(facts(["Rent is $2,400.", "Confirmed rent of $2,400."]), { monthly_rate: 2400 });
});
