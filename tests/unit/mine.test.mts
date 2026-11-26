import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cityState,
  daysLeftChip,
  filterByScope,
  firstName,
  initialScope,
  nameMatches,
  nearsiteMeta,
  nearsiteNeeds,
  normalizeName,
  ownerNames,
  showingLine,
  sortNearsite,
  tidyName,
} from "../../lib/mine.ts";
import { NEARSITE_CLAIMS } from "../fixtures/map-agent.mjs";

test("normalizeName: case, spaces, dots, accents and 'Last, First'", () => {
  assert.equal(normalizeName("  Dana   WHITFIELD "), "dana whitfield");
  assert.equal(normalizeName("Whitfield, Dana"), "dana whitfield");
  assert.equal(normalizeName("whitfield ,  dana"), "dana whitfield");
  assert.equal(normalizeName("Melissa C."), "melissa c");
  assert.equal(normalizeName("Inès Delacroix"), "ines delacroix");
  assert.equal(normalizeName("Dana"), "dana");
  assert.equal(normalizeName(""), "");
  assert.equal(normalizeName("   "), "");
  assert.equal(normalizeName(null), "");
  assert.equal(normalizeName(undefined), "");
  assert.equal(normalizeName(","), "");
});

test("ownerNames: one person, 'Last, First', and several people in one field", () => {
  assert.deepEqual(ownerNames("Dana Whitfield"), ["dana whitfield"]);
  assert.deepEqual(ownerNames("Whitfield, Dana"), ["dana whitfield"]);
  assert.deepEqual(ownerNames("Dana Whitfield, Theo Brandt"), ["dana whitfield", "theo brandt"]);
  assert.deepEqual(ownerNames("Dana Whitfield; Theo Brandt"), ["dana whitfield", "theo brandt"]);
  assert.deepEqual(ownerNames("Dana Whitfield / Theo Brandt"), ["dana whitfield", "theo brandt"]);
  assert.deepEqual(ownerNames("Dana Whitfield & Theo Brandt"), ["dana whitfield", "theo brandt"]);
  assert.deepEqual(ownerNames("Dana Whitfield and Theo Brandt"), ["dana whitfield", "theo brandt"]);
  assert.deepEqual(ownerNames("Whitfield, Dana; Brandt, Theo"), ["dana whitfield", "theo brandt"]);
  assert.deepEqual(ownerNames("Dana Whitfield, Dana Whitfield"), ["dana whitfield"]);
  assert.deepEqual(ownerNames("Andy Sandoval"), ["andy sandoval"], "'and' inside a name does not split it");
  assert.deepEqual(ownerNames(null), []);
  assert.deepEqual(ownerNames(" , "), []);
});

test("nameMatches: a full name must equal the whole name", () => {
  assert.ok(nameMatches("Dana Whitfield", "Dana Whitfield"));
  assert.ok(nameMatches("  dana   whitfield ", "DANA WHITFIELD"));
  assert.ok(nameMatches("Whitfield, Dana", "Dana Whitfield"));
  assert.ok(nameMatches("Dana Whitfield", "Whitfield, Dana"));
  assert.ok(nameMatches("Melissa C", "Melissa C."));
  assert.ok(nameMatches("Ines Delacroix", "Inès Delacroix"));
  assert.ok(!nameMatches("Dana Whitfield", "Dana Whitmore"));
  assert.ok(!nameMatches("Dana Whitfield", "Dana"), "a longer typed name does not match a shorter owner");
  assert.ok(!nameMatches("Dana W", "Dana Whitfield"), "initials are not expanded");
  assert.ok(!nameMatches("Dana Whitfield", "Dana Marie Whitfield"));
});

test("nameMatches: a first name alone matches the first word only", () => {
  assert.ok(nameMatches("Dana", "Dana Whitfield"));
  assert.ok(nameMatches("dana", "Whitfield, Dana"));
  assert.ok(nameMatches("Dana", "Dana"));
  assert.ok(!nameMatches("Whitfield", "Dana Whitfield"), "never a last name");
  assert.ok(!nameMatches("Dan", "Dana Whitfield"), "never part of a word");
  assert.ok(!nameMatches("Dana", "Daniel Whitfield"));
  assert.ok(!nameMatches("Ana", "Dana Whitfield"));
});

test("nameMatches: several owners, and nothing to match", () => {
  assert.ok(nameMatches("Theo", "Dana Whitfield, Theo Brandt"));
  assert.ok(nameMatches("Theo Brandt", "Dana Whitfield, Theo Brandt"));
  assert.ok(!nameMatches("Brandt", "Dana Whitfield, Theo Brandt"));
  assert.ok(!nameMatches("", "Dana Whitfield"));
  assert.ok(!nameMatches("   ", "Dana Whitfield"));
  assert.ok(!nameMatches(null, "Dana Whitfield"));
  assert.ok(!nameMatches("Dana", null));
  assert.ok(!nameMatches("Dana", ""));
  assert.ok(!nameMatches("", ""));
});

test("firstName and tidyName", () => {
  assert.equal(firstName("Dana Whitfield"), "Dana");
  assert.equal(firstName("  dana   whitfield"), "dana");
  assert.equal(firstName("Whitfield, Dana"), "Dana");
  assert.equal(firstName("Dana"), "Dana");
  assert.equal(firstName(""), "");
  assert.equal(firstName(null), "");
  assert.equal(tidyName("  Dana    Whitfield \n"), "Dana Whitfield");
  assert.equal(tidyName("   "), "");
  assert.equal(tidyName("x".repeat(200)).length, 80);
});

test("initialScope: All until a name is known, then Mine; a remembered choice wins", () => {
  assert.equal(initialScope(null, ""), "all");
  assert.equal(initialScope(null, "   "), "all");
  assert.equal(initialScope(undefined, null), "all");
  assert.equal(initialScope(null, "Dana"), "mine");
  assert.equal(initialScope("all", "Dana"), "all");
  assert.equal(initialScope("mine", ""), "mine");
  assert.equal(initialScope("nonsense", "Dana"), "mine");
  assert.equal(initialScope("nonsense", ""), "all");
});

test("filterByScope: claims by account manager", () => {
  const rows = [
    { id: "1", am: "Dana Whitfield" },
    { id: "2", am: "Theo Brandt" },
    { id: "3", am: null },
    { id: "4", am: "Whitfield, Dana" },
    { id: "5", am: "Theo Brandt, Dana Whitfield" },
  ];
  const ids = (scope: "mine" | "all", name: string | null, unowned = false) =>
    filterByScope(rows, scope, name, (r) => r.am, { unowned }).map((r) => r.id);
  assert.deepEqual(ids("all", "Dana"), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids("mine", "Dana"), ["1", "4", "5"]);
  assert.deepEqual(ids("mine", "dana whitfield"), ["1", "4", "5"]);
  assert.deepEqual(ids("mine", "Theo"), ["2", "5"]);
  assert.deepEqual(ids("mine", "Nobody"), []);
  assert.deepEqual(ids("mine", ""), ["1", "2", "3", "4", "5"], "no name yet: show all");
  assert.deepEqual(ids("mine", null), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids("mine", "Dana", true), ["1", "3", "4", "5"], "unowned rows join Mine when asked");
  assert.notEqual(filterByScope(rows, "all", "", (r) => r.am), rows, "always a copy");
});

test("filterByScope on the Nearsite fixture: Mine = mine + free for all", () => {
  const mine = filterByScope(NEARSITE_CLAIMS.claims, "mine", "Alex", (c) => c.assignedTo, { unowned: true });
  assert.deepEqual(mine.map((c) => c.id), ["90001", "90003", "90005"]);
  assert.equal(filterByScope(NEARSITE_CLAIMS.claims, "all", "Alex", (c) => c.assignedTo).length, 5);
});

test("showingLine", () => {
  assert.equal(showingLine(5, "Dana Whitfield"), "Showing 5 claims for Dana");
  assert.equal(showingLine(1, "Dana"), "Showing 1 claim for Dana");
  assert.equal(showingLine(0, "Whitfield, Dana"), "Showing 0 claims for Dana");
  assert.equal(showingLine(3, "Dana", "nearsite"), "Showing 3 Nearsite claims for Dana and free for all");
  assert.equal(showingLine(1, "Dana", "nearsite"), "Showing 1 Nearsite claim for Dana and free for all");
});

test("daysLeftChip: wording and urgency", () => {
  assert.deepEqual(daysLeftChip(0), { label: "Due today", tone: "bad" });
  assert.deepEqual(daysLeftChip(-3), { label: "Due today", tone: "bad" });
  assert.deepEqual(daysLeftChip(1), { label: "1 day left", tone: "amber" });
  assert.deepEqual(daysLeftChip(2), { label: "2 days left", tone: "amber" });
  assert.deepEqual(daysLeftChip(5), { label: "5 days left", tone: "amber" });
  assert.deepEqual(daysLeftChip(6), { label: "6 days left", tone: "muted" });
  assert.deepEqual(daysLeftChip(9), { label: "9 days left", tone: "muted" });
  assert.deepEqual(daysLeftChip(2.9), { label: "2 days left", tone: "amber" });
  assert.equal(daysLeftChip(null), null);
  assert.equal(daysLeftChip(undefined), null);
  assert.equal(daysLeftChip(Number.NaN), null);
});

test("sortNearsite: soonest first, no deadline last, ties by title, input untouched", () => {
  const before = NEARSITE_CLAIMS.claims.map((c) => c.id);
  const sorted = sortNearsite(NEARSITE_CLAIMS.claims);
  assert.deepEqual(sorted.map((c) => c.id), ["90004", "90002", "90001", "90003", "90005"]);
  assert.deepEqual(NEARSITE_CLAIMS.claims.map((c) => c.id), before);
  const ties = sortNearsite([
    { title: "B", daysLeft: 3 },
    { title: "A", daysLeft: 3 },
    { title: "Z", daysLeft: -2 },
    { title: "C", daysLeft: null },
    { title: "Y", daysLeft: 0 },
  ]);
  assert.deepEqual(ties.map((c) => c.title), ["Y", "Z", "A", "B", "C"]);
  assert.deepEqual(sortNearsite([]), []);
});

test("nearsite row wording", () => {
  assert.equal(nearsiteNeeds({ beds: 4, baths: 2, budgetMonthly: 3600 }), "4 bd · 2 ba · budget $3,600/mo");
  assert.equal(nearsiteNeeds({ beds: 3, baths: 1.5, budgetMonthly: null }), "3 bd · 1.5 ba · budget not set");
  assert.equal(nearsiteNeeds({ beds: null, baths: null, budgetMonthly: 0 }), "budget not set");
  assert.equal(nearsiteMeta({ feeGroup: "B", homesFound: 3 }), "Fee group B · 3 homes found");
  assert.equal(nearsiteMeta({ feeGroup: "A", homesFound: 1 }), "Fee group A · 1 home found");
  assert.equal(nearsiteMeta({ feeGroup: "C", homesFound: 0 }), "Fee group C · 0 homes found");
  assert.equal(nearsiteMeta({ feeGroup: null, homesFound: 2 }), "2 homes found");
  assert.equal(nearsiteMeta({ feeGroup: " ", homesFound: null }), "");
  assert.equal(cityState({ city: "Tulsa", state: "OK" }), "Tulsa, OK");
  assert.equal(cityState({ city: "Tulsa", state: null }), "Tulsa");
  assert.equal(cityState({ city: null, state: null }), "");
});
