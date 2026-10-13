import { assertEquals } from "jsr:@std/assert@1";
import { COL, SUBITEM_BOARD, columnValue, parseEvent, parseLoss, plan, retryAt, type SubitemRead } from "./distance.ts";

Deno.test("create_subitem queues a fill for the new option", () => {
  const body = { event: { type: "create_pulse", boardId: 9205253360, pulseId: 13281861016, parentItemId: "13281604090", parentItemBoardId: "9030696652" } };
  assertEquals(parseEvent(body), { subitemId: "13281861016", claimId: "13281604090", mode: "fill" });
});

Deno.test("changing an option's property queues a recompute; other columns are ignored", () => {
  const ev = (columnId: string) => ({ event: { type: "update_column_value", pulseId: 1, parentItemId: 2, columnId } });
  assertEquals(parseEvent(ev(COL.property)), { subitemId: "1", claimId: "2", mode: "recompute" });
  assertEquals(parseEvent(ev(COL.distance)), null); // our own write must not loop
  assertEquals(parseEvent(ev("status")), null);
});

Deno.test("events without a usable id, and renames, are ignored", () => {
  assertEquals(parseEvent({}), null);
  assertEquals(parseEvent({ event: { pulseId: "abc" } }), null);
  assertEquals(parseEvent({ event: { type: "update_name", pulseId: 5 } }), null);
});

Deno.test("loss address: raw JSON or object, and blanks are not a point", () => {
  assertEquals(parseLoss('{"lat":"33.4484","lng":"-112.074","address":"Phoenix, AZ"}'), { lat: 33.4484, lng: -112.074 });
  assertEquals(parseLoss({ lat: 40.1, lng: -75.2 }), { lat: 40.1, lng: -75.2 });
  assertEquals(parseLoss(null), null);
  assertEquals(parseLoss("{}"), null);
  assertEquals(parseLoss('{"lat":"","lng":""}'), null);
  assertEquals(parseLoss('{"lat":0,"lng":0}'), null);
  assertEquals(parseLoss("not json"), null);
});

const sub = (over: Partial<SubitemRead> & { property?: string[]; distance?: string | null } = {}): SubitemRead => ({
  id: "1",
  state: "active",
  board: { id: SUBITEM_BOARD },
  parent_item: { id: "99" },
  column_values: [
    { id: COL.property, text: null, linked_item_ids: over.property ?? ["555"] },
    { id: COL.distance, text: over.distance ?? "" },
  ],
  ...over,
});

Deno.test("plan: a blank option linked to a property gets measured", () => {
  assertEquals(plan({ subitemId: "1", claimId: null, mode: "fill" }, sub()), { kind: "write", claimId: "99", propertyId: "555" });
});

Deno.test("plan: a figure that is already there stays unless the property changed", () => {
  assertEquals(plan({ subitemId: "1", claimId: "99", mode: "fill" }, sub({ distance: "4.2" })).kind, "skip");
  assertEquals(plan({ subitemId: "1", claimId: "99", mode: "recompute" }, sub({ distance: "4.2" })), { kind: "write", claimId: "99", propertyId: "555" });
});

Deno.test("plan: unlinked, deleted, or foreign items are not written", () => {
  const p = (s: SubitemRead | undefined) => plan({ subitemId: "1", claimId: "99", mode: "fill" }, s);
  assertEquals(p(sub({ property: [] })), { kind: "skip", outcome: "no_property", claimId: "99", propertyId: null });
  assertEquals((p(undefined) as { outcome: string }).outcome, "not_subitem");
  assertEquals((p(sub({ state: "deleted" })) as { outcome: string }).outcome, "not_subitem");
  assertEquals((p(sub({ board: { id: "18415735059" } })) as { outcome: string }).outcome, "not_subitem");
});

Deno.test("column value matches property_distance_miles rounding", () => {
  assertEquals(columnValue(9.8), "9.8");
  assertEquals(columnValue(12.345), "12.35");
  assertEquals(columnValue(0.004), "0");
});

Deno.test("retry: quick while a new property is being located, hourly later, stop after a week", () => {
  const t0 = new Date("2026-10-13T20:00:00Z");
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  assertEquals(retryAt("no_property_location", t0, at(1))?.toISOString(), new Date(at(1).getTime() + 30_000).toISOString());
  assertEquals(retryAt("no_property_location", t0, at(60))?.toISOString(), at(120).toISOString());
  assertEquals(retryAt("no_loss_location", t0, at(10))?.toISOString(), at(70).toISOString());
  assertEquals(retryAt("no_loss_location", t0, at(8 * 24 * 60)), null);
  assertEquals(retryAt("no_property", t0, at(7 * 60)), null);
  assertEquals(retryAt("written", t0, at(1)), null);
  assertEquals(retryAt("already_set", t0, at(1)), null);
});
