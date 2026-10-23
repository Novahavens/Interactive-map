// Pure mapping from monday.com items to rows of public.properties.
// No I/O and no Deno APIs, so every rule here is covered by `deno test`.
//
// History carried over from the deployed shared.ts:
// v6 (23 Oct 2026): mirrors Availability / Availability Checked / link quality
//   (color_mm86h3x, date_mm86dw93, color_mm41z556).
// v5 (29 Sep 2026): mirrors Last Move-In Date / Last Move-Out Date / Rental
//   History (date_mm7nj3z0, date_mm7n2vvp, color_mm7nh3y).
// v4 (22 Sep 2026): board_relation values are read via the
//   BoardRelationValue { linked_item_ids } fragment. On API 2024-10 the legacy
//   `value` JSON for board_relation columns is null.

export const PROPERTY_BOARD = "18415735059";
export const LANDLORD_BOARD = "9616452671";
export const LANDLORD_RELATION = "board_relation_mm65mwpg";

/** Every property-board column the map reads. Anything not listed here lands
 *  in the `fields` jsonb so nothing is lost, but nothing is silently trusted. */
export const PROPERTY_COLUMNS = [
  "location_mm416w07", "text_mm3yzy0x", "text_mm3yw9nf", "text_mm3y5tq6",
  "color_mm3ycn91", "numeric_mm44r6x9", "numeric_mm44dmx5", "numeric_mm4b1e83",
  "dropdown_mm3ywgac", "dropdown_mm3yt55p", "dropdown_mm3yqhxg",
  "date_mm4416ne", "date_mm5yh71z", "numeric_mm4j140y",
  "text_mm3ykmnv", "link_mm4brf9e",
  "text_mm3yg2pr", "email_mm3y8qye", "text_mm41csw5", LANDLORD_RELATION,
  "numeric_mm44b6ew", "numeric_mm44g73b", "numeric_mm449kx6", "numeric_mm44cgzh",
  "numeric_mm4486t7", "numeric_mm44e30p", "numeric_mm4bb5xz", "numeric_mm4b9pnf",
  "numeric_mm54xvdv", "numeric_mm44rceq", "long_text_mm4bdk3t", "numeric_mm4bwcf0",
  "long_text_mm47w9d", "long_text_mm4jpg99", "color_mm4b9y38",
  "date_mm7nj3z0", "date_mm7n2vvp", "color_mm7nh3y",
  "color_mm86h3x", "date_mm86dw93", "color_mm41z556",
];

export const LANDLORD_COLUMNS = ["text_mksyrwcb", "text_mksywaey", "color_mm656j6f", "color_mm65bqw8", "text_mm657zkz"];

export type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
  /** Present only on board_relation columns (BoardRelationValue fragment). */
  linked_item_ids?: string[] | null;
};

export type MondayItem = {
  id: string;
  name: string;
  /** active | archived | deleted. Monday still returns archived and deleted items by id. */
  state?: string | null;
  board?: { id: string } | null;
  group?: { id: string; title: string } | null;
  column_values: MondayColumnValue[];
};

export const ITEM_FIELDS = `
  id name state board { id } group { id title }
  column_values (ids: ${JSON.stringify(PROPERTY_COLUMNS)}) {
    id text value
    ... on BoardRelationValue { linked_item_ids }
  }
`;

export type LandlordInfo = { name: string; phone: string | null; contact: string | null; type: string | null; approval: string | null; note: string | null };

export type MirrorAction = { kind: "upsert"; item: MondayItem } | { kind: "delete"; reason: string };

/**
 * What the mirror should do with an item, decided only from what Monday says
 * about it now. The webhook event that prompted the read is never trusted: the
 * endpoint is unauthenticated (monday board webhooks are unsigned), so a forged
 * "delete" event must not be able to remove a live property from the map.
 */
export function mirrorAction(item: MondayItem | undefined): MirrorAction {
  if (!item) return { kind: "delete", reason: "not found in Monday" };
  if (item.state && item.state !== "active") return { kind: "delete", reason: `${item.state} in Monday` };
  if (item.board && String(item.board.id) !== PROPERTY_BOARD) return { kind: "delete", reason: "moved to another board" };
  return { kind: "upsert", item };
}

/** Constant-time string comparison for the shared sync secret. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Backfill pages per invocation: 1-20, default 5. A bad value must not turn into a silent no-op run. */
export function pageBudget(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 20) : 5;
}

export const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
export const str = (v: string | null | undefined): string | null => (v && v.trim() !== "" ? v.trim() : null);
export const date = (v: string | null | undefined): string | null => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function linkUrl(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value)?.url ?? null; } catch { return null; }
}

/** Linked item ids from a board_relation column value. Prefers the
 *  BoardRelationValue fragment; falls back to the legacy value JSON. */
export function linkedIds(cv: MondayColumnValue | undefined): string[] {
  if (!cv) return [];
  if (Array.isArray(cv.linked_item_ids) && cv.linked_item_ids.length) return cv.linked_item_ids.map(String);
  if (!cv.value) return [];
  try {
    return (JSON.parse(cv.value)?.linkedPulseIds ?? []).map((l: { linkedPulseId: number }) => String(l.linkedPulseId));
  } catch { return []; }
}

export function landlordIdsOf(items: MondayItem[]): string[] {
  return items.flatMap((i) => linkedIds(i.column_values.find((c) => c.id === LANDLORD_RELATION)));
}

export function toLandlord(item: MondayItem): LandlordInfo {
  const c = (id: string) => item.column_values.find((x) => x.id === id)?.text ?? null;
  return {
    name: item.name,
    phone: str(c("text_mksyrwcb")),
    contact: str(c("text_mksywaey")),
    type: str(c("color_mm656j6f")),
    approval: str(c("color_mm65bqw8")),
    note: str(c("text_mm657zkz")),
  };
}

export function toRow(item: MondayItem, landlords: Map<string, LandlordInfo>, now: Date = new Date()) {
  const cv = (id: string) => item.column_values.find((x) => x.id === id);
  const text = (id: string) => cv(id)?.text ?? null;

  let lat: number | null = null, lng: number | null = null, address: string | null = null;
  const loc = cv("location_mm416w07");
  if (loc?.value) {
    try {
      const parsed = JSON.parse(loc.value);
      lat = num(parsed.lat); lng = num(parsed.lng); address = str(parsed.address) ?? str(loc.text);
    } catch { /* fall through to missing */ }
  }

  const landlordId = linkedIds(cv(LANDLORD_RELATION))[0] ?? null;
  const landlord = landlordId ? landlords.get(landlordId) : undefined;

  const fields: Record<string, string | null> = {};
  for (const c of item.column_values) fields[c.id] = c.text;

  const stamp = now.toISOString();
  return {
    monday_item_id: item.id,
    name: item.name,
    group_id: item.group?.id ?? null,
    group_title: item.group?.title ?? null,
    address: address ?? (str([text("text_mm3yzy0x"), text("text_mm3yw9nf")].filter(Boolean).join(", "))),
    city: str(text("text_mm3yzy0x")),
    state: str(text("text_mm3yw9nf")),
    zipcode: str(text("text_mm3y5tq6")),
    lat, lng,
    geocode_status: lat !== null && lng !== null ? "ok" : "missing",
    property_type: str(text("color_mm3ycn91")),
    bedrooms: num(text("numeric_mm44r6x9")),
    bathrooms: num(text("numeric_mm44dmx5")),
    sqft: num(text("numeric_mm4b1e83")),
    pet_status: str(text("dropdown_mm3ywgac")),
    fenced_yard: str(text("dropdown_mm3yt55p")),
    furnished: str(text("dropdown_mm3yqhxg")),
    next_availability: date(text("date_mm4416ne")),
    last_contact: date(text("date_mm5yh71z")),
    ntv: num(text("numeric_mm4j140y")),
    property_link: str(text("text_mm3ykmnv")),
    photo_folder_url: linkUrl(cv("link_mm4brf9e")?.value ?? null),
    owner_name: str(text("text_mm3yg2pr")),
    owner_email: str(text("email_mm3y8qye")),
    owner_phone: str(text("text_mm41csw5")),
    monthly_rate: num(text("numeric_mm44b6ew")),
    pet_rent: num(text("numeric_mm44g73b")),
    pet_deposit: num(text("numeric_mm449kx6")),
    security_deposit: num(text("numeric_mm44cgzh")),
    pet_fee: num(text("numeric_mm4486t7")),
    cleaning_fee: num(text("numeric_mm44e30p")),
    admin_fee: num(text("numeric_mm4bb5xz")),
    application_fee: num(text("numeric_mm4b9pnf")),
    move_in_fee: num(text("numeric_mm54xvdv")),
    other_fee_1: num(text("numeric_mm44rceq")),
    other_fee_1_desc: str(text("long_text_mm4bdk3t")),
    other_fee_2: num(text("numeric_mm4bwcf0")),
    other_fee_2_desc: str(text("long_text_mm47w9d")),
    notes: str(text("long_text_mm4jpg99")),
    last_move_in_date: date(text("date_mm7nj3z0")),
    last_move_out_date: date(text("date_mm7n2vvp")),
    rental_history: str(text("color_mm7nh3y")),
    availability: str(text("color_mm86h3x")),
    availability_checked: date(text("date_mm86dw93")),
    link_status: str(text("color_mm41z556")),
    landlord_item_id: landlordId,
    landlord_name: landlord?.name ?? null,
    landlord_phone: landlord?.phone ?? null,
    landlord_contact: landlord?.contact ?? null,
    landlord_type: landlord?.type ?? null,
    landlord_approval: landlord?.approval ?? null,
    landlord_approval_note: landlord?.note ?? null,
    fields,
    synced_at: stamp,
    updated_at: stamp,
  };
}

export type PropertyRow = ReturnType<typeof toRow>;
