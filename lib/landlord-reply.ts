// Landlord replies pasted on the map (26 Nov 2026). Staff paste the text a Furnished Finder landlord sent back;
// this reads one street address (house number and street name verbatim in the reply, optional unit, city, state
// and zip), the phone digits for the record, and decides what may be written. Rule-based: no model, nothing is
// guessed. Pure except geocodeStreet, which takes its fetch as a parameter. No runtime imports but node:crypto, so
// `npm run test:unit` covers every rule here. The route is app/api/outside/[listingId]/landlord-reply/route.ts;
// the SQL is supabase/migrations/20261126_landlord_address.sql.

import { createHash } from "node:crypto";

/** The most characters a pasted reply may have, and the most of it that is stored. */
export const REPLY_MAX = 8000;
export const REPLY_STORED_MAX = 4000;

const SUFFIXES = [
  "St", "Street", "Ave", "Avenue", "Rd", "Road", "Dr", "Drive", "Ln", "Lane", "Blvd", "Ct", "Court", "Way", "Pl", "Place",
  "Ter", "Terrace", "Cir", "Circle", "Hwy", "Pkwy", "Loop", "Trl", "Trail",
];
/** Words that cannot start a street name ("at 12 Oak St" is 12 Oak St, not 4 at 12 Oak St). */
const STOP_WORDS = new Set([
  "a", "an", "the", "in", "at", "on", "is", "it", "its", "near", "by", "off", "and", "or", "to", "of", "for", "with",
  "from", "this", "that", "located", "here", "there", "just", "very", "also", "our", "my", "your", "we", "i", "you",
  "be", "not", "so",
]);
const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA " +
    "RI SC SD TN TX UT VT VA WA WV WI WY DC").split(" "),
);
/** Canonical spelling for comparing two streets (so "Main Street" and "Main St" are the same street). */
const ABBREVIATE: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", lane: "ln", boulevard: "blvd", court: "ct", place: "pl",
  terrace: "ter", circle: "cir", highway: "hwy", parkway: "pkwy", trail: "trl", north: "n", south: "s", east: "e", west: "w",
};

const SUFFIX_ALT = SUFFIXES.join("|");
const STOP_ALT = [...STOP_WORDS].join("|");
/** A street-name word: letters (with ' and -), or an ordinal such as "21st"; never a suffix word. */
const WORD = `(?!(?:${SUFFIX_ALT})(?![A-Za-z]))(?:[A-Za-z][A-Za-z'-]*|\\d{1,3}(?:st|nd|rd|th)(?![A-Za-z]))`;
/** House number, then up to four name words, then a suffix. The number is never part of a longer number or a price. */
const STREET_RE = new RegExp(
  `(?<![A-Za-z0-9$#,])(?<num>\\d{1,6}[A-Za-z]?)(?![A-Za-z0-9])\\s+(?!(?:${STOP_ALT})(?![A-Za-z]))` +
    `(?<name>${WORD}(?:\\s+${WORD}){0,3})\\s+(?<suffix>${SUFFIX_ALT})(?![A-Za-z])\\.?`,
  "gi",
);
const UNIT_RE = /^[\s,]*(?:apt\.?|apartment|unit|ste\.?|suite|#)\s*#?\s*([A-Za-z0-9][A-Za-z0-9-]{0,9})(?![A-Za-z0-9-])/i;
const ZIP_RE = /^([^\d]{0,40}?)\b(\d{5})(?!\d)(?:-\d{4})?/;
const PHONE_RE = /(?<![\d])(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;

export interface ParsedAddress {
  addressLine: string;
  houseNumber: string;
  unit: string | null;
  city: string | null;
  /** A valid two-letter US state code, or null (a bad code is dropped, not guessed). */
  state: string | null;
  /** Five digits, or null. */
  zip: string | null;
}

export interface ParsedReply {
  status: "empty" | "address" | "no_address" | "ambiguous";
  /** Set only when status is "address": the one street the reply gives. */
  address: ParsedAddress | null;
  /** Distinct street addresses found (0 when none). */
  candidates: number;
  /** US phone numbers in the reply, as +1XXXXXXXXXX, for the record only. */
  phones: string[];
}

export type ReplyOutcome =
  | "address_saved"
  | "same_address"
  | "kept_existing"
  | "needs_city_or_zip"
  | "geocode_no_match"
  | "no_address"
  | "ambiguous"
  | "empty"
  | "duplicate";

/** Collapses whitespace and drops control characters; "" when the value is not text. */
export function normalizeSpace(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The same reply pasted twice gives the same fingerprint (case and spacing ignored). */
export function replyFingerprint(text: string): string {
  return createHash("sha256").update(normalizeSpace(text).toLowerCase()).digest("hex");
}

/** "1234 N Harvard Avenue" and "1234 n harvard ave." compare equal. */
export function canonicalStreet(line: string): string {
  return line
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => ABBREVIATE[w] ?? w)
    .join(" ");
}

export function sameStreet(a: string, b: string): boolean {
  return canonicalStreet(a) === canonicalStreet(b);
}

/** The last ten digits, as +1XXXXXXXXXX. Null when the text is not a 10 or 11 digit US number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return null;
}

/** True when two numbers are the same US number (last ten digits). */
export function samePhone(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const da = a.replace(/\D/g, "").slice(-10);
  const db = b.replace(/\D/g, "").slice(-10);
  return da.length === 10 && da === db;
}

function readPhones(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const e164 = normalizePhone(m[0]);
    if (e164) found.add(e164);
  }
  return [...found];
}

function cleanCity(raw: string): string | null {
  const words = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  while (words.length && STOP_WORDS.has((words[0] ?? "").toLowerCase())) words.shift();
  if (!words.length || words.length > 3) return null;
  if (!words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) return null;
  return words.join(" ");
}

/**
 * "Broken Arrow, OK" → city and state. A two-letter word is a state only when it is a US code and is either
 * capitals as typed or followed by a zip, so "it's ok" never becomes a state.
 */
function splitLocation(s: string, hasZip: boolean): { city: string | null; state: string | null } {
  const m = /^(?:(.*?)[\s,]+)?([A-Za-z]{2})\.?$/.exec(s);
  if (!m) return { city: cleanCity(s), state: null };
  const token = m[2] ?? "";
  const upper = token.toUpperCase();
  const state = US_STATES.has(upper) && (token === upper || hasZip) ? upper : null;
  return { city: m[1] ? cleanCity(m[1]) : null, state };
}

function afterStreet(tail: string): { unit: string | null; city: string | null; state: string | null; zip: string | null } {
  let rest = tail;
  let unit: string | null = null;
  const u = UNIT_RE.exec(rest);
  if (u && (/\d/.test(u[1] ?? "") || (u[1] ?? "").length === 1)) {
    unit = u[1] ?? null;
    rest = rest.slice(u[0].length);
  }
  rest = rest.replace(/^[\s,.;:]+/, "");
  const z = ZIP_RE.exec(rest);
  let before: string;
  let zip: string | null = null;
  if (z) {
    zip = z[2] ?? null;
    before = z[1] ?? "";
  } else {
    before = (rest.split(/[.;!?\d]/)[0] ?? "").slice(0, 60);
  }
  const loc = splitLocation(before.replace(/^[\s,]+/, "").replace(/[\s,]+$/, ""), zip !== null);
  return { unit, city: loc.city, state: loc.state, zip };
}

interface StreetHit {
  line: string;
  houseNumber: string;
  end: number;
  key: string;
}

function streetHits(text: string): StreetHit[] {
  const out: StreetHit[] = [];
  for (const m of text.matchAll(STREET_RE)) {
    const line = m[0].replace(/\.$/, "");
    out.push({
      line,
      houseNumber: m.groups?.num ?? "",
      end: (m.index ?? 0) + m[0].length,
      key: canonicalStreet(line),
    });
  }
  return out;
}

/**
 * Reads one reply. "address" only when exactly one street (house number and suffix) is in the text; several
 * distinct streets are "ambiguous"; none is "no_address". The street, unit, city, state and zip are copied from
 * the text, so each is verbatim; a bad state code or a zip that is not five digits is dropped.
 */
export function parseLandlordReply(raw: unknown): ParsedReply {
  const text = normalizeSpace(raw);
  if (!text) return { status: "empty", address: null, candidates: 0, phones: [] };
  const phones = readPhones(text);
  const hits = streetHits(text);
  const distinct = [...new Map(hits.map((h) => [h.key, h])).values()];
  if (distinct.length === 0) return { status: "no_address", address: null, candidates: 0, phones };
  if (distinct.length > 1) return { status: "ambiguous", address: null, candidates: distinct.length, phones };
  const hit = distinct[0] as StreetHit;
  const loc = afterStreet(text.slice(hit.end));
  return {
    status: "address",
    address: { addressLine: hit.line, houseNumber: hit.houseNumber, unit: loc.unit, city: loc.city, state: loc.state, zip: loc.zip },
    candidates: 1,
    phones,
  };
}

/** The street on the listing today, as the database holds it (all null when the home has no address). */
export interface ListingAddress {
  addressLine: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface GeocodeRequest {
  oneLine: string;
  houseNumber: string;
}

/** Census needs a city and state, or a zip. */
export function geocodable(a: ParsedAddress): boolean {
  return a.zip !== null || (a.city !== null && a.state !== null);
}

export function oneLine(a: ParsedAddress): string {
  return [a.addressLine, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * What the route may do with a reply. It never overwrites an address the listing already has: a different street
 * is "kept_existing", the same street is "same_address". A new street with no city or zip is not placed.
 * `geocode` is set only when a street is accepted and the listing has none; the route looks it up next.
 */
export function planReply(parsed: ParsedReply, home: ListingAddress): { outcome: ReplyOutcome; address: ParsedAddress | null; geocode: GeocodeRequest | null } {
  if (parsed.status === "empty") return { outcome: "empty", address: null, geocode: null };
  if (parsed.status === "no_address") return { outcome: "no_address", address: null, geocode: null };
  if (parsed.status === "ambiguous") return { outcome: "ambiguous", address: null, geocode: null };
  const a = parsed.address;
  if (!a) return { outcome: "no_address", address: null, geocode: null };
  if (home.addressLine) {
    return { outcome: sameStreet(a.addressLine, home.addressLine) ? "same_address" : "kept_existing", address: a, geocode: null };
  }
  if (!geocodable(a)) return { outcome: "needs_city_or_zip", address: a, geocode: null };
  return { outcome: "address_saved", address: a, geocode: { oneLine: oneLine(a), houseNumber: a.houseNumber } };
}

export interface Coords {
  lat: number;
  lng: number;
}

/** What the save function writes for the street (lat and lng set geog; address_key is generated from the address). */
export interface AddressWrite {
  address_line: string;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number;
  lng: number;
  precision: "approx";
}

export function addressWrite(a: ParsedAddress, c: Coords): AddressWrite {
  return {
    address_line: a.addressLine,
    unit: a.unit,
    city: a.city,
    state: a.state,
    zip: a.zip,
    lat: c.lat,
    lng: c.lng,
    // Census interpolates along the street by house-number range; it is not a rooftop pin.
    precision: "approx",
  };
}

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/** A Census lookup that failed in a way worth trying again (network, timeout, a gateway error). */
export class GeocoderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocoderError";
  }
}

/**
 * The first Census match, when it is the same house number (Census can match a neighbouring number). Null when
 * there is no such match; nothing is guessed.
 */
export function parseCensusMatch(json: unknown, houseNumber: string): Coords | null {
  const root = isRecord(json) ? json : null;
  const result = root && isRecord(root.result) ? root.result : null;
  const matches = result && Array.isArray(result.addressMatches) ? result.addressMatches : [];
  const first = matches[0];
  if (!isRecord(first) || typeof first.matchedAddress !== "string") return null;
  if (!first.matchedAddress.toUpperCase().startsWith(`${houseNumber.toUpperCase()} `)) return null;
  const xy = isRecord(first.coordinates) ? first.coordinates : null;
  if (!xy) return null;
  const lng = Number(xy.x);
  const lat = Number(xy.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat <= -90 || lat >= 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * The US Census geocoder (benchmark Public_AR_Current). Resolves to coordinates, or null when Census has no match.
 * Throws GeocoderError when the lookup itself failed: the caller then saves nothing and asks for a retry.
 */
export async function geocodeStreet(req: GeocodeRequest, fetchFn: typeof fetch = fetch, timeoutMs = 5000): Promise<Coords | null> {
  const url = `${CENSUS_URL}?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(req.oneLine)}`;
  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch {
    throw new GeocoderError("unreachable");
  }
  if (!res.ok) throw new GeocoderError(`status ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new GeocoderError("not json");
  }
  return parseCensusMatch(json, req.houseNumber);
}

/** The record kept in landlord_outreach.extracted (no full phone or address is logged; this is stored data). */
export function extractedRecord(parsed: ParsedReply, outcome: ReplyOutcome, placed: boolean): Record<string, unknown> {
  const a = parsed.address;
  return {
    v: 1,
    outcome,
    candidates: parsed.candidates,
    address: a ? { address_line: a.addressLine, unit: a.unit, city: a.city, state: a.state, zip: a.zip } : null,
    phone: parsed.phones[0] ?? null,
    phones_in_reply: parsed.phones.length,
    placed,
  };
}

export const REPLY_MESSAGE: Record<ReplyOutcome, string> = {
  address_saved: "Street address saved. The reply is saved too.",
  same_address: "The home already has this street. Nothing changed; the reply is saved.",
  kept_existing: "The home already has a different street address, so it was not changed. The reply is saved for a person to check.",
  needs_city_or_zip: "A street was found, but the reply has no city and state or zip, so the map cannot place it. No address was saved; the reply is saved for a person.",
  geocode_no_match: "A street was found, but the map could not place it. No address was saved; the reply is saved for a person.",
  no_address: "No street address with a house number in the reply. The reply is saved for a person to read.",
  ambiguous: "The reply has more than one street address, so none was saved. The reply is saved for a person to read.",
  empty: "The reply is empty.",
  duplicate: "This reply is already saved for this home. Nothing changed.",
};

export interface LandlordReplyResponse {
  ok: true;
  outcome: ReplyOutcome;
  message: string;
  duplicate: boolean;
  addressWritten: boolean;
  address: ListingAddress | null;
  /** Other outside homes or PROPERTY DATABASE homes with the same street; flagged, never merged. */
  possibleDuplicates: number;
  /** The address is in our database but the home is in PROPERTY DATABASE: a person copies it there (Monday is not written). */
  copyToPropertyDb: boolean;
}

/** What the save function answers, as the route reads it. */
export type SaveAnswer =
  | { kind: "saved"; addressWritten: boolean; address: ListingAddress; propertyItemId: string | null; possibleDuplicates: number }
  | { kind: "duplicate"; address: ListingAddress; propertyItemId: string | null }
  | { kind: "not_found" }
  | { kind: "wrong_source" }
  | { kind: "forbidden" }
  | { kind: "error" };

export type PrepareAnswer =
  | { kind: "ready"; listing: ListingAddress; propertyItemId: string | null; recorded: boolean; hostPhone: string | null }
  | { kind: "not_found" }
  | { kind: "wrong_source" }
  | { kind: "forbidden" }
  | { kind: "error" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function addressOf(d: Record<string, unknown>): ListingAddress {
  return {
    addressLine: text(d.address_line),
    unit: text(d.unit),
    city: text(d.city),
    state: text(d.state),
    zip: text(d.zip),
  };
}

/** Reads map_listing_reply_prepare's answer. */
export function interpretPrepare(data: unknown): PrepareAnswer {
  if (!isRecord(data)) return { kind: "error" };
  if (data.ok === false && data.error === "forbidden") return { kind: "forbidden" };
  if (data.ok !== true) return { kind: "error" };
  if (data.found !== true) return { kind: "not_found" };
  if (data.source !== "furnished_finder") return { kind: "wrong_source" };
  return {
    kind: "ready",
    listing: addressOf(data),
    propertyItemId: text(data.property_item_id),
    recorded: data.recorded === true,
    hostPhone: text(data.host_phone),
  };
}

/** Reads map_listing_address_save's answer. */
export function interpretSave(data: unknown): SaveAnswer {
  if (!isRecord(data)) return { kind: "error" };
  if (data.ok === false && data.error === "forbidden") return { kind: "forbidden" };
  if (data.ok === false && data.error === "wrong_source") return { kind: "wrong_source" };
  if (data.ok !== true) return { kind: "error" };
  if (data.found !== true) return { kind: "not_found" };
  const dups = Array.isArray(data.possible_duplicates) ? data.possible_duplicates.length : 0;
  const props = Array.isArray(data.property_db_matches) ? data.property_db_matches.length : 0;
  if (data.status === "duplicate") return { kind: "duplicate", address: addressOf(data), propertyItemId: text(data.property_item_id) };
  if (data.status === "saved") {
    return {
      kind: "saved",
      addressWritten: data.address_written === true,
      address: addressOf(data),
      propertyItemId: text(data.property_item_id),
      possibleDuplicates: dups + props,
    };
  }
  return { kind: "error" };
}

/**
 * The answer the browser gets. A street the listing already had by the time of the save is reported as
 * kept_existing, not as saved.
 */
export function replyResponse(
  outcome: ReplyOutcome,
  saved: { addressWritten: boolean; address: ListingAddress | null; propertyItemId: string | null; possibleDuplicates: number; duplicate: boolean },
): LandlordReplyResponse {
  const effective: ReplyOutcome =
    saved.duplicate ? "duplicate" : outcome === "address_saved" && !saved.addressWritten ? "kept_existing" : outcome;
  return {
    ok: true,
    outcome: effective,
    message: REPLY_MESSAGE[effective],
    duplicate: saved.duplicate,
    addressWritten: saved.addressWritten,
    address: saved.address,
    possibleDuplicates: saved.possibleDuplicates,
    copyToPropertyDb: saved.addressWritten && saved.propertyItemId !== null,
  };
}

/** The switched-off answer for POST /api/outside/:listingId/landlord-reply (the `outside` feature is off). */
export const LANDLORD_REPLY_OFF = {
  status: 503,
  body: { error: "Pasting landlord replies is switched off", code: "feature_off" },
} as const;
