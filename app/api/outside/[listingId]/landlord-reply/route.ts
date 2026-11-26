import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { RateLimiter, UUID_RE, cleanText, clientIp } from "@/lib/map-agent";
import {
  LANDLORD_REPLY_OFF, REPLY_MAX, addressWrite, extractedRecord, geocodeStreet, interpretPrepare, interpretSave,
  parseLandlordReply, planReply, replyFingerprint, replyResponse, type Coords,
} from "@/lib/landlord-reply";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_BODY = 16_384;
/** Pastes per client address: 20 in 10 minutes, per server instance. A guard against runaway use, not a login. */
const limiter = new RateLimiter(20, 10 * 60_000);

const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });
/** Logs say what kind of error it was, never its text (a reply and its phone and address are private). */
const kind = (e: unknown) => (e instanceof Error ? e.name : "error");
const UNAVAILABLE = "The reply was not saved. Try again in a minute";

/**
 * POST /api/outside/:listingId/landlord-reply  { text, by? }
 *
 * Staff paste the landlord's reply for a Furnished Finder home that has no street address. The street is written
 * only when the reply gives one house number and street name (verbatim in the text), with a city and state or a
 * zip the map can place, and the home has no address yet; the Census geocoder places it. The reply is recorded
 * in landlord_outreach either way (once per home and text). Nothing is sent to anyone; Monday is not written.
 *
 * 200 { ok, outcome, message, duplicate, addressWritten, address, possibleDuplicates, copyToPropertyDb }
 * 400 bad id, not JSON, or empty · 404 the home is gone · 409 wrong_source (not Furnished Finder) · 413 too long
 * 429 rate limit · 503 `feature_off` while the `outside` feature is off, or database_unavailable /
 * geocoder_unavailable (nothing was saved: try again).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ listingId: string }> }) {
  if (!featureOn("outside")) return NextResponse.json(LANDLORD_REPLY_OFF.body, { status: LANDLORD_REPLY_OFF.status });
  const { listingId } = await ctx.params;
  if (!UUID_RE.test(listingId)) return fail(400, "bad_request", "Invalid home id");
  const secret = editSecret();
  if (!secret) return NextResponse.json(LANDLORD_REPLY_OFF.body, { status: LANDLORD_REPLY_OFF.status });
  if (!limiter.allow(clientIp(req.headers))) return fail(429, "rate_limited", "Too many replies in a few minutes. Try again shortly");

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > MAX_BODY) return fail(413, "too_large", "Request is too long");
    const parsedJson: unknown = JSON.parse(raw);
    if (parsedJson === null || typeof parsedJson !== "object" || Array.isArray(parsedJson)) throw new Error("not an object");
    body = parsedJson as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }
  const text = cleanText(body.text ?? "", REPLY_MAX);
  if (text === undefined && typeof body.text !== "string") return fail(400, "bad_request", "text must be the reply as a string");
  if (text === undefined) return fail(413, "too_long", `The reply is longer than ${REPLY_MAX} characters`);
  if (!text) return fail(400, "empty", "Paste the landlord's reply first");
  const by = cleanText(body.by ?? "", 80);
  if (by === undefined) return fail(400, "bad_request", "The name is too long");

  const reply = parseLandlordReply(text);
  const fingerprint = replyFingerprint(text);

  let sb: ReturnType<typeof supabase>;
  try {
    sb = supabase();
  } catch {
    console.error("landlord-reply: database client not configured");
    return fail(503, "database_unavailable", UNAVAILABLE);
  }

  // 1. The home and whether this reply is already recorded. A repeat paste changes nothing and calls nobody.
  try {
    const { data, error } = await sb.rpc("map_listing_reply_prepare", { p_secret: secret, p_listing_id: listingId, p_fingerprint: fingerprint });
    if (error) throw error;
    const prepared = interpretPrepare(data);
    if (prepared.kind === "forbidden") {
      console.error("landlord-reply: the database refused the server secret");
      return fail(503, "database_unavailable", UNAVAILABLE);
    }
    if (prepared.kind === "not_found") return fail(404, "not_found", "This home is no longer on the map");
    if (prepared.kind === "wrong_source") return fail(409, "wrong_source", "Only a Furnished Finder home takes a pasted reply");
    if (prepared.kind === "error") return fail(503, "database_unavailable", UNAVAILABLE);
    if (prepared.recorded) {
      return NextResponse.json(replyResponse("duplicate", {
        duplicate: true, addressWritten: false, address: prepared.listing, propertyItemId: prepared.propertyItemId, possibleDuplicates: 0,
      }));
    }

    // 2. The rules: what this reply may write, given the home's current address. Census only when a street is accepted.
    const plan = planReply(reply, prepared.listing);
    let outcome = plan.outcome;
    let coords: Coords | null = null;
    if (plan.geocode) {
      try {
        coords = await geocodeStreet(plan.geocode);
      } catch (e) {
        console.error("landlord-reply: geocoder unavailable", kind(e));
        return fail(503, "geocoder_unavailable", "The map could not look up the street just now. Nothing was saved; try again in a minute");
      }
      if (!coords) outcome = "geocode_no_match";
    }
    const write = coords && plan.address ? addressWrite(plan.address, coords) : null;

    // 3. The save: one transaction in the database (the street if the home still has none, and the reply).
    const { data: saveData, error: saveError } = await sb.rpc("map_listing_address_save", {
      p_secret: secret,
      p_listing_id: listingId,
      p_fingerprint: fingerprint,
      p_reply: text,
      p_by: by,
      p_phone: reply.phones[0] ?? null,
      p_extracted: extractedRecord(reply, outcome, write !== null),
      p_address: write,
    });
    if (saveError) throw saveError;
    const saved = interpretSave(saveData);
    if (saved.kind === "duplicate") {
      return NextResponse.json(replyResponse("duplicate", {
        duplicate: true, addressWritten: false, address: saved.address, propertyItemId: saved.propertyItemId, possibleDuplicates: 0,
      }));
    }
    if (saved.kind === "not_found") return fail(404, "not_found", "This home is no longer on the map");
    if (saved.kind === "wrong_source") return fail(409, "wrong_source", "Only a Furnished Finder home takes a pasted reply");
    if (saved.kind !== "saved") {
      console.error("landlord-reply: save did not answer", saved.kind);
      return fail(503, "database_unavailable", UNAVAILABLE);
    }
    return NextResponse.json(replyResponse(outcome, {
      duplicate: false,
      addressWritten: saved.addressWritten,
      address: saved.address,
      propertyItemId: saved.propertyItemId,
      possibleDuplicates: saved.possibleDuplicates,
    }));
  } catch (e) {
    console.error("landlord-reply: database step failed", kind(e));
    return fail(503, "database_unavailable", UNAVAILABLE);
  }
}
