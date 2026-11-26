import { test } from "node:test";
import assert from "node:assert/strict";
import { TEXT_TEMPLATES, shortDate, templateText } from "../../lib/text-templates.ts";
import { draftText } from "../../lib/quo-links.ts";

const FULL = { to: "Jane Doe", address: "12 Elm St, Tulsa, OK 74133, USA", from: "Will", beds: 3, city: "Tulsa", moveIn: "2026-12-01" };

test("three templates, each with a label", () => {
  assert.deepEqual(TEXT_TEMPLATES.map((t) => t.key), ["availability", "address", "rate"]);
  assert.ok(TEXT_TEMPLATES.every((t) => t.label.length > 3));
});

test("availability names the home, the date and what the family needs", () => {
  assert.equal(
    templateText("availability", FULL),
    "Hi Jane, it's Will from Nova Havens about 12 Elm St. Is it available from Dec 1? We have a family that needs a 3-bedroom home in Tulsa. ",
  );
});

test("address asks for the street without naming one", () => {
  assert.equal(
    templateText("address", FULL),
    "Hi Jane, it's Will from Nova Havens. We have a family interested in your 3-bedroom place in Tulsa. Could you send the street address so we can check the distance for them? ",
  );
});

test("rate asks the monthly rate from the move-in date", () => {
  assert.equal(
    templateText("rate", FULL),
    "Hi Jane, it's Will from Nova Havens about 12 Elm St. What is the monthly rate for a stay starting Dec 1, and are utilities included? ",
  );
});

test("missing pieces drop out cleanly", () => {
  assert.equal(templateText("availability"), "Hi, this is Nova Havens. Is it available? We have a family that needs a home. ");
  assert.equal(templateText("address", {}), "Hi, this is Nova Havens. We have a family interested in your place. Could you send the street address so we can check the distance for them? ");
  assert.equal(templateText("rate", { to: null, address: null, from: null, beds: null, city: null, moveIn: null }), "Hi, this is Nova Havens. What is the monthly rate, and are utilities included? ");
  assert.equal(templateText("availability", { beds: 0, city: "  ", moveIn: "soon" }), "Hi, this is Nova Havens. Is it available? We have a family that needs a home. ");
});

test("a company name is not greeted by name, as in draftText", () => {
  assert.ok(templateText("availability", { to: "Acme Properties LLC", address: "12 Elm St" }).startsWith("Hi, this is Nova Havens about 12 Elm St. "));
});

test("every template opens the way draftText does and ends ready to keep typing", () => {
  const opening = draftText(FULL).trimEnd();
  assert.ok(templateText("availability", FULL).startsWith(opening));
  assert.ok(templateText("rate", FULL).startsWith(opening));
  for (const t of TEXT_TEMPLATES) {
    const text = templateText(t.key, FULL);
    assert.ok(text.endsWith(" "), t.key);
    assert.ok(text.length < 320, t.key);
    assert.ok(!/undefined|null|NaN| {2}/.test(text), t.key);
  }
});

test("shortDate reads YYYY-MM-DD without a time zone", () => {
  assert.equal(shortDate("2026-12-01"), "Dec 1");
  assert.equal(shortDate("2026-01-31T00:00:00Z"), "Jan 31");
  assert.equal(shortDate("2026-13-01"), "");
  assert.equal(shortDate("12/01/2026"), "");
  assert.equal(shortDate(null), "");
});
