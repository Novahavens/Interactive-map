// Pure rules for property-locate: parsing board rows, reading listing pages,
// and deciding whether a geocoder's answer is safe to pin. No I/O, so every
// rule here is covered by locate_test.ts.

export type Candidate = {
  monday_item_id: string;
  name: string;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  property_link: string | null;
  kind: "furnishedfinder" | "address";
  input_hash: string;
};

/** Street from the item name; city/state/zip from the board columns. */
export type Parsed = { street: string; city: string | null; state: string | null; zip: string | null; oneline: string };

/** One thing to hand a geocoder, plus what its answer must agree with. */
export type Query = {
  /** Structured when we know which part is the street; oneline for URL slugs. */
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  oneline: string;
  hasNumber: boolean;
  from: "name" | "listing_url";
};

export type Place = {
  lat: number;
  lng: number;
  precision: "exact" | "approximate";
  /** Written to Monday's location column; shown as the address everywhere. */
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type Verdict = { ok: true; place: Place; note?: string } | { ok: false; reason: string; noMatch?: boolean };

const clean = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

export const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};
const CODES = new Set(Object.values(STATES));

/** "Ohio" | "oh" | "OH" -> "OH"; anything else -> null. */
export function stateCode(v: string | null | undefined): string | null {
  const s = clean(v)?.replace(/\./g, "");
  if (!s) return null;
  if (s.length === 2 && CODES.has(s.toUpperCase())) return s.toUpperCase();
  return STATES[s.toLowerCase()] ?? null;
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase().replace(/^saint\b/, "st").replace(/\./g, "") ===
    b.trim().toLowerCase().replace(/^saint\b/, "st").replace(/\./g, "");

// ---------------------------------------------------------------- names

/** Strip what people paste after an address: "(8.3 miles)", "3.4 Miles", links. */
export function tidyName(name: string): string {
  return name
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:miles?|mi)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;-]+$/, "")
    .trim();
}

const UNIT = /^(?:apt|apartment|unit|suite|ste|#|bldg|building|lot|rm|room)\b/i;

/** One tail segment of a name: "CA 92532", "Iowa City IA", "New York", "77455". */
function splitTail(seg: string): { city: string | null; state: string | null; zip: string | null } | null {
  let s = seg.trim();
  let zip: string | null = null;
  const z = s.match(/\s*\b(\d{5})(?:-\d{4})?$/);
  if (z) { zip = z[1]; s = s.slice(0, z.index).trim(); }
  const words = s.split(/\s+/).filter(Boolean);
  for (const k of [3, 2, 1]) {
    if (words.length < k) continue;
    const st = stateCode(words.slice(-k).join(" "));
    if (st) return { city: words.slice(0, -k).join(" ") || null, state: st, zip };
  }
  return zip && !s ? { city: null, state: null, zip } : null;
}

/** "24 Lincoln Avenue, Unit 9, Iowa City, IA, USA" -> street + whatever the tail says. */
export function nameParts(raw: string): { street: string; city: string | null; state: string | null; zip: string | null } {
  const name = fromStreetStart(tidyName(raw)).replace(/,?\s*\b(?:usa|u\.s\.a\.?|us|united states(?: of america)?)\.?$/i, "");
  const segs = name.split(",").map((s) => s.trim()).filter((s, i) => s && (i === 0 || !UNIT.test(s)));
  // "12703 Dorsett Rd Maryland Heights" -> street + a city segment.
  const [street0, spill] = splitAtSuffix(segs[0] ?? "");
  let street = street0;
  const tail = spill ? [spill.replace(/^in\s+/i, ""), ...segs.slice(1)] : segs.slice(1);
  let city: string | null = null, state: string | null = null, zip: string | null = null;
  for (let i = tail.length - 1; i >= 0; i--) {
    const t = splitTail(tail[i]);
    if (!t) continue;
    state = t.state; zip = t.zip;
    if (!state && i > 0) { // a bare zip: the state is one segment further left
      const t2 = splitTail(tail[i - 1]);
      if (t2?.state) { state = t2.state; city = t2.city ?? (i > 1 && !/\d/.test(tail[i - 2]) ? tail[i - 2] : null); break; }
    }
    city = t.city ?? (i > 0 && !/\d/.test(tail[i - 1]) ? tail[i - 1] : null);
    break;
  }
  if (!state && !zip && tail.length && !/\d/.test(tail[0])) city = tail[0];
  const inCity = street.match(/^(.+?\d.*?)\s+in\s+([A-Za-z][A-Za-z .'-]+)$/i);
  if (inCity) {
    street = inCity[1];
    city ??= inCity[2];
  }
  return { street: street.replace(/\s+/g, " ").trim(), city, state, zip };
}

/** "Unfurnished - 249 Moonbeam Ln. Grand Prairie, TX" -> "249 Moonbeam Ln. Grand Prairie, TX":
 *  drop a building or marketing prefix when a numbered street follows it. */
export function fromStreetStart(name: string): string {
  if (/^\d+[A-Za-z]?\s/.test(name)) return name;
  const re = /(?:^|[\s:,(–-])(\d{1,6}[A-Za-z]?\s+[A-Za-z0-9.'\s]+)/g;
  for (const m of name.matchAll(re)) {
    const words = m[1].toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
    if (words.slice(1, 7).some((w, i) => i >= 1 && SUFFIXES.has(w))) return name.slice((m.index ?? 0) + m[0].indexOf(m[1]));
  }
  return name;
}

/** Split "1124 E 79th Street Kansas City MO 64131" after the street's suffix
 *  word (and any trailing directional or unit), returning [street, rest]. */
export function splitAtSuffix(seg: string): [string, string | null] {
  const words = seg.split(/\s+/).filter(Boolean);
  if (!/^\d/.test(words[0] ?? "")) return [seg, null];
  const norm = (w: string) => w.toLowerCase().replace(/[.,]/g, "");
  let i = words.findIndex((w, k) => k >= 2 && SUFFIXES.has(norm(w)));
  if (i < 0) return [seg, null];
  while (i + 1 < words.length && SUFFIXES.has(norm(words[i + 1]))) i++; // "Old Holders Cove Road"
  // "County Road 16", "Highway 50": the number belongs to the road.
  if (/^(?:road|rd|highway|hwy|route|rte)$/.test(norm(words[i])) && /^\d+[A-Za-z]?$/.test(words[i + 1] ?? "")) i++;
  if (DIRS.has(norm(words[i + 1] ?? ""))) i++; // "285th Pl NW"
  if (i >= words.length - 1) return [words.join(" "), null];
  let rest = words.slice(i + 1);
  if (UNIT.test(rest[0] ?? "") && rest.length > 2) rest = rest.slice(2);
  else if (/^#/.test(rest[0] ?? "")) rest = rest.slice(1);
  return [words.slice(0, i + 1).join(" "), rest.join(" ") || null];
}

/** Board columns first, the name's tail where a column is blank or junk. */
function where(c: Pick<Candidate, "name" | "city" | "state" | "zipcode">, fromName: ReturnType<typeof nameParts>) {
  let city = clean(c.city)?.replace(/[,.;:]+$/, "") ?? null;
  if (city && (/\d/.test(city) || city.length < 2)) city = null;
  return {
    city: city ?? fromName.city,
    state: stateCode(c.state) ?? fromName.state,
    // Only a column that is just a zip: pasted text there can carry a house number.
    zip: clean(c.zipcode)?.match(/^(\d{5})(?:-\d{4})?$/)?.[1] ?? fromName.zip,
  };
}

/** Numbered street in the name, city/state/zip from the columns or the name's tail.
 *  This is the Census-ready shape (Census needs a house number). */
export function parseCandidate(c: Pick<Candidate, "name" | "city" | "state" | "zipcode">): Parsed | null {
  const parts = nameParts(c.name);
  const street = parts.street;
  if (!/^\d+[A-Za-z]?\s+\S/.test(street) || /^\d{5,7}_\d/.test(street)) return null;
  const { city, state, zip } = where(c, parts);
  if (!zip && !(city && state)) return null;
  const oneline = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { street, city, state, zip, oneline };
}

const SUFFIXES = new Set(["st", "street", "rd", "road", "dr", "drive", "ln", "lane", "ave", "av", "avenue", "blvd", "boulevard", "cir", "circle", "ct", "court", "pl", "place", "way", "hwy", "highway", "pkwy", "parkway", "trl", "trail", "ter", "terrace", "loop", "run", "path", "pike", "sq", "square", "cv", "cove", "xing", "crossing", "row", "aly", "alley", "bnd", "bend", "pt", "point", "rdg", "ridge", "holw", "hollow", "pass", "walk", "commons"]);
const DIRS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]);

/** A street without a house number ("SW Crestwood Drive", "Altama Ave Brunswick GA"),
 *  trimmed of a trailing city/state the board also has in its columns. Geocodio
 *  can place these on the street's centre line, which we keep as approximate. */
export function parseStreetOnly(c: Pick<Candidate, "name" | "city" | "state" | "zipcode">): Parsed | null {
  const name = tidyName(c.name).replace(/^\(?tbd\)?\s*/i, "");
  // A house number goes to parseCandidate; an ordinal street ("24th Street") belongs here.
  if (/^\d+[A-Za-z]?\s/.test(name) || /\b(?:p\.?\s*o\.?\s*box|box)\b/i.test(name)) return null;
  const parts = nameParts(name);
  const { city, state, zip } = where(c, parts);
  if (!zip && !(city && state)) return null;

  let street = parts.street;
  if (city) street = street.replace(new RegExp(`\\s+${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+[A-Za-z]{2})?$`, "i"), "");
  if (state) street = street.replace(new RegExp(`\\s+${state}$`, "i"), "");
  street = street.trim();
  const words = street.toLowerCase().replace(/\./g, "").split(/\s+/);
  if (words.length < 2 || words.length > 6 || (!SUFFIXES.has(words.at(-1)!) && !DIRS.has(words.at(-1)!))) return null;
  const oneline = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { street, city, state, zip, oneline };
}

/** Address from a listing link's slug: Zillow /homedetails/, Trulia /p/ or /home/, Redfin. */
export function parseListingUrl(link: string | null | undefined): Query | null {
  if (!link) return null;
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  let slug: string | null = null;
  if (host.endsWith("zillow.com") && parts[0] === "homedetails") slug = parts[1] ?? null;
  else if (host.endsWith("trulia.com") && (parts[0] === "p" || parts[0] === "home")) slug = (parts.at(-1) ?? "").replace(/--?\d+$/, "");
  else if (host.endsWith("redfin.com") && parts.length >= 3) {
    // /TX/Houston/123-Main-St-77001/home/123
    const st = stateCode(parts[0]);
    const street = parts[2]?.replace(/-(\d{5})$/, "");
    const zip = parts[2]?.match(/-(\d{5})$/)?.[1] ?? null;
    if (!st || !street || !/^\d/.test(street)) return null;
    const city = parts[1].replace(/-/g, " ");
    const s = street.replace(/-/g, " ");
    return { street: s, city, state: st, zip, oneline: `${s}, ${city}, ${st}${zip ? ` ${zip}` : ""}`, hasNumber: true, from: "listing_url" };
  }
  if (!slug || /address-not-disclosed|undisclosed/i.test(slug)) return null;
  const m = slug.match(/^(\d+[A-Za-z]?-.+?)-([A-Za-z]{2})-(\d{5})(?:-|$)/);
  if (!m) return null;
  const st = stateCode(m[2]);
  if (!st) return null;
  const words = m[1].replace(/-/g, " ");
  return { street: null, city: null, state: st, zip: m[3], oneline: `${words}, ${st} ${m[3]}`, hasNumber: true, from: "listing_url" };
}

export function toQuery(p: Parsed, hasNumber: boolean): Query {
  return { street: p.street, city: p.city, state: p.state, zip: p.zip, oneline: p.oneline, hasNumber, from: "name" };
}

/** What the address pipeline can try for this row, best first. */
export function addressQueries(c: Candidate): { census: Parsed | null; geocodio: Query | null } {
  const numbered = parseCandidate(c);
  const fromUrl = parseListingUrl(c.property_link);
  // A listing slug carries a full address with zip; prefer it over a name that has none.
  if (numbered) return { census: numbered, geocodio: fromUrl && !numbered.zip ? fromUrl : toQuery(numbered, true) };
  if (fromUrl) return { census: null, geocodio: fromUrl };
  const streetOnly = parseStreetOnly(c);
  if (streetOnly) return { census: null, geocodio: toQuery(streetOnly, false) };
  return { census: null, geocodio: null };
}

// ---------------------------------------------------------------- streets

/** "3628 SE Rhone St" -> "rhone": number, directionals, suffix and unit stripped,
 *  so two spellings of one street compare equal while a fuzzy match to a
 *  different street ("Rhine") does not. */
export function streetCore(street: string): string {
  let s = street.toLowerCase().replace(/[.,]/g, " ");
  s = s.replace(/\s+(#|apt|unit|suite|ste|bldg|lot|-)\s*\S*.*$/, " ");
  const words = s.split(/\s+/).filter(Boolean);
  if (/^\d/.test(words[0] ?? "")) words.shift();
  while (words.length && DIRS.has(words[0])) words.shift();
  while (words.length > 1 && (SUFFIXES.has(words.at(-1)!) || DIRS.has(words.at(-1)!))) words.pop();
  return words.join("");
}

const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
export const titleCase = (s: string) =>
  s.split(" ").map((w) => (DIRECTIONS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");

// ---------------------------------------------------------------- Census

export type CensusMatch = {
  matchType: "Exact" | "Non_Exact" | "Tie" | "No_Match";
  matched: string | null;
  lat: number | null;
  lng: number | null;
};

/** "3480 OLD FAIRBURN RD, ATLANTA, GA, 30331" -> parts */
function censusParts(matched: string | null) {
  const parts = (matched ?? "").split(",").map((s) => s.trim());
  if (parts.length < 4) return null;
  return { street: parts.slice(0, -3).join(", "), city: parts.at(-3)!, state: parts.at(-2)!, zip: parts.at(-1)! };
}

/** A pin in the wrong town is worse than no pin: anything the geocoder had to
 *  guess at must agree with the state and zip we were given, unless street and
 *  city agree exactly, in which case the board's zip was the typo. */
export function acceptCensus(p: Parsed, g: CensusMatch): Verdict {
  if (g.matchType === "No_Match") return { ok: false, reason: "no match", noMatch: true };
  if (g.matchType === "Tie") return { ok: false, reason: "ambiguous (tie)" };
  const parts = censusParts(g.matched);
  if (g.lat == null || g.lng == null || Number.isNaN(g.lat) || Number.isNaN(g.lng) || !parts) return { ok: false, reason: "no coordinates" };
  const place: Place = {
    lat: g.lat, lng: g.lng, precision: "exact",
    address: `${titleCase(parts.street)}, ${titleCase(parts.city)}, ${parts.state} ${parts.zip}`,
    city: titleCase(parts.city), state: parts.state, zip: parts.zip,
  };
  if (p.state && p.state !== parts.state.toUpperCase()) return { ok: false, reason: `state ${parts.state} differs from ${p.state}` };
  if (g.matchType === "Exact") return { ok: true, place };
  const cityOk = sameText(p.city, parts.city);
  if (p.zip) {
    if (p.zip === parts.zip) return { ok: true, place };
    if (cityOk && streetCore(p.street) === streetCore(parts.street)) return { ok: true, place, note: `zip corrected ${p.zip} -> ${parts.zip}` };
    return { ok: false, reason: `zip ${parts.zip} differs from ${p.zip}` };
  }
  if (cityOk) return { ok: true, place };
  return { ok: false, reason: "city differs and no zip to confirm" };
}

// ---------------------------------------------------------------- Geocodio

export type GeocodioResult = {
  address_components?: {
    number?: string; formatted_street?: string; street?: string; city?: string;
    state?: string; state_province?: string; zip?: string; postal_code?: string; country?: string;
  };
  formatted_address?: string;
  location?: { lat?: number; lng?: number };
  accuracy?: number;
  accuracy_type?: string;
};

const ADDRESS_LEVEL = new Set(["rooftop", "point", "range_interpolation", "nearest_rooftop_match"]);

/** Same rule as Census, plus: an address-level hit is exact, a street centroid is
 *  approximate, and a city or zip centroid is never good enough to pin. */
export function acceptGeocodio(q: Query, results: GeocodioResult[] | undefined): Verdict {
  const r = results?.[0];
  if (!r) return { ok: false, reason: "no match", noMatch: true };
  const comp = r.address_components ?? {};
  const lat = r.location?.lat, lng = r.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return { ok: false, reason: "no coordinates" };
  if (comp.country && comp.country !== "US") return { ok: false, reason: `matched in ${comp.country}` };
  const type = r.accuracy_type ?? "";
  const accuracy = r.accuracy ?? 0;
  let precision: Place["precision"];
  if (ADDRESS_LEVEL.has(type) && accuracy >= 0.8) precision = "exact";
  else if (type === "street_center" && accuracy >= 0.6) precision = "approximate";
  else return { ok: false, reason: `only matched to ${type || "unknown"} level` };

  const state = stateCode(comp.state_province ?? comp.state);
  const zip = (comp.postal_code ?? comp.zip ?? "").slice(0, 5) || null;
  const city = comp.city ?? null;
  const street = comp.formatted_street ?? comp.street ?? "";
  if (q.street && street && streetCore(q.street) !== streetCore(street)) {
    return { ok: false, reason: `street ${street} differs from ${q.street}` };
  }
  if (q.state && state && q.state !== state) return { ok: false, reason: `state ${state} differs from ${q.state}` };

  const place: Place = {
    lat, lng, precision,
    address: precision === "exact"
      ? r.formatted_address ?? `${street}, ${city}, ${state} ${zip ?? ""}`.trim()
      : [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    city, state, zip,
  };
  const cityOk = sameText(q.city, city);
  if (q.zip) {
    if (q.zip === zip) return { ok: true, place };
    if (cityOk) return { ok: true, place, note: `zip corrected ${q.zip} -> ${zip}` };
    return { ok: false, reason: `zip ${zip} differs from ${q.zip}` };
  }
  if (cityOk) return { ok: true, place };
  return { ok: false, reason: "city differs and no zip to confirm" };
}

// ---------------------------------------------------------------- Furnished Finder

/** "914878_1" from the item's link, or from a name like "ID: 914878_1". */
export function furnishedFinderId(c: Pick<Candidate, "name" | "property_link">): string | null {
  return c.property_link?.match(/furnishedfinder\.com\/property\/(\d+_\d+)/i)?.[1]
    ?? c.name.match(/(?:^|[^0-9])(\d{5,7}_\d{1,2})(?:[^0-9]|$)/)?.[1]
    ?? null;
}

export type ListingRead =
  | { kind: "found"; lat: number; lng: number; city: string | null; state: string | null }
  | { kind: "gone"; reason: string }
  | { kind: "unreadable"; reason: string };

/** The listing page embeds its record as escaped JSON. Read only the block
 *  whose details.id is this listing, so a "similar rentals" card can never be
 *  mistaken for it. Never use an LLM extraction for this: on the first page we
 *  tried it returned plausible coordinates a kilometre away from the real ones. */
export function readFurnishedFinder(html: string, id: string, status = 200, finalUrl?: string | null): ListingRead {
  if (status === 404 || status === 410) return { kind: "gone", reason: `listing page returned ${status}` };
  // A removed listing redirects to the home page with a 200.
  if (finalUrl && !finalUrl.includes(`/property/${id}`)) return { kind: "gone", reason: `listing redirects to ${finalUrl}` };
  const s = html.replace(/\\"/g, '"');
  const re = /"coordinates":\{"latitude":(-?\d+(?:\.\d+)?),"longitude":(-?\d+(?:\.\d+)?)[^}]*\},"details":\{([\s\S]*?)"__typename":"Details"\}/g;
  for (const m of s.matchAll(re)) {
    const details = m[3];
    if (details.match(/"id":"([^"]+)"/)?.[1] !== id) continue;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!(lat > 17 && lat < 72 && lng > -180 && lng < -64)) return { kind: "unreadable", reason: `coordinates ${lat},${lng} are outside the US` };
    const city = details.match(/"city":"([^"]*)"/)?.[1]?.trim() || null;
    const state = stateCode(details.match(/"state":"([^"]*)"/)?.[1]);
    return { kind: "found", lat, lng, city, state };
  }
  // No phrase sniffing for "removed": live pages carry "no longer available" in
  // their bundled UI strings.
  return { kind: "unreadable", reason: "no location block for this listing on the page" };
}

export function acceptListing(c: Pick<Candidate, "city" | "state">, r: Extract<ListingRead, { kind: "found" }>): Verdict {
  const boardState = stateCode(c.state);
  if (boardState && r.state && boardState !== r.state) {
    return { ok: false, reason: `listing is in ${r.state}, board says ${boardState}` };
  }
  const area = [r.city, r.state].filter(Boolean).join(", ");
  return {
    ok: true,
    place: { lat: r.lat, lng: r.lng, precision: "approximate", address: area || "Approximate location", city: r.city, state: r.state, zip: null },
  };
}
