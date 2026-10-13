// Locates PROPERTY DATABASE items that have no coordinates and writes the
// result into Monday's location column (plus City / State / Zip when those are
// blank). Monday stays the system of record: monday-webhook mirrors the write
// into public.properties within seconds and the pin appears on the map.
//
// Per row, from public.locate_candidates (newest first):
//   furnishedfinder  the listing page, fetched through Firecrawl (the site
//                    blocks plain server requests), parsed for its own embedded
//                    coordinates. Approximate: the site never shows the street.
//   address          US Census batch geocoder (free) for numbered streets, then
//                    Geocodio for what Census can't place: street-only names,
//                    Zillow/Trulia/Redfin slugs, near-misses. A street centroid
//                    is kept as approximate; a city or zip centroid is never pinned.
//
// Started by public.locate_sweep() (row trigger on new items + a 30 s cron).
// ?batch=N  rows per invocation (default 120, max 500)
// ?dry=1    look everything up and report, write nothing anywhere
// Guarded by the shared x-sync-secret (public.sync_config).
//
// Secrets: MONDAY_API_TOKEN (required), FIRECRAWL_API_KEY, GEOCODIO_API_KEY.
// A missing key defers just the rows that need it, for an hour at a time.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  acceptCensus, acceptGeocodio, acceptListing, addressQueries, furnishedFinderId, readFurnishedFinder,
  type Candidate, type CensusMatch, type GeocodioResult, type Parsed, type Place, type Query, type Verdict,
} from "./locate.ts";

const PROPERTY_BOARD = "18415735059";
const COL = { location: "location_mm416w07", city: "text_mm3yzy0x", state: "text_mm3yw9nf", zip: "text_mm3y5tq6" };
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations";
const BENCHMARK = "Public_AR_Current";
const GEOCODIO = "https://api.geocod.io/v2/geocode";
const FIRECRAWL = "https://api.firecrawl.dev/v2/scrape";
const MONDAY_API = "https://api.monday.com/v2";
const WALL_CLOCK_MS = 110_000;
const MONDAY_CHUNK = 20;

type Outcome = "written" | "accepted" | "rejected" | "no_match" | "unparsable" | "gone" | "error" | "deferred";
type Source = "census" | "geocodio" | "furnishedfinder" | "none";
type Result = {
  c: Candidate;
  outcome: Outcome;
  source: Source;
  input: string;
  place?: Place;
  detail?: string | null;
};

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

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

// ---------------------------------------------------------------- Census

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

const csvField = (v: string) => `"${v.replace(/"/g, '""')}"`;

async function censusBatch(rows: { id: string; p: Parsed }[]): Promise<Map<string, CensusMatch>> {
  const out = new Map<string, CensusMatch>();
  if (!rows.length) return out;
  const csv = rows.map((r) => [r.id, r.p.street, r.p.city ?? "", r.p.state ?? "", r.p.zip ?? ""].map(csvField).join(",")).join("\n");
  const form = new FormData();
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", BENCHMARK);
  const res = await fetch(`${CENSUS}/addressbatch`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`census batch returned ${res.status}`);
  for (const line of (await res.text()).split(/\r?\n/)) {
    if (!line.trim()) continue;
    // id, input, Match|No_Match|Tie, Exact|Non_Exact, matched address, "lon,lat", tiger id, side
    const f = parseCsvLine(line);
    if (f[2] !== "Match") {
      out.set(f[0], { matchType: f[2] === "Tie" ? "Tie" : "No_Match", matched: null, lat: null, lng: null });
      continue;
    }
    const [lng, lat] = (f[5] ?? "").split(",").map(Number);
    out.set(f[0], { matchType: f[3] === "Exact" ? "Exact" : "Non_Exact", matched: f[4], lat, lng });
  }
  return out;
}

// ---------------------------------------------------------------- Geocodio

/** One batch request; results come back keyed by the ids we sent. */
async function geocodioBatch(key: string, rows: { id: string; q: Query }[]): Promise<Map<string, GeocodioResult[]>> {
  const out = new Map<string, GeocodioResult[]>();
  if (!rows.length) return out;
  const body: Record<string, unknown> = {};
  for (const { id, q } of rows) {
    body[id] = q.street
      ? { street: q.street, city: q.city ?? undefined, state: q.state ?? undefined, postal_code: q.zip ?? undefined, country: "US" }
      : q.oneline;
  }
  const res = await fetch(`${GEOCODIO}?api_key=${encodeURIComponent(key)}&limit=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`geocodio returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const results = json?.results ?? {};
  for (const { id } of rows) out.set(id, results?.[id]?.response?.results ?? []);
  return out;
}

// ---------------------------------------------------------------- Firecrawl

type Scrape = { html: string; status: number; finalUrl: string | null } | { error: string; rateLimited?: boolean };

async function scrape(key: string, url: string): Promise<Scrape> {
  const res = await fetch(FIRECRAWL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false, timeout: 30_000 }),
  });
  if (res.status === 429) return { error: "firecrawl rate limited", rateLimited: true };
  if (res.status === 402) return { error: "firecrawl credits exhausted", rateLimited: true };
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return { error: `firecrawl returned ${res.status}: ${json?.error ?? ""}`.trim() };
  const meta = json.data?.metadata ?? {};
  return { html: json.data?.rawHtml ?? "", status: Number(meta.statusCode ?? 200), finalUrl: meta.url ?? null };
}

// ---------------------------------------------------------------- Monday

/** One request per chunk; aliased mutations so a single bad item cannot fail the rest. */
async function mondayWrite(items: { id: string; values: Record<string, unknown> }[]): Promise<Map<string, string | null>> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");
  const varDefs = items.map((_, i) => `$v${i}: JSON!`).join(", ");
  const body = items
    .map((it, i) => `m${i}: change_multiple_column_values(board_id: ${PROPERTY_BOARD}, item_id: ${it.id}, column_values: $v${i}) { id }`)
    .join("\n");
  const variables: Record<string, string> = {};
  items.forEach((it, i) => { variables[`v${i}`] = JSON.stringify(it.values); });
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

/** Location always; City / State / Zip only where the board has them blank. */
function columnValues(c: Candidate, p: Place): Record<string, unknown> {
  const v: Record<string, unknown> = { [COL.location]: { lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), address: p.address } };
  if (!c.city?.trim() && p.city) v[COL.city] = p.city;
  if (!c.state?.trim() && p.state) v[COL.state] = p.state;
  if (!c.zipcode?.trim() && p.zip) v[COL.zip] = p.zip;
  return v;
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  const secret = await syncSecret();
  if (!secret || !safeEqual(req.headers.get("x-sync-secret") ?? "", secret)) {
    return new Response("unauthorised", { status: 401 });
  }

  const url = new URL(req.url);
  const batch = Math.min(Math.max(Number.parseInt(url.searchParams.get("batch") ?? "", 10) || 120, 1), 500);
  const dry = url.searchParams.get("dry") === "1";
  const started = Date.now();
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? null;
  const geocodioKey = Deno.env.get("GEOCODIO_API_KEY") ?? null;
  const concurrency = Math.min(Math.max(Number(Deno.env.get("FIRECRAWL_CONCURRENCY") ?? 3) || 3, 1), 10);

  const { data, error } = await sb.from("locate_candidates")
    .select("monday_item_id,name,city,state,zipcode,property_link,kind,input_hash").limit(batch);
  if (error) return Response.json({ error: `candidates read failed: ${error.message}` }, { status: 500 });
  const candidates = (data ?? []) as Candidate[];

  const results: Result[] = [];
  const accepted: { c: Candidate; place: Place; source: Source; input: string; note?: string }[] = [];
  const decide = (c: Candidate, source: Source, input: string, v: Verdict) => {
    if (v.ok) accepted.push({ c, place: v.place, source, input, note: v.note });
    else results.push({ c, source, input, outcome: v.noMatch ? "no_match" : "rejected", detail: v.reason });
  };
  // Rows left unrecorded stay in the queue for the next step.
  let skipped = 0;
  const outOfTime = (reserveMs: number) => Date.now() - started > WALL_CLOCK_MS - reserveMs;

  // --- address rows: Census first (free), Geocodio for the rest
  const addr = candidates.filter((c) => c.kind === "address").map((c) => ({ c, ...addressQueries(c) }));
  for (const a of addr) {
    if (!a.census && !a.geocodio) {
      results.push({ c: a.c, source: "none", input: a.c.name, outcome: "unparsable", detail: "no street, or no city/state/zip to check a match against" });
    }
  }
  const forCensus = addr.filter((a) => a.census);
  let census = new Map<string, CensusMatch>();
  try {
    census = await censusBatch(forCensus.map((a) => ({ id: a.c.monday_item_id, p: a.census! })));
  } catch (e) {
    console.error("census batch failed", e);
  }
  const forGeocodio: typeof addr = [];
  for (const a of forCensus) {
    const m = census.get(a.c.monday_item_id);
    const v = m ? acceptCensus(a.census!, m) : null;
    if (v?.ok) decide(a.c, "census", a.census!.oneline, v);
    else forGeocodio.push(a);
  }
  forGeocodio.push(...addr.filter((a) => !a.census && a.geocodio));
  if (forGeocodio.length && !geocodioKey) {
    for (const a of forGeocodio) results.push({ c: a.c, source: "geocodio", input: a.geocodio!.oneline, outcome: "deferred", detail: "GEOCODIO_API_KEY is not set" });
  } else if (forGeocodio.length) {
    try {
      const geo = await geocodioBatch(geocodioKey!, forGeocodio.map((a) => ({ id: a.c.monday_item_id, q: a.geocodio! })));
      for (const a of forGeocodio) decide(a.c, "geocodio", a.geocodio!.oneline, acceptGeocodio(a.geocodio!, geo.get(a.c.monday_item_id)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const a of forGeocodio) results.push({ c: a.c, source: "geocodio", input: a.geocodio!.oneline, outcome: "error", detail: msg });
    }
  }

  // --- Furnished Finder rows: one page each, as many as the clock allows
  const listings = candidates.filter((c) => c.kind === "furnishedfinder");
  if (listings.length && !firecrawlKey) {
    for (const c of listings) results.push({ c, source: "furnishedfinder", input: c.property_link ?? c.name, outcome: "deferred", detail: "FIRECRAWL_API_KEY is not set" });
  } else {
    let halted = false;
    await pool(listings, concurrency, async (c) => {
      const id = furnishedFinderId(c);
      const listingUrl = id ? `https://www.furnishedfinder.com/property/${id}` : c.property_link ?? c.name;
      if (!id) {
        results.push({ c, source: "furnishedfinder", input: listingUrl, outcome: "unparsable", detail: "no listing id in the name or link" });
        return;
      }
      if (halted || outOfTime(35_000)) { skipped++; return; }
      const page = await scrape(firecrawlKey!, listingUrl).catch((e) => ({ error: String(e) }) as Scrape);
      if ("error" in page) {
        if (page.rateLimited) { halted = true; skipped++; return; }
        results.push({ c, source: "furnishedfinder", input: listingUrl, outcome: "error", detail: page.error });
        return;
      }
      const read = readFurnishedFinder(page.html, id, page.status, page.finalUrl);
      if (read.kind === "gone") results.push({ c, source: "furnishedfinder", input: listingUrl, outcome: "gone", detail: read.reason });
      // Final until the row is edited: retrying an unreadable page hourly would only burn credits.
      else if (read.kind === "unreadable") results.push({ c, source: "furnishedfinder", input: listingUrl, outcome: "rejected", detail: read.reason });
      else decide(c, "furnishedfinder", listingUrl, acceptListing(c, read));
    });
  }

  // --- write to Monday
  let written = 0, mondayErrors = 0;
  if (dry) {
    for (const a of accepted) results.push({ c: a.c, source: a.source, input: a.input, outcome: "accepted", place: a.place, detail: a.note ?? null });
  } else {
    for (let i = 0; i < accepted.length; i += MONDAY_CHUNK) {
      const chunk = accepted.slice(i, i + MONDAY_CHUNK);
      if (outOfTime(0)) { skipped += chunk.length; continue; }
      const errs = await mondayWrite(chunk.map((a) => ({ id: a.c.monday_item_id, values: columnValues(a.c, a.place) })));
      for (const a of chunk) {
        const e = errs.get(a.c.monday_item_id);
        if (e) mondayErrors++; else written++;
        results.push({ c: a.c, source: a.source, input: a.input, outcome: e ? "error" : "written", place: a.place, detail: e ? `monday: ${e}` : a.note ?? null });
      }
    }
    if (results.length) {
      const now = new Date().toISOString();
      const { error: logError } = await sb.from("geocode_attempts").upsert(
        results.map((r) => ({
          monday_item_id: r.c.monday_item_id,
          attempted_at: now,
          outcome: r.outcome,
          source: r.source,
          precision: r.place?.precision ?? null,
          input: r.input,
          input_hash: r.c.input_hash,
          matched_address: r.place?.address ?? null,
          lat: r.place?.lat ?? null,
          lng: r.place?.lng ?? null,
          detail: r.detail ?? null,
        })),
        { onConflict: "monday_item_id" },
      );
      if (logError) return Response.json({ error: `attempt log failed: ${logError.message}` }, { status: 500 });
    }
  }

  const count = (o: Outcome, s?: Source) => results.filter((r) => r.outcome === o && (!s || r.source === s)).length;
  const summary = {
    dry,
    candidates: candidates.length,
    written,
    accepted: count("accepted"),
    approximate: results.filter((r) => (r.outcome === "written" || r.outcome === "accepted") && r.place?.precision === "approximate").length,
    by_source: {
      census: count(dry ? "accepted" : "written", "census"),
      geocodio: count(dry ? "accepted" : "written", "geocodio"),
      furnishedfinder: count(dry ? "accepted" : "written", "furnishedfinder"),
    },
    no_match: count("no_match"),
    rejected: count("rejected"),
    unparsable: count("unparsable"),
    gone: count("gone"),
    deferred: count("deferred"),
    errors: count("error"),
    monday_errors: mondayErrors,
    skipped,
    done: candidates.length === 0,
    elapsed_ms: Date.now() - started,
    sample: results
      .filter((r) => dry || r.outcome !== "written")
      .slice(0, dry ? 80 : 25)
      .map((r) => ({ id: r.c.monday_item_id, name: r.c.name, outcome: r.outcome, source: r.source, input: r.input, address: r.place?.address, precision: r.place?.precision, lat: r.place?.lat, lng: r.place?.lng, detail: r.detail })),
  };
  return Response.json(summary);
});
