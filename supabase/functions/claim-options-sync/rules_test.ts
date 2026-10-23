import { assertEquals } from "jsr:@std/assert@1";
import { ACTIVE_GROUPS, ACTIVE_STATUSES, isActiveGroup, isActiveStatus, replaceGuard, toOptions, type RawClaim } from "./rules.ts";

Deno.test("active groups are exactly the nine in the contract", () => {
  assertEquals(Object.keys(ACTIVE_GROUPS).sort(), [
    "group_mkqf3bj5", "group_mkqfnvw3", "group_mkqfpc0y", "group_mkqfrrf2", "group_mkqfypyq",
    "group_mkvngrgz", "group_mkvnnd97", "group_mm58f6m6", "topics",
  ]);
});

Deno.test("Stuck, Lost, Moved Out, Deposit and the AI test group are not active", () => {
  for (const g of ["group_mkygh9qd", "group_mkrdasrd", "group_mkqfrcs3", "group_mm1gy0cz", "group_mkrhje14", "group_mm1jnpwf", "", null, undefined]) {
    assertEquals(isActiveGroup(g), false, String(g));
  }
  for (const g of Object.keys(ACTIVE_GROUPS)) assertEquals(isActiveGroup(g), true, g);
});

Deno.test("all eleven live statuses are active, case and spacing tolerant", () => {
  assertEquals(ACTIVE_STATUSES.length, 11);
  for (const s of ACTIVE_STATUSES) assertEquals(isActiveStatus(s), true, s);
  assertEquals(isActiveStatus("  option submitted "), true);
  assertEquals(isActiveStatus("SELECTED - WON"), true);
});

Deno.test("declined, dead and unknown statuses are not active", () => {
  for (const s of ["Not Available", "Owner Declined", "INSD Declined", "Adj Declined", "Fell Through", "Not approved", "DO NOT USE",
    "Over Budget", "Stairs Issue", "Not offering", "Fetch Images", "Preferred Partner", "Stuck", "", null, undefined, "Something new"]) {
    assertEquals(isActiveStatus(s), false, String(s));
  }
});

const sub = (id: string, status: string | null, props: string[] | null) => ({
  id,
  column_values: [
    { id: "status", text: status },
    { id: "board_relation_mm441", text: null, linked_item_ids: props },
  ],
});
const claim = (id: string, group: string | null, subitems: ReturnType<typeof sub>[]): RawClaim => ({
  id, name: `Claim ${id}`, group: group ? { id: group } : null, subitems,
});

Deno.test("toOptions keeps active sub-items on active claims and maps every field", () => {
  const rows = toOptions([claim("c1", "group_mkqf3bj5", [sub("s1", "Option Submitted", ["900"])])]);
  assertEquals(rows, [{
    subitem_id: "s1", property_item_id: "900", claim_item_id: "c1", claim_name: "Claim c1",
    status: "Option Submitted", claim_group: "Current Tenant",
  }]);
});

Deno.test("toOptions drops inactive groups, inactive statuses and sub-items with no property", () => {
  const rows = toOptions([
    claim("c1", "group_mkygh9qd", [sub("s1", "To Do", ["1"])]),
    claim("c2", "topics", [sub("s2", "Owner Declined", ["2"]), sub("s3", "To Do", null), sub("s4", "To Do", []), sub("s5", "To Do", ["5"])]),
    claim("c3", null, [sub("s6", "To Do", ["6"])]),
  ]);
  assertEquals(rows.map((r) => r.subitem_id), ["s5"]);
});

Deno.test("toOptions keeps the first linked property and tolerates claims without sub-items", () => {
  const rows = toOptions([
    { id: "c1", name: "A", group: { id: "topics" }, subitems: null },
    { id: "c2", name: "B", group: { id: "topics" } },
    claim("c3", "topics", [sub("s1", "To Do", ["7", "8"])]),
  ]);
  assertEquals(rows.map((r) => [r.subitem_id, r.property_item_id]), [["s1", "7"]]);
});

Deno.test("a sub-item seen twice (page overlap) produces one row", () => {
  const s = sub("s1", "To Do", ["1"]);
  assertEquals(toOptions([claim("c1", "topics", [s]), claim("c1", "topics", [s])]).length, 1);
});

Deno.test("replace guard: zero claims never replaces, any claims does", () => {
  assertEquals(replaceGuard(0).replace, false);
  assertEquals(replaceGuard(1), { replace: true });
  assertEquals(replaceGuard(330), { replace: true });
});
