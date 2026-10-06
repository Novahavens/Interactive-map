// Geocodes PROPERTY DATABASE items that have no location in Monday and writes
// the result back into Monday's location column. Monday stays the system of
// record: the existing monday-webhook then mirrors lat/lng into
// public.properties, so the map picks the pins up on its own.
//
// Street addresses live in the item *name* on the board (e.g. "3480 Old
// Fairburn Rd") while City / State / Zip are separate text columns, which is
// why these rows never had coordinates. Geocoder: US Census Bureau batch
// geocoder (free, no key, US-only), with the one-line endpoint as a fallback.
//
// ?batch=N   rows per invocation (default 200, max 500)
// ?dry=1     geocode and report, write nothing anywhere
// Guarded by the same x-sync-secret as monday-backfill (public.sync_config).
import { createClient } from "npm:@supabase/supabase-js@2";

const PROPERTY_BOARD = "18415735059";
const LOCATION_COLUMN = "location_mm416w07";
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations";
const BENCHMARK = "Public_AR_Current";
const MONDAY_API = "https://api.monday.com/v2";
const WALL_CLOCK_MS = 110_000;
const MONDAY_CHUNK = 20;

type Candidate = { monday_item_id: string; name: string; city: string | null; state: string | null; zipcode: string | null };
type Parsed = { street: string; city: string | null; state: string | null; zip: string | null; oneline: string };
type MatchType = "Exact" | "Non_Exact" | "Tie" | "No_Match";
type Geo = { matchType: MatchType; matched: string | null; lat: number | null; lng: number | null; city: string | null; state: string | null; zip: string | null; via: "batch" | "oneline" };
type Outcome = "written" | "accepted" | "rejected" | "no_match" | "unparsable" | "monday_error";
type Result = { id: string; input: string; outcome: Outcome; matched?: string | null; lat?: number | null; lng?: number | null; detail?: string | null };

const NO_MATCH: Geo = { matchType: "No_Match", matched: null, lat: null, lng: null, city: null, state: null, zip: null, via: "batch" };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function syncSecret(): Promise<string | null> {
  const { data } = await sb.from("sync_config").select("value").eq("key", "SYNC_SECRET").maybeSingle();
  return (data as { value?: string } | null)?.value ?? Deno.env.get("SYNC_SECRET") ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const clean = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Street from the item name; city/state/zip from the board columns, falling
 *  back to whatever the name carries ("333 108th Ave SE, Bellevue, WA 98004"). */
export function parseCandidate(c: Candidate): Parsed | null {
  const name = c.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const zipsInName = [...name.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)].filter((m) => (m.index ?? 0) > 0);
  const zipFromName = zipsInName.at(-1)?.[1] ?? null;
  const stateFromName = name.match(/,\s*([A-Za-z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/)?.[1]?.toUpperCase() ?? null;

  const segs = name.split(",").map((s) => s.trim()).filter(Boolean);
  let street = segs[0] ?? "";
  let cityFromName = segs.length >= 2 && !/\d/.test(segs[1]) ? segs[1] : null;
  const inCity = street.match(/^(.+?\d.*?)\s+in\s+([A-Za-z][A-Za-z .'-]+)$/i);
  if (inCity) {
    street = inCity[1];
    cityFromName ??= inCity[2];
  }
  street = street.replace(/\s+/g, " ").trim();
  if (!/^\d/.test(street)) return null;

  let city = clean(c.city);
  if (city && (/\d/.test(city) || city.length < 2)) city = null;
  city ??= cityFromName;
  let state = clean(c.state)?.toUpperCase() ?? null;
  if (state && !/^[A-Z]{2}$/.test(state)) state = null;
  state ??= stateFromName;
  const zip = clean(c.zipcode)?.match(/\d{5}/)?.[0] ?? zipFromName;
  if (!zip && !(city && state)) return null;

  const oneline = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { street, city, state, zip, oneline };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function components(matched: string | null) {
  const parts = (matched ?? "").split(",").map((s) => s.trim());
  return parts.length >= 4
    ? { city: parts.at(-3) ?? null, state: parts.at(-2) ?? null, zip: parts.at(-1) ?? null }
    : { city: null, state: null, zip: null };
}

const csvField = (v: string) => `"${v.replace(/"/g, '""')}"`;

async function censusBatch(rows: { id: string; p: Parsed }[]): Promise<Map<string, Geo>> {
  const csv = rows.map((r) => [r.id, r.p.street, r.p.city ?? "", r.p.state ?? "", r.p.zip ?? ""].map(csvField).join(",")).join("\n");
  const form = new FormData();
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", BENCHMARK);
  const res = await fetch(`${CENSUS}/addressbatch`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`census batch returned ${res.status}`);
  const out = new Map<string, Geo>();
  for (const line of (await res.text()).split(/\r?\n/)) {
    if (!line.trim()) continue;
    // id, input, Match|No_Match|Tie, Exact|Non_Exact, matched address, "lon,lat", tiger id, side
    const f = parseCsvLine(line);
    if (f[2] !== "Match") {
      out.set(f[0], { ...NO_MATCH, matchType: f[2] === "Tie" ? "Tie" : "No_Match" });
      continue;
    }
    const [lng, lat] = (f[5] ?? "").split(",").map(Number);
    out.set(f[0], { matchType: f[3] === "Exact" ? "Exact" : "Non_Exact", matched: f[4], lat, lng, ...components(f[4]), via: "batch" });
  }
  return out;
}

async function censusOneline(p: Parsed): Promise<Geo> {
  const url = `${CENSUS}/onelineaddress?benchmark=${BENCHMARK}&format=json&address=${encodeURIComponent(p.oneline)}`;
  const res = await fetch(url);
  if (!res.ok) return { ...NO_MATCH, via: "oneline" };
  const matches = (await res.json())?.result?.addressMatches ?? [];
  if (!matches.length) return { ...NO_MATCH, via: "oneline" };
  if (matches.length > 1) return { ...NO_MATCH, matchType: "Tie", via: "oneline" };
  const m = matches[0];
  const comp = m.addressComponents ?? {};
  return {
    matchType: "Non_Exact",
    matched: m.matchedAddress ?? null,
    lat: Number(m.coordinates?.y),
    lng: Number(m.coordinates?.x),
    city: comp.city ?? null,
    state: comp.state ?? null,
    zip: comp.zip ?? null,
    via: "oneline",
  };
}

const SUFFIXES = new Set(["st", "street", "rd", "road", "dr", "drive", "ln", "lane", "ave", "avenue", "blvd", "boulevard", "cir", "circle", "ct", "court", "pl", "place", "way", "hwy", "highway", "pkwy", "parkway", "trl", "trail", "ter", "terrace", "loop", "run", "path", "pike", "sq", "square"]);
const DIRS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]);

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

const matchedStreet = (g: Geo) => (g.matched ?? "").split(",").slice(0, -3).join(", ").trim();

/** A pin in the wrong town is worse than no pin: anything the geocoder had to
 *  guess at must agree with the state and zip we were given, unless street and
 *  city agree exactly, in which case the board's zip was the typo. */
export function accept(p: Parsed, g: Geo): { ok: boolean; reason?: string; note?: string } {
  if (g.matchType === "No_Match") return { ok: false, reason: "no match" };
  if (g.matchType === "Tie") return { ok: false, reason: "ambiguous (tie)" };
  if (g.lat == null || g.lng == null || Number.isNaN(g.lat) || Number.isNaN(g.lng)) return { ok: false, reason: "no coordinates" };
  if (p.state && g.state && p.state !== g.state.toUpperCase()) return { ok: false, reason: `state ${g.state} differs from ${p.state}` };
  if (g.matchType === "Exact") return { ok: true };
  const cityOk = !!(p.city && g.city && p.city.toLowerCase() === g.city.toLowerCase());
  if (p.zip) {
    if (p.zip === g.zip) return { ok: true };
    if (cityOk && streetCore(p.street) === streetCore(matchedStreet(g))) return { ok: true, note: `zip corrected ${p.zip} -> ${g.zip}` };
    return { ok: false, reason: `zip ${g.zip} differs from ${p.zip}` };
  }
  if (cityOk) return { ok: true };
  return { ok: false, reason: "city differs and no zip to confirm" };
}

const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const titleCase = (s: string) =>
  s.split(" ").map((w) => (DIRECTIONS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");

/** "3480 OLD FAIRBURN RD, ATLANTA, GA, 30331" -> "3480 Old Fairburn Rd, Atlanta, GA 30331" */
function formatAddress(g: Geo, fallback: string): string {
  const parts = (g.matched ?? "").split(",").map((s) => s.trim());
  if (parts.length < 4) return fallback;
  const street = parts.slice(0, -3).join(", ");
  return `${titleCase(street)}, ${titleCase(parts.at(-3)!)}, ${parts.at(-2)} ${parts.at(-1)}`;
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** One request per chunk; aliased mutations so a single bad item cannot fail the rest. */
async function mondayWrite(items: { id: string; lat: number; lng: number; address: string }[]): Promise<Map<string, string | null>> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");
  const varDefs = items.map((_, i) => `$v${i}: JSON!`).join(", ");
  const body = items
    .map((it, i) => `m${i}: change_multiple_column_values(board_id: ${PROPERTY_BOARD}, item_id: ${it.id}, column_values: $v${i}) { id }`)
    .join("\n");
  const variables: Record<string, string> = {};
  items.forEach((it, i) => {
    variables[`v${i}`] = JSON.stringify({
      [LOCATION_COLUMN]: { lat: it.lat.toFixed(6), lng: it.lng.toFixed(6), address: it.address },
    });
  });
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-10" },
    body: JSON.stringify({ query: `mutation (${varDefs}) { ${body} }`, variables }),
  });
  const json = await res.json().catch(() => ({}));
  const errors: { message?: string; path?: unknown[] }[] = Array.isArray(json?.errors) ? json.errors : [];
  const out = new Map<string, string | null>();
  items.forEach((it, i) => {
    if (json?.data?.[`m${i}`]?.id) { out.set(it.id, null); return; }
    const own = errors.find((e) => e.path?.[0] === `m${i}`)?.message;
    out.set(it.id, own ?? errors[0]?.message ?? `monday.com returned ${res.status}`);
  });
  return out;
}

Deno.serve(async (req) => {
  const secret = await syncSecret();
  if (!secret || !safeEqual(req.headers.get("x-sync-secret") ?? "", secret)) {
    return new Response("unauthorised", { status: 401 });
  }

  const url = new URL(req.url);
  const batch = Math.min(Math.max(Number.parseInt(url.searchParams.get("batch") ?? "", 10) || 200, 1), 500);
  const dry = url.searchParams.get("dry") === "1";
  const started = Date.now();

  const { data, error } = await sb.from("geocode_candidates").select("monday_item_id,name,city,state,zipcode").limit(batch);
  if (error) return Response.json({ error: `candidates read failed: ${error.message}` }, { status: 500 });
  const candidates = (data ?? []) as Candidate[];

  const results: Result[] = [];
  const parsed: { id: string; p: Parsed }[] = [];
  for (const c of candidates) {
    const p = parseCandidate(c);
    if (p) parsed.push({ id: c.monday_item_id, p });
    else results.push({ id: c.monday_item_id, input: c.name, outcome: "unparsable", detail: "no street number, or no city/state/zip" });
  }

  const geo = parsed.length ? await censusBatch(parsed) : new Map<string, Geo>();
  const retry = parsed.filter((x) => (geo.get(x.id) ?? NO_MATCH).matchType !== "Exact" && (geo.get(x.id) ?? NO_MATCH).matchType !== "Non_Exact");
  await pool(retry, 4, async (x) => {
    if (Date.now() - started > WALL_CLOCK_MS - 25_000) return;
    const g = await censusOneline(x.p);
    if (g.matchType !== "No_Match") geo.set(x.id, g);
  });

  const toWrite: { id: string; p: Parsed; g: Geo; how: string }[] = [];
  for (const x of parsed) {
    const g = geo.get(x.id) ?? NO_MATCH;
    const verdict = accept(x.p, g);
    if (verdict.ok) toWrite.push({ ...x, g, how: `${g.via}/${g.matchType}${verdict.note ? ` · ${verdict.note}` : ""}` });
    else {
      results.push({
        id: x.id, input: x.p.oneline,
        outcome: g.matchType === "No_Match" ? "no_match" : "rejected",
        matched: g.matched, lat: g.lat, lng: g.lng, detail: verdict.reason,
      });
    }
  }

  let written = 0, mondayErrors = 0;
  if (dry) {
    for (const x of toWrite) {
      results.push({ id: x.id, input: x.p.oneline, outcome: "accepted", matched: formatAddress(x.g, x.p.oneline), lat: x.g.lat, lng: x.g.lng, detail: x.how });
    }
  } else {
    for (let i = 0; i < toWrite.length; i += MONDAY_CHUNK) {
      if (Date.now() - started > WALL_CLOCK_MS) break; // the rest stays in the queue for the next tick
      const chunk = toWrite.slice(i, i + MONDAY_CHUNK);
      const errs = await mondayWrite(chunk.map((x) => ({ id: x.id, lat: x.g.lat!, lng: x.g.lng!, address: formatAddress(x.g, x.p.oneline) })));
      for (const x of chunk) {
        const e = errs.get(x.id);
        if (e) mondayErrors++; else written++;
        results.push({ id: x.id, input: x.p.oneline, outcome: e ? "monday_error" : "written", matched: formatAddress(x.g, x.p.oneline), lat: x.g.lat, lng: x.g.lng, detail: e ?? x.how });
      }
    }
    // Monday failures are not recorded, so they are retried next tick. Everything
    // else is final for this row and drops out of geocode_candidates.
    const record = results.filter((r) => r.outcome !== "monday_error");
    if (record.length) {
      const { error: logError } = await sb.from("geocode_attempts").upsert(
        record.map((r) => ({ monday_item_id: r.id, outcome: r.outcome, input: r.input, matched_address: r.matched ?? null, lat: r.lat ?? null, lng: r.lng ?? null, detail: r.detail ?? null })),
        { onConflict: "monday_item_id" },
      );
      if (logError) return Response.json({ error: `attempt log failed: ${logError.message}` }, { status: 500 });
    }
  }

  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const summary = {
    dry,
    candidates: candidates.length,
    unparsable: count("unparsable"),
    no_match: count("no_match"),
    rejected: count("rejected"),
    accepted: count("accepted"),
    written,
    monday_errors: mondayErrors,
    deferred: dry ? 0 : toWrite.length - written - mondayErrors,
    done: candidates.length === 0,
    elapsed_ms: Date.now() - started,
    sample: dry ? results.slice(0, 80) : results.filter((r) => r.outcome !== "written").slice(0, 25),
  };
  // Nothing written and Monday refused everything: surface it as a failure so the tick stops.
  const status = !dry && mondayErrors > 0 && written === 0 ? 500 : 200;
  return Response.json(summary, { status });
});
