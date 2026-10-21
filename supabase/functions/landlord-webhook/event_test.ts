import { assertEquals } from "jsr:@std/assert@1";
import { LANDLORD_BOARD, MAX_PROPERTIES_PER_EVENT, OWNERSHIP_COLUMN, parseLandlordEvent, propertyEvent } from "./event.ts";

const ev = (over: Record<string, unknown>) => ({ event: { boardId: Number(LANDLORD_BOARD), pulseId: 12788222574, ...over } });

Deno.test("approval status, note, contact and ownership changes matter", () => {
  for (const columnId of ["color_mm65bqw8", "text_mm657zkz", "text_mksyrwcb", "text_mksywaey", OWNERSHIP_COLUMN]) {
    assertEquals(parseLandlordEvent(ev({ columnId })), { landlordId: "12788222574" }, columnId);
  }
});

Deno.test("a rename has no columnId and matters", () => {
  assertEquals(parseLandlordEvent(ev({ type: "update_name" })), { landlordId: "12788222574" });
});

Deno.test("columns the map does not show are ignored", () => {
  assertEquals(parseLandlordEvent(ev({ columnId: "subtasks_mm3aj90f" })), null);
  assertEquals(parseLandlordEvent(ev({ columnId: "anything_else" })), null);
});

Deno.test("other boards and malformed events are ignored", () => {
  assertEquals(parseLandlordEvent({ event: { boardId: 18415735059, pulseId: 1 } }), null);
  assertEquals(parseLandlordEvent({ event: { boardId: Number(LANDLORD_BOARD), pulseId: "abc" } }), null);
  assertEquals(parseLandlordEvent({}), null);
  assertEquals(parseLandlordEvent(null), null);
});

Deno.test("the synthetic event is a property-board event for monday-webhook", () => {
  assertEquals(propertyEvent("12511827911"), { event: { boardId: 18415735059, pulseId: 12511827911, type: "landlord_changed" } });
  assertEquals(MAX_PROPERTIES_PER_EVENT > 0, true);
});
