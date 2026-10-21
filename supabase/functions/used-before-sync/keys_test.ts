import { assertEquals } from "jsr:@std/assert@1";
import { MIN_KEYS_TO_REPLACE, PLACED_GROUPS, contactKeys, tally } from "./keys.ts";

Deno.test("one email, one phone", () => {
  assertEquals(contactKeys("Donniehall@DHallsHomes.com", "(602) 348-1561"), [
    { key: "donniehall@dhallshomes.com", kind: "email" },
    { key: "6023481561", kind: "phone" },
  ]);
});

Deno.test("a cell with two emails, as it appears on the claim board", () => {
  const keys = contactKeys("lloyd@nestago.com - reservations@nestago.com", "");
  assertEquals(keys.map((k) => k.key), ["lloyd@nestago.com", "reservations@nestago.com"]);
});

Deno.test("the same email twice in a cell counts once", () => {
  assertEquals(contactKeys("april@reliancevacations.com - april@reliancevacations.com", null).length, 1);
});

Deno.test("phone formats: dashes, dots, +1, 1-prefix, spaces", () => {
  for (const p of ["602-348-1561", "602.348.1561", "+1 602 348 1561", "1 (602) 348-1561", "6023481561"]) {
    assertEquals(contactKeys(null, p), [{ key: "6023481561", kind: "phone" }], p);
  }
});

Deno.test("two phones in one cell", () => {
  assertEquals(contactKeys(null, "602-348-1561 / 480-221-3612").map((k) => k.key), ["6023481561", "4802213612"]);
});

Deno.test("junk gives no key, and short numbers are not phones", () => {
  assertEquals(contactKeys("n/a", "tbd"), []);
  assertEquals(contactKeys("", "555-1234"), []);
  assertEquals(contactKeys(null, null), []);
});

Deno.test("tally counts a claim once per key and sorts", () => {
  const rows = tally([
    { email: "b@x.com", phone: "602-348-1561" },
    { email: "b@x.com - a@x.com", phone: "(602) 348-1561" },
    { email: "", phone: "480-221-3612" },
  ]);
  assertEquals(rows, [
    { key: "480-221-3612".replace(/\D/g, ""), kind: "phone", claims: 1 },
    { key: "6023481561", kind: "phone", claims: 2 },
    { key: "a@x.com", kind: "email", claims: 1 },
    { key: "b@x.com", kind: "email", claims: 2 },
  ].sort((a, b) => a.key.localeCompare(b.key)));
});

Deno.test("only the eight placed groups count", () => {
  assertEquals(Object.keys(PLACED_GROUPS).length, 8);
  const names = Object.values(PLACED_GROUPS).join("|");
  for (const not of ["New Housing Request", "New Option Needed", "Waiting Adjuster approval", "Adjuster Approved", "Stuck", "Lost", "TESTING"]) {
    assertEquals(names.includes(not), false, not);
  }
  assertEquals(MIN_KEYS_TO_REPLACE > 0, true);
});
