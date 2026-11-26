import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn, phoneToken, phoneUrl } from "@/lib/features";
import { ID_RE, MAX_USER, PHONE_OFF, cleanText, clientIp, readPhoneAnswer, refused, toPhoneLookup } from "@/lib/map-agent";
import { first, supabase } from "@/lib/supabase";
import type { ApiError, PhoneLookup } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 4096;
const LOOKUP_TIMEOUT_MS = 30_000;
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

// What map_phone_lookup_guard (Postgres) can answer besides "ok". The guard owns the limits: 5 per IP per
// 10 minutes, 200 a day overall.
const REFUSALS: Record<string, { status: number; code: string; error: string }> = {
  ip_limit: { status: 429, code: "rate_limited", error: "Too many lookups from this device; try again later" },
  daily_cap: { status: 429, code: "rate_limited", error: "Today's lookups are used up; try again tomorrow" },
  forbidden: { status: 502, code: "db_error", error: "Lookup failed" },
};

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });
const answer = (lookup: PhoneLookup) => NextResponse.json<PhoneLookup>(lookup, { headers: { "Cache-Control": "no-store" } });

async function saved(secret: string, id: string): Promise<PhoneLookup> {
  const { data, error } = await supabase().rpc("map_phone_lookup_get", { p_secret: secret, p_property_item_id: id });
  if (error) throw error;
  if (refused(data)) throw new Error("the database refused the map secret");
  return toPhoneLookup(data);
}

/**
 * GET /api/properties/:id/find-phone
 * The latest saved lookup for this property (within 90 days). `state: "not_found"` with `lookedUpAt: null`
 * means nobody has looked yet. `state: "off"` while the `findPhone` feature is off.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail(400, "bad_request", "Invalid property id");
  const secret = editSecret();
  if (!featureOn("findPhone") || !secret) return answer(PHONE_OFF);
  try {
    return answer(await saved(secret, id));
  } catch (e) {
    console.error("GET /api/properties/[id]/find-phone failed", id, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Lookup failed");
  }
}

/**
 * POST /api/properties/:id/find-phone  { by? }
 *
 * Looks the owner's phone up: a found number saved in the last 90 days, or a "not found" from the last 24 hours, is returned as is; otherwise the guard
 * (rate limits), then the lookup service (MAP_PHONE_URL gets { propertyId, address, city, state, zip } and
 * answers { phone, source?, confidence? }), then the answer is saved and returned. Nothing is written to
 * Monday: saving the number on the property goes through the Edit form.
 * `state: "off"` while the feature is off or MAP_PHONE_URL is unset. 404, 429, 502 `lookup_error`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail(400, "bad_request", "Invalid property id");
  const secret = editSecret();
  const url = phoneUrl();
  if (!featureOn("findPhone") || !secret || !url) return answer(PHONE_OFF);

  let by = "";
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > MAX_BODY) return fail(413, "too_large", "Request is too long");
    if (text.trim()) {
      const raw: unknown = JSON.parse(text);
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
      const name = cleanText((raw as { by?: unknown }).by, MAX_USER);
      if (name === undefined) return fail(400, "bad_request", `by must be text up to ${MAX_USER} characters`);
      by = name;
    }
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }

  const sb = supabase();
  const ip = clientIp(req.headers);
  let place: { address: string | null; city: string | null; state: string | null; zipcode: string | null };
  try {
    const detail = await sb.rpc("property_detail", { p_monday_item_id: id });
    if (detail.error) throw detail.error;
    const row = first<typeof place>(detail.data);
    if (!row) return fail(404, "not_found", "Property not found");
    place = row;

    const before = await saved(secret, id);
    if (before.state === "found") return answer(before);
    // Each lookup costs money and draws on the shared daily cap: a "not found" from the last day is the answer.
    if (before.state === "not_found" && before.lookedUpAt && Date.now() - Date.parse(before.lookedUpAt) < RETRY_AFTER_MS) {
      return answer(before);
    }

    const guard = await sb.rpc("map_phone_lookup_guard", { p_secret: secret, p_property_item_id: id, p_ip: ip, p_by: by });
    if (guard.error) throw guard.error;
    if (guard.data !== "ok") {
      const refusal = REFUSALS[String(guard.data)] ?? REFUSALS.forbidden;
      return fail(refusal.status, refusal.code, refusal.error);
    }
  } catch (e) {
    console.error("find-phone: guard failed", id, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Lookup failed");
  }

  let found: ReturnType<typeof readPhoneAnswer>;
  try {
    const token = phoneToken();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token && { "x-map-secret": token }) },
      body: JSON.stringify({ propertyId: id, address: place.address, city: place.city, state: place.state, zip: place.zipcode }),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`lookup service answered ${res.status}`);
    found = readPhoneAnswer(await res.json());
  } catch (e) {
    // Only the kind of failure: the raw error can carry the service's address.
    console.error("find-phone: lookup failed", id, e instanceof Error ? e.name : "error");
    return fail(502, "lookup_error", "The phone lookup did not answer. Try again later");
  }

  try {
    const save = await sb.rpc("map_phone_lookup_save", {
      p_secret: secret, p_property_item_id: id, p_listing_id: null, p_phone: found.phone, p_source: found.source,
      p_confidence: found.confidence, p_by: by, p_ip: ip,
    });
    if (save.error) throw save.error;
  } catch (e) {
    // The answer is still worth showing; it just won't be remembered.
    console.error("find-phone: save failed", id, e instanceof Error ? e.message : e);
  }
  return answer({
    state: found.phone ? "found" : "not_found",
    phone: found.phone,
    source: found.source ?? "lookup",
    confidence: found.confidence,
    lookedUpAt: new Date().toISOString(),
  });
}
