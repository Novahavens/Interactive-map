import { assertEquals } from "jsr:@std/assert@1";
import { PROPERTY_COLUMNS, toRow, type MondayItem } from "./mapping.ts";

const item = (cols: Record<string, string | null>): MondayItem => ({
  id: "1", name: "123 Main St", column_values: Object.entries(cols).map(([id, text]) => ({ id, text, value: null })),
});
const row = (cols: Record<string, string | null>) => toRow(item(cols), new Map(), new Date("2026-10-23T00:00:00Z"));

Deno.test("availability, availability_checked and link_status are mapped", () => {
  const r = row({ color_mm86h3x: "Available Now", date_mm86dw93: "2026-10-22", color_mm41z556: "BAD LINK" });
  assertEquals([r.availability, r.availability_checked, r.link_status], ["Available Now", "2026-10-22", "BAD LINK"]);
});

Deno.test("blank labels and dates become null", () => {
  const r = row({ color_mm86h3x: "", date_mm86dw93: "", color_mm41z556: null });
  assertEquals([r.availability, r.availability_checked, r.link_status], [null, null, null]);
});

Deno.test("columns absent from the response become null", () => {
  const r = row({});
  assertEquals([r.availability, r.availability_checked, r.link_status], [null, null, null]);
});

Deno.test("labels are trimmed and a datetime text keeps only the date", () => {
  const r = row({ color_mm86h3x: "  Unavailable ", date_mm86dw93: "2026-10-22 14:05", color_mm41z556: " Good link" });
  assertEquals([r.availability, r.availability_checked, r.link_status], ["Unavailable", "2026-10-22", "Good link"]);
});

Deno.test("a non-date in the date column is dropped", () => {
  assertEquals(row({ date_mm86dw93: "yesterday" }).availability_checked, null);
});

Deno.test("the three columns are requested from Monday", () => {
  for (const id of ["color_mm86h3x", "date_mm86dw93", "color_mm41z556"]) assertEquals(PROPERTY_COLUMNS.includes(id), true, id);
});

Deno.test("new columns also land in the fields jsonb", () => {
  assertEquals(row({ color_mm86h3x: "Available Soon" }).fields.color_mm86h3x, "Available Soon");
});
