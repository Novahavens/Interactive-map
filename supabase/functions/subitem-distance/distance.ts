// Pure rules for filling "Distance to Loss (mi)" on claim options (sub-items).
// No I/O and no Deno APIs, so every rule here is covered by `deno test`.

export const CLAIM_BOARD = "9030696652";
export const SUBITEM_BOARD = "9205253360";
export const COL = {
  lossAddress: "location_mkqdyjmk", // claim board, location column
  property: "board_relation_mm441", // sub-item -> PROPERTY DATABASE
  distance: "numeric_mm7np0z7", // sub-item, "Distance to Loss (mi)"
};

/** fill: write only into a blank column (a new option).
 *  recompute: the option now points at a different property, so the old figure is wrong. */
export type Mode = "fill" | "recompute";
export type Queued = { subitemId: string; claimId: string | null; mode: Mode };

const id = (v: unknown): string | null => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,20}$/.test(s) ? s : null;
};

/**
 * What a monday webhook event asks us to do, if anything. Events are unsigned, so
 * this is only a hint: the sweep re-reads the sub-item from Monday before writing.
 *   create_subitem               -> fill
 *   sub-item property changed    -> recompute
 *   any other sub-item column    -> ignored (including our own distance writes)
 */
export function parseEvent(body: unknown): Queued | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== "object") return null;
  const subitemId = id(e.pulseId ?? e.itemId);
  if (!subitemId) return null;
  const claimId = id(e.parentItemId);
  const columnId = typeof e.columnId === "string" ? e.columnId : null;
  if (columnId === null) {
    // create_subitem carries no columnId. Anything else without one (renames, moves) is not ours.
    const type = String(e.type ?? "");
    if (type && !/create/i.test(type)) return null;
    return { subitemId, claimId, mode: "fill" };
  }
  if (columnId === COL.property) return { subitemId, claimId, mode: "recompute" };
  return null;
}

/** Monday location column value -> point. Accepts the raw JSON string or parsed object. */
export function parseLoss(value: unknown): { lat: number; lng: number } | null {
  let v = value;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat), lng = Number(o.lng);
  if (o.lat == null || o.lng == null || o.lat === "" || o.lng === "") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

export type SubitemRead = {
  id: string;
  state?: string | null;
  board?: { id: string } | null;
  parent_item?: { id: string } | null;
  column_values: Array<{ id: string; text: string | null; linked_item_ids?: string[] | null }>;
};

export type Outcome =
  | "written"
  | "already_set" // a figure is already there and this is not a property change
  | "not_subitem" // deleted, archived, or not on the claim sub-item board
  | "no_property" // the option isn't linked to a property (yet)
  | "no_property_location" // the property has no coordinates (yet)
  | "no_loss_location" // the claim has no loss address on the map (yet)
  | "error";

export type Plan =
  | { kind: "write"; claimId: string; propertyId: string }
  | { kind: "skip"; outcome: Exclude<Outcome, "written" | "error" | "no_property_location" | "no_loss_location">; claimId: string | null; propertyId: string | null };

/** First pass, from the sub-item alone: is there anything to compute? */
export function plan(q: Queued, s: SubitemRead | undefined): Plan {
  if (!s || (s.state && s.state !== "active") || (s.board && String(s.board.id) !== SUBITEM_BOARD)) {
    return { kind: "skip", outcome: "not_subitem", claimId: q.claimId, propertyId: null };
  }
  const claimId = s.parent_item?.id ? String(s.parent_item.id) : q.claimId;
  const rel = s.column_values.find((c) => c.id === COL.property);
  const propertyId = (rel?.linked_item_ids ?? []).map(String)[0] ?? null;
  if (!claimId) return { kind: "skip", outcome: "not_subitem", claimId: null, propertyId };
  if (!propertyId) return { kind: "skip", outcome: "no_property", claimId, propertyId: null };
  const current = s.column_values.find((c) => c.id === COL.distance)?.text?.trim();
  if (current && q.mode === "fill") return { kind: "skip", outcome: "already_set", claimId, propertyId };
  return { kind: "write", claimId, propertyId };
}

/** Same rounding as property_distance_miles (2 dp), written the way the app writes it. */
export function columnValue(miles: number): string {
  return String(Math.round(miles * 100) / 100);
}

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/**
 * When to look again, or null to stop. A property created alongside its option is
 * usually located within a minute, so that wait is short at first; a missing loss
 * address needs a person, so it is checked hourly. Everything gives up after a week.
 */
export function retryAt(outcome: Outcome, queuedAt: Date, now: Date): Date | null {
  const age = now.getTime() - queuedAt.getTime();
  if (age > 7 * DAY) return null;
  switch (outcome) {
    case "no_property_location": return new Date(now.getTime() + (age < 30 * MIN ? 30_000 : HOUR));
    case "no_loss_location": return new Date(now.getTime() + HOUR);
    case "no_property": return age < 6 * HOUR ? new Date(now.getTime() + 15 * MIN) : null;
    case "error": return age < DAY ? new Date(now.getTime() + 15 * MIN) : null;
    default: return null;
  }
}
