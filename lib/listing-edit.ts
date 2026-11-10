// Editing a property's listing details from the map. Pure: no I/O and no imports, so the browser (the edit
// form) and the server (the edit route) share one definition of what can be edited, how a value is checked,
// and how it is written to Monday. `npm run test:unit` covers every rule here.
//
// Monday is the source of truth. The route writes there first, then mirrors the same values into Supabase so
// the map shows them at once; Monday's own webhook re-reads the item a second later and confirms the mirror.

export type EditKind = "int" | "decimal" | "money" | "date" | "yesno" | "url" | "longtext" | "address";
export type EditGroup = "location" | "availability" | "basics" | "costs" | "listing";
/**
 * A street address picked from Google's suggestions: the text Monday shows, where the pin goes, and the parts
 * the board keeps in its own City / State / Zip columns (left out when Google didn't give them).
 */
export interface AddressValue {
  address: string;
  lat: number;
  lng: number;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
}
export type EditValue = number | string | AddressValue | null;

export interface EditField {
  /** The property field, as in PropertyDetail and the Supabase `properties` row. */
  key: EditKey;
  label: string;
  /** Monday column id on the PROPERTY DATABASE board (supabase/functions/_shared/mapping.ts reads the same ids). */
  column: string;
  kind: EditKind;
  group: EditGroup;
  min?: number;
  max?: number;
  maxLength?: number;
}

export const EDIT_FIELDS = [
  { key: "address", label: "Address", column: "location_mm416w07", kind: "address", group: "location", maxLength: 300 },
  { key: "next_availability", label: "Next availability", column: "date_mm4416ne", kind: "date", group: "availability" },
  { key: "bedrooms", label: "Bedrooms", column: "numeric_mm44r6x9", kind: "int", group: "basics", min: 0, max: 20 },
  { key: "bathrooms", label: "Bathrooms", column: "numeric_mm44dmx5", kind: "decimal", group: "basics", min: 0, max: 20 },
  { key: "sqft", label: "Square feet", column: "numeric_mm4b1e83", kind: "int", group: "basics", min: 0, max: 100000 },
  { key: "pet_status", label: "Pets allowed", column: "dropdown_mm3ywgac", kind: "yesno", group: "basics" },
  { key: "furnished", label: "Furnished", column: "dropdown_mm3yqhxg", kind: "yesno", group: "basics" },
  { key: "fenced_yard", label: "Fenced yard", column: "dropdown_mm3yt55p", kind: "yesno", group: "basics" },
  { key: "monthly_rate", label: "Monthly rent", column: "numeric_mm44b6ew", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "security_deposit", label: "Security deposit", column: "numeric_mm44cgzh", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "cleaning_fee", label: "Cleaning fee", column: "numeric_mm44e30p", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "admin_fee", label: "Admin fee", column: "numeric_mm4bb5xz", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "application_fee", label: "Application fee", column: "numeric_mm4b9pnf", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "move_in_fee", label: "Move-in fee", column: "numeric_mm54xvdv", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "pet_deposit", label: "Pet deposit", column: "numeric_mm449kx6", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "pet_fee", label: "Pet fee", column: "numeric_mm4486t7", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "pet_rent", label: "Monthly pet rent", column: "numeric_mm44g73b", kind: "money", group: "costs", min: 0, max: 100000 },
  { key: "property_link", label: "Listing link", column: "text_mm3ykmnv", kind: "url", group: "listing", maxLength: 500 },
  { key: "notes", label: "Terms and notes", column: "long_text_mm4jpg99", kind: "longtext", group: "listing", maxLength: 2000 },
] as const satisfies readonly (Omit<EditField, "key"> & { key: string })[];

export type EditKey = (typeof EDIT_FIELDS)[number]["key"];
export type EditChanges = Partial<Record<EditKey, EditValue>>;

/**
 * Fields the availability check owns on a listing it watches (lib/availability monitorOwnsDate): the form shows
 * them read-only and the edit route refuses them, because the next check would replace a hand-made change.
 */
export const MONITOR_OWNED_KEYS: readonly EditKey[] = ["next_availability"];
export const MONITOR_OWNED_MESSAGE = "Next availability is set by the availability check for this listing";

export const EDIT_GROUPS: Record<EditGroup, string> = {
  location: "Address",
  availability: "Availability",
  basics: "Basics",
  costs: "Rent and fees",
  listing: "Listing",
};

export const FIELD_BY_KEY = new Map<string, EditField>(EDIT_FIELDS.map((f) => [f.key, f as EditField]));
/** The board's own City / State / Zip text columns, written alongside the location column on an address edit. */
export const ADDRESS_PART_COLUMNS = { city: "text_mm3yzy0x", state: "text_mm3yw9nf", zipcode: "text_mm3y5tq6" } as const;
const ADDRESS_PARTS = Object.keys(ADDRESS_PART_COLUMNS) as (keyof typeof ADDRESS_PART_COLUMNS)[];
const ADDRESS_PART_MAX = 100;
const PICK_ADDRESS = "Pick an address from the suggestions";
export const EDITOR_MAX = 80;
/** Dates outside this window are almost certainly typos (a year of 0026 or 2206). */
const DATE_MIN = "2020-01-01";
const DATE_MAX = "2035-12-31";

/** POST /api/properties/:id/edit body. `base` is what the editor saw for each changed field, for the conflict check. */
/** Where the values came from when the form was filled in from a call summary ("Owner said"). */
export interface EditSource {
  kind: "quo_call";
  callId: string;
}

export interface EditListingRequest {
  editor: string;
  changes: EditChanges;
  base: EditChanges;
  source?: EditSource;
}

export type ParsedEdit =
  | { ok: true; editor: string; changes: EditChanges; base: EditChanges; source?: EditSource }
  | { ok: false; error: string };

/** A Quo call id. A source that isn't one is ignored (the edit itself stands on its own). */
const CALL_ID = /^AC[A-Za-z0-9_-]{4,64}$/;

// Control, bidi and zero-width characters out. Long text keeps its line breaks; everything else is one line.
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
function cleanText(v: string, multiline: boolean): string {
  let s = v.replace(INVISIBLE, "").replace(/\r\n?/g, "\n");
  s = multiline ? s.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]+/g, " ") : s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ");
  return s.trim();
}

function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * One value, checked and normalised for its field. Empty input clears the field (null). Numbers may arrive as
 * text ("$2,400") from a form; they leave as numbers. Returns an error message instead of throwing.
 */
export function normaliseValue(field: EditField, raw: unknown): { ok: true; value: EditValue } | { ok: false; error: string } {
  // An address is never cleared from the map (it is the pin), and it must be a place Google resolved.
  if (field.kind === "address") return normaliseAddress(field, raw);
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };
  switch (field.kind) {
    case "int":
    case "decimal":
    case "money": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[$,\s]/g, "")) : Number.NaN;
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number` };
      if (field.kind === "int" && !Number.isInteger(n)) return { ok: false, error: `${field.label} must be a whole number` };
      if (field.kind === "decimal" && Math.round(n * 2) !== n * 2) return { ok: false, error: `${field.label} must be a whole or half number` };
      if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
        return { ok: false, error: `${field.label} must be between ${field.min} and ${field.max?.toLocaleString("en-US")}` };
      }
      return { ok: true, value: field.kind === "money" ? Math.round(n * 100) / 100 : n };
    }
    case "date": {
      if (typeof raw !== "string" || !isCalendarDate(raw.trim())) return { ok: false, error: `${field.label} must be a date (YYYY-MM-DD)` };
      const d = raw.trim();
      if (d < DATE_MIN || d > DATE_MAX) return { ok: false, error: `${field.label} must be between 2020 and 2035` };
      return { ok: true, value: d };
    }
    case "yesno": {
      const t = typeof raw === "string" ? raw.trim().toLowerCase() : raw === true ? "yes" : raw === false ? "no" : "";
      if (t === "yes") return { ok: true, value: "Yes" };
      if (t === "no") return { ok: true, value: "No" };
      return { ok: false, error: `${field.label} must be Yes, No or blank` };
    }
    case "url": {
      if (typeof raw !== "string") return { ok: false, error: `${field.label} must be a link` };
      const s = cleanText(raw, false);
      if (s.length > (field.maxLength ?? 500)) return { ok: false, error: `${field.label} is too long` };
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        return { ok: false, error: `${field.label} must be a full link starting with https://` };
      }
      if ((u.protocol !== "https:" && u.protocol !== "http:") || !/^https?:\/\//i.test(s)) {
        return { ok: false, error: `${field.label} must start with https://` };
      }
      // The scheme lower-cased ("HTTPS://x" → "https://x"), the rest as typed: the database checks ^https?://.
      return { ok: true, value: s.replace(/^https?:/i, (m) => m.toLowerCase()) };
    }
    case "longtext": {
      if (typeof raw !== "string") return { ok: false, error: `${field.label} must be text` };
      const s = cleanText(raw, true);
      if (s.length > (field.maxLength ?? 2000)) return { ok: false, error: `${field.label} is longer than ${field.maxLength} characters` };
      return { ok: true, value: s === "" ? null : s };
    }
  }
}

export const isAddress = (v: unknown): v is AddressValue =>
  !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as AddressValue).address === "string";

/** The text two address values are compared by: the address as Monday shows it, spacing and case aside. */
function addressKey(v: EditValue | undefined): string {
  if (v === null || v === undefined) return "";
  return cleanText(isAddress(v) ? v.address : String(v), false).toLowerCase();
}

/**
 * The form keeps a picked place as JSON in its text value (so a stored draft survives a reload); the route
 * gets it as an object. Typed text that was never picked, or an empty value, is refused: the address is the
 * pin, so it needs coordinates, and it can't be blanked from the map.
 */
function normaliseAddress(field: EditField, raw: unknown): { ok: true; value: AddressValue } | { ok: false; error: string } {
  let o: unknown = raw;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      o = JSON.parse(raw);
    } catch {
      o = null;
    }
  }
  if (!isAddress(o)) return { ok: false, error: PICK_ADDRESS };
  const address = cleanText(o.address, false);
  if (!address) return { ok: false, error: PICK_ADDRESS };
  if (address.length > (field.maxLength ?? 300)) return { ok: false, error: `${field.label} is too long` };
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  // Monday's own limits: latitude strictly inside ±90, longitude within ±180.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) >= 90 || Math.abs(lng) > 180) {
    return { ok: false, error: `${field.label} has no map position; pick it from the suggestions again` };
  }
  const round = (n: number) => Math.round(n * 1e7) / 1e7;
  const value: AddressValue = { address, lat: round(lat), lng: round(lng) };
  for (const part of ADDRESS_PARTS) {
    const v = o[part];
    if (v === null || v === undefined) continue;
    if (typeof v !== "string") return { ok: false, error: `${field.label} ${part} must be text` };
    const t = cleanText(v, false);
    if (t.length > ADDRESS_PART_MAX) return { ok: false, error: `${field.label} ${part} is too long` };
    if (t) value[part] = t;
  }
  return { ok: true, value };
}

/** Checks a whole request body. Unknown fields, a missing editor name, or nothing to change are errors. */
export function parseEditRequest(body: unknown): ParsedEdit {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const editor = typeof b.editor === "string" ? cleanText(b.editor, false) : "";
  if (!editor) return { ok: false, error: "Your name is required" };
  if (editor.length > EDITOR_MAX) return { ok: false, error: `Your name must be at most ${EDITOR_MAX} characters` };
  if (editor.includes("://")) return { ok: false, error: "Links are not allowed in your name" };
  const rawChanges = b.changes;
  if (rawChanges === null || typeof rawChanges !== "object" || Array.isArray(rawChanges)) return { ok: false, error: "changes must be an object" };
  const rawBase = b.base === undefined ? {} : b.base;
  if (rawBase === null || typeof rawBase !== "object" || Array.isArray(rawBase)) return { ok: false, error: "base must be an object" };

  const changes: EditChanges = {};
  const base: EditChanges = {};
  for (const [key, raw] of Object.entries(rawChanges as Record<string, unknown>)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) return { ok: false, error: `${key} can't be edited from the map` };
    const v = normaliseValue(field, raw);
    if (!v.ok) return v;
    changes[field.key] = v.value;
    // The base is what the form showed; it only has to be comparable with what Monday holds now, so it is read
    // the way currentValue/fromMondayText read Monday: a value that wouldn't pass validation (pets "N/D") stays
    // as its text. Turning it into null would make such a field conflict on every save, for ever.
    const rb = (rawBase as Record<string, unknown>)[key];
    // An address base is compared by its text only (Monday's location column reads back as text).
    if (field.kind === "address") base[field.key] = isAddress(rb) ? cleanText(rb.address, false) || null : typeof rb === "string" ? cleanText(rb, false) || null : null;
    else base[field.key] = typeof rb === "number" || typeof rb === "string" ? currentValue(field, { [field.key]: rb }) : null;
  }
  if (Object.keys(changes).length === 0) return { ok: false, error: "Nothing to change" };
  const s = b.source as Record<string, unknown> | null | undefined;
  const source = s && typeof s === "object" && s.kind === "quo_call" && typeof s.callId === "string" && CALL_ID.test(s.callId)
    ? { kind: "quo_call" as const, callId: s.callId }
    : undefined;
  return { ok: true, editor, changes, base, ...(source && { source }) };
}

/**
 * Two values of one field are the same (numbers by value, text exactly, null = blank). An address is compared
 * by its text, spacing and case aside: the pin follows the text, and Monday reads the column back as text.
 */
export function sameValue(a: EditValue | undefined, b: EditValue | undefined, field?: EditField): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (field?.kind === "address" || isAddress(x) || isAddress(y)) return addressKey(x) === addressKey(y);
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < 0.005;
  return x === y;
}

/**
 * What a property currently holds for a field, from the mirror row or the detail the panel loaded, normalised
 * the same way as an edit so the form can tell what changed. A value that wouldn't pass validation (a Monday
 * cell typed by hand, e.g. pets "N/D") comes back as text so it shows, and an edit replaces it.
 */
export function currentValue(field: EditField, row: Record<string, unknown>): EditValue {
  if (field.kind === "address") {
    // The record's address, with its pin. No coordinates means Monday's location column is empty (the text
    // the panel shows then is only the city and state), so there is nothing to compare an edit against.
    const { lat, lng, address } = row;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    return { address: typeof address === "string" ? address : "", lat, lng };
  }
  const raw = row[field.key];
  if (raw === null || raw === undefined || raw === "") return null;
  const v = normaliseValue(field, typeof raw === "number" ? raw : String(raw));
  return v.ok ? v.value : String(raw);
}

/** A Monday column's `text` as a comparable value (the conflict check reads the item fresh from Monday). */
export function fromMondayText(field: EditField, text: string | null | undefined): EditValue {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (field.kind === "date") return t.slice(0, 10);
  if (field.kind === "address") return t; // the location column's text is its address
  return currentValue(field, { [field.key]: t });
}

/**
 * The `column_values` JSON for Monday's change_multiple_column_values. Numbers and text are strings; a date
 * is {date}; Yes/No is a dropdown label; long text is {text}. Labels are never created: the dropdowns
 * already hold exactly Yes and No.
 *
 * A null clears the column, for every kind. Verified live on 28 Oct 2026 on a throwaway board: null cleared
 * numbers, text, long text, date and dropdown, while an empty string on a numbers column left a stored empty
 * value instead of clearing it.
 *
 * An address is a location column, {lat, lng, address} with the numbers as strings (Monday's documented
 * format), plus the board's City / State / Zip text columns for the parts Google gave. It is never cleared.
 */
export function mondayColumnValues(changes: EditChanges): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field || value === undefined) continue;
    if (field.kind === "address") {
      if (!isAddress(value)) continue;
      out[field.column] = { lat: String(value.lat), lng: String(value.lng), address: value.address };
      for (const part of ADDRESS_PARTS) if (value[part]) out[ADDRESS_PART_COLUMNS[part]] = value[part];
      continue;
    }
    if (value === null) {
      out[field.column] = null;
      continue;
    }
    switch (field.kind) {
      case "int":
      case "decimal":
      case "money":
      case "url":
        out[field.column] = String(value);
        break;
      case "date":
        out[field.column] = { date: value };
        break;
      case "yesno":
        out[field.column] = { labels: [value] };
        break;
      case "longtext":
        out[field.column] = { text: value };
        break;
    }
  }
  return out;
}

/** How a value reads in the Monday note and the confirm line: "$2,400", "Nov 1, 2026", "Yes", "blank". */
export function displayValue(field: EditField, value: EditValue | undefined): string {
  if (value === null || value === undefined || value === "") return "blank";
  if (isAddress(value)) return value.address;
  if (field.kind === "money" && typeof value === "number") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (field.kind === "date" && typeof value === "string" && isCalendarDate(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  if (field.kind === "longtext" && typeof value === "string") return value.length > 60 ? `"${value.slice(0, 59).trimEnd()}…"` : `"${value}"`;
  return String(value);
}

/** One line per changed field, in form order: "Monthly rent: $2,200 → $2,400". Unchanged fields are left out. */
export function diffLines(changes: EditChanges, before: EditChanges): string[] {
  const lines: string[] = [];
  for (const field of EDIT_FIELDS as readonly EditField[]) {
    if (!(field.key in changes)) continue;
    const after = changes[field.key];
    if (sameValue(after, before[field.key], field)) continue;
    lines.push(`${field.label}: ${displayValue(field, before[field.key])} → ${displayValue(field, after)}`);
  }
  return lines;
}

/** The fields whose value in Monday no longer matches what the editor started from. */
export function conflicts(base: EditChanges, current: EditChanges): EditKey[] {
  return (Object.keys(base) as EditKey[]).filter((k) => !sameValue(base[k], current[k], FIELD_BY_KEY.get(k)));
}
