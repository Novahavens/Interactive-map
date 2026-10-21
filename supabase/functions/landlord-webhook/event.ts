// Pure rules for the owner-board webhook. No I/O, so `deno test` covers them.

export const LANDLORD_BOARD = "9616452671";
export const PROPERTY_BOARD = "18415735059";
/** Owner-board relation back to the PROPERTY DATABASE ("Property Ownership"). */
export const OWNERSHIP_COLUMN = "board_relation_mm654xk4";

/** Owner-board columns that change what the map shows or says about a property. */
const WATCHED = new Set([
  "color_mm65bqw8", // Approvement Status: Preferred / DO NOT USE
  "text_mm657zkz", //  Approvement Note
  "text_mksyrwcb", //  Phone
  "text_mksywaey", //  Link/Email
  "color_mm656j6f", // Type
  OWNERSHIP_COLUMN, // which properties belong to this owner
]);

const id = (v: unknown): string | null => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,20}$/.test(s) ? s : null;
};

/**
 * Which owner changed, if the event matters. Events are unsigned hints: the function re-reads the
 * owner from Monday and only ever asks the existing sync to re-read the properties.
 * Renames carry no columnId and do matter (the owner's name is shown on the property).
 */
export function parseLandlordEvent(body: unknown): { landlordId: string } | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== "object") return null;
  if (String(e.boardId ?? "") !== LANDLORD_BOARD) return null;
  const landlordId = id(e.pulseId ?? e.itemId);
  if (!landlordId) return null;
  const columnId = typeof e.columnId === "string" ? e.columnId : null;
  if (columnId !== null && !WATCHED.has(columnId)) return null;
  return { landlordId };
}

/** The synthetic property-board event that makes monday-webhook re-read one property. */
export function propertyEvent(propertyId: string) {
  return { event: { boardId: Number(PROPERTY_BOARD), pulseId: Number(propertyId), type: "landlord_changed" } };
}

/** Never fan out an unbounded number of reads from one event. */
export const MAX_PROPERTIES_PER_EVENT = 300;
