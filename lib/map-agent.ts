// Housing agent on the map: the pure half. Turns what the gated SQL functions (supabase/migrations/
// 20261126_map_agent.sql) and the Search Chat webhook answer into the shapes in lib/types.ts, and holds the
// small rules the routes share. No I/O and only type imports, so `npm run test:unit` covers every rule here.
import type {
  AskRequest, AskResponse, MatchScore, NearsiteClaim, OutreachStatus, OutsideHome, OutsideResponse, PhoneLookup,
  ScoresResponse, SubmitState, SubmitStatus, SubmitStatusResponse,
} from "./types";

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : []);

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
/** Ids come back as text or number; both become text. */
const id = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? String(v) : str(v));
/** Postgres numerics arrive as numbers or numeric strings. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};
const httpUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

export const ID_RE = /^\d{1,20}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when a gated SQL function refused the secret (it answers {"ok": false, "error": "forbidden"}). */
export function refused(data: unknown): boolean {
  return !isRow(data) || data.ok !== true;
}

/**
 * Control, bidi and zero-width characters out; whitespace collapsed (the same rule as "Report bad link").
 * "" for null/undefined; undefined when it is not text or is longer than `max` after cleaning.
 */
export function cleanText(v: unknown, max: number): string | undefined {
  if (v == null) return "";
  if (typeof v !== "string") return undefined;
  const out = v
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.length <= max ? out : undefined;
}

/** The caller's address as the proxy reports it; "unknown" when it does not. */
export function clientIp(headers: { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** In-memory "N per key per window" limit for one server instance. `now` is injectable for tests. */
export class RateLimiter {
  // Plain fields, not constructor parameter properties: the unit tests run this file with Node's type stripping.
  private hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Counts this call and answers whether it is allowed. */
  allow(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Keep the map from growing without bound on a long-lived instance.
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    return true;
  }
}

// ---- outside homes -------------------------------------------------------------------------------------

export function toOutreach(v: unknown): OutreachStatus | null {
  if (!isRow(v)) return null;
  const status = str(v.status);
  if (!status) return null;
  return { status, channel: str(v.channel), sentAt: str(v.sent_at), sentBy: str(v.sent_by), repliedAt: str(v.replied_at) };
}

const PRECISIONS = new Set(["exact", "approx", "area"]);

export function toOutsideHome(v: unknown): OutsideHome | null {
  if (!isRow(v)) return null;
  const listingId = str(v.listing_id);
  if (!listingId) return null;
  let lat = num(v.lat);
  let lng = num(v.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    lat = null;
    lng = null;
  }
  const precision = typeof v.precision === "string" && PRECISIONS.has(v.precision) ? (v.precision as OutsideHome["precision"]) : null;
  const propertyItemId = id(v.property_item_id);
  return {
    listingId,
    source: str(v.source) ?? "other",
    url: httpUrl(v.url),
    title: str(v.title) ?? "Outside home",
    addressKnown: v.address_known === true,
    city: str(v.city),
    state: str(v.state),
    beds: num(v.beds),
    baths: num(v.baths),
    rent: num(v.rent),
    lat,
    lng,
    precision,
    distanceMiles: num(v.distance_mi),
    rank: int(v.rank) ?? 0,
    score: num(v.score),
    fits: v.fits === true,
    excludedBy: Array.isArray(v.excluded_by) ? v.excluded_by.filter((x): x is string => typeof x === "string") : [],
    isNew: v.is_new === true,
    inPropertyDb: propertyItemId !== null || v.in_property_db === true,
    propertyItemId,
    onClaim: v.on_claim === true,
    hasPhone: v.has_phone === true,
    availableFrom: str(v.available_from),
    pets: str(v.pets),
    photo: httpUrl(v.photo),
    outreach: toOutreach(v.outreach),
  };
}

export const OUTSIDE_OFF: OutsideResponse = { enabled: false, searchId: null, versionNo: null, run: null, homes: [] };

/** map_outside_homes → OutsideResponse. */
export function toOutsideResponse(data: unknown): OutsideResponse {
  const d = isRow(data) ? data : {};
  const run = isRow(d.run)
    ? {
        status: str(d.run.status) ?? "unknown",
        found: int(d.run.found) ?? 0,
        fitting: int(d.run.fitting) ?? 0,
        newHomes: int(d.run.new_homes) ?? 0,
        finishedAt: str(d.run.finished_at),
      }
    : null;
  return {
    enabled: true,
    searchId: str(d.search_id),
    versionNo: int(d.version_no),
    run,
    homes: rows(d.homes).map(toOutsideHome).filter((h): h is OutsideHome => h !== null),
  };
}

// ---- best match ----------------------------------------------------------------------------------------

/** map_claim_scores → ScoresResponse. Rows without a property or a score are dropped. */
export function toScoresResponse(data: unknown): ScoresResponse {
  const d = isRow(data) ? data : {};
  const scores: MatchScore[] = [];
  for (const r of rows(d.scores)) {
    const propertyId = id(r.property_id);
    const score = num(r.score);
    if (!propertyId || score === null) continue;
    const stretchBy = num(r.stretch_by);
    scores.push({
      propertyId,
      rank: int(r.rank) ?? scores.length + 1,
      score,
      why: str(r.why),
      stretch: r.stretch === true,
      stretchBy: stretchBy !== null && stretchBy > 0 ? stretchBy : null,
      distanceMiles: num(r.distance_mi),
    });
  }
  return { enabled: true, scores };
}

// ---- submit status -------------------------------------------------------------------------------------

const SUBMIT_STATES: ReadonlySet<string> = new Set<SubmitState>(["todo", "ready", "submitted", "blocked"]);

/** map_submit_status → SubmitStatusResponse. The counts are recomputed from the rows that survive. */
export function toSubmitStatusResponse(data: unknown): SubmitStatusResponse {
  const d = isRow(data) ? data : {};
  const options: SubmitStatus[] = [];
  for (const r of rows(d.options)) {
    const subitemId = id(r.subitem_id);
    if (!subitemId) continue;
    const state = (typeof r.state === "string" && SUBMIT_STATES.has(r.state) ? r.state : "todo") as SubmitState;
    options.push({
      subitemId,
      propertyId: id(r.property_id),
      state,
      reason: state === "blocked" ? str(r.reason) : null,
      approvedBy: str(r.approved_by),
      approvedAt: str(r.approved_at),
      submittedBy: str(r.submitted_by),
      submittedAt: str(r.submitted_at),
    });
  }
  return {
    enabled: true,
    options,
    counts: {
      ready: options.filter((o) => o.state === "ready").length,
      submitted: options.filter((o) => o.state === "submitted").length,
    },
  };
}

// ---- nearsite claims -----------------------------------------------------------------------------------

/** map_nearsite_claims → NearsiteClaim[] (the route adds `enabled`). */
export function toNearsiteClaims(data: unknown): NearsiteClaim[] {
  const d = isRow(data) ? data : {};
  const out: NearsiteClaim[] = [];
  for (const r of rows(d.claims)) {
    const claimId = id(r.id);
    if (!claimId) continue;
    let lat = num(r.lat);
    let lng = num(r.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      lat = null;
      lng = null;
    }
    out.push({
      id: claimId,
      mondayItemId: id(r.monday_item_id),
      title: str(r.title) ?? `Nearsite claim ${claimId}`,
      company: str(r.company),
      city: str(r.city),
      state: str(r.state),
      lat,
      lng,
      lossAddress: str(r.loss_address),
      beds: num(r.beds),
      baths: num(r.baths),
      budgetMonthly: num(r.budget_monthly),
      maxRate: num(r.max_rate),
      moveIn: str(r.move_in),
      daysLeft: int(r.days_left),
      feeGroup: str(r.fee_group),
      homesFound: int(r.homes_found),
      status: str(r.status),
      assignedTo: str(r.assigned_to),
      url: httpUrl(r.url),
    });
  }
  return out;
}

// ---- find phone ----------------------------------------------------------------------------------------

export const PHONE_OFF: PhoneLookup = { state: "off", phone: null, source: null, confidence: null, lookedUpAt: null };
/** Nobody has looked this property up yet. */
export const PHONE_NONE: PhoneLookup = { state: "not_found", phone: null, source: null, confidence: null, lookedUpAt: null };

const CONFIDENCE = new Set(["high", "medium", "low"]);
const confidence = (v: unknown): PhoneLookup["confidence"] =>
  typeof v === "string" && CONFIDENCE.has(v) ? (v as PhoneLookup["confidence"]) : null;

/** map_phone_lookup_get → PhoneLookup (PHONE_NONE when there is no saved lookup). */
export function toPhoneLookup(data: unknown): PhoneLookup {
  const l = isRow(data) && isRow(data.lookup) ? data.lookup : null;
  if (!l) return PHONE_NONE;
  const phone = str(l.phone);
  return {
    state: phone ? "found" : "not_found",
    phone,
    source: str(l.source),
    confidence: phone ? confidence(l.confidence) : null,
    lookedUpAt: str(l.looked_up_at),
  };
}

/**
 * What the phone lookup webhook (MAP_PHONE_URL) answered: `{ phone, source?, confidence? }`. A phone is kept
 * only when it has 7–15 digits; anything else is "not found".
 */
export function readPhoneAnswer(body: unknown): { phone: string | null; source: string | null; confidence: PhoneLookup["confidence"] } {
  const b = isRow(body) ? body : {};
  const raw = typeof b.phone === "string" ? b.phone.trim() : typeof b.phone === "number" ? String(b.phone) : "";
  const digits = raw.replace(/\D/g, "");
  const phone = digits.length >= 7 && digits.length <= 15 ? `${raw.startsWith("+") ? "+" : ""}${digits}` : null;
  const source = cleanText(b.source, 60) || null;
  return { phone, source, confidence: phone ? confidence(b.confidence) : null };
}

// ---- agent chat ----------------------------------------------------------------------------------------

export const MAX_MESSAGE = 1000;
export const MAX_USER = 80;

/** What map_claim_context answers, read defensively. */
export interface ClaimContext {
  /** The search system knows this claim. */
  known: boolean;
  /** The Monday board the claim item is on, when the search system knows. */
  boardId: string | null;
  searchId: string | null;
  versionNo: number | null;
  listing: { found: boolean; inRun: boolean; addressKnown: boolean; onClaim: boolean; propertyItemId: string | null; subitemId: string | null } | null;
}

export function toClaimContext(data: unknown): ClaimContext {
  const d = isRow(data) ? data : {};
  const l = isRow(d.listing) ? d.listing : null;
  return {
    known: d.known === true,
    boardId: id(d.board_id),
    searchId: str(d.search_id),
    versionNo: int(d.version_no),
    listing: l
      ? {
          found: l.found === true,
          inRun: l.in_run === true,
          addressKnown: l.address_known === true,
          onClaim: l.on_claim === true,
          propertyItemId: id(l.property_item_id),
          subitemId: id(l.subitem_id),
        }
      : null,
  };
}

export type AskProblem = { error: string };
export type CleanAsk = { action: AskRequest["action"]; message: string; listingId: string | null; user: string };

/** Validates and cleans the browser's body for POST /api/claim/:id/ask. */
export function parseAsk(raw: unknown): CleanAsk | AskProblem {
  if (!isRow(raw)) return { error: "Body must be a JSON object" };
  const action = raw.action;
  if (action !== "open" && action !== "message" && action !== "reject" && action !== "more_like" && action !== "undo") {
    return { error: "action must be open, message, reject, more_like or undo" };
  }
  const user = cleanText(raw.user, MAX_USER);
  if (user === undefined) return { error: `user must be text up to ${MAX_USER} characters` };
  const message = cleanText(raw.message, MAX_MESSAGE);
  if (message === undefined) return { error: `message must be text up to ${MAX_MESSAGE} characters` };
  if (action === "message" && !message) return { error: "message is required" };
  let listingId: string | null = null;
  if (action === "reject" || action === "more_like") {
    if (typeof raw.listingId !== "string" || !UUID_RE.test(raw.listingId)) return { error: "listingId is required" };
    listingId = raw.listingId.toLowerCase();
  }
  return { action, message: action === "message" ? message : "", listingId, user };
}

/** The Search Chat webhook's request body (workflow "Nearsite · 08 Search Chat API", node "Read the request"). */
export interface ChatUpstreamBody {
  token: string;
  action: "open" | "message" | "reject" | "more_like" | "add";
  item_id: string;
  board_id: string;
  user_id: string;
  user_name: string;
  message: string;
  listing_id: string | null;
}

/**
 * The upstream action and message for a cleaned request, or a ready answer when nothing needs to be sent.
 * The webhook has no "undo" action: going back is done by its message reader ("go back to version N"), so
 * undo is sent as that message for the version before the current one.
 */
export function upstreamFor(ask: CleanAsk, versionNo: number | null): { action: ChatUpstreamBody["action"]; message: string; listingId: string | null } | { say: string } {
  if (ask.action === "undo") {
    if (versionNo === null || versionNo <= 1) return { say: "There is no earlier search to go back to." };
    return { action: "message", message: `Go back to version ${versionNo - 1}`, listingId: null };
  }
  return { action: ask.action, message: ask.message, listingId: ask.listingId };
}

const SAY_MAX = 600;
const SAY_FALLBACK = "The agent did not answer. Try again in a minute.";

/** The agent's sentence, cleaned for display. Set-up problems are not passed on word for word. */
export function cleanSay(v: unknown): string {
  const s = cleanText(typeof v === "string" ? v.slice(0, SAY_MAX * 2) : "", SAY_MAX * 2) ?? "";
  if (!s) return "";
  if (/bad key|not set up correctly/i.test(s)) return "The agent is not set up yet. Tell the person who looks after the map.";
  // The map has no login, so nothing the agent writes may show a tenant's or an owner's contact details.
  const redacted = s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]")
    .replace(/(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[number removed]");
  return redacted.length > SAY_MAX ? `${redacted.slice(0, SAY_MAX - 1)}…` : redacted;
}

/**
 * The Search Chat webhook's answer ({ ok, say, claim, result, changed, added_listing_id, outreach }, where
 * `result` is chat_get_search's { search_id, version_no, run, homes, … }) → AskResponse. `fallback` supplies
 * the search and version when the answer carries no result.
 */
export function toAskResponse(up: unknown, fallback: { searchId: string | null; versionNo: number | null } = { searchId: null, versionNo: null }): AskResponse {
  const u = isRow(up) ? up : {};
  const result = isRow(u.result) ? u.result : null;
  const run = result && isRow(result.run) ? result.run : null;
  const homes = result ? rows(result.homes) : [];
  const status = run ? str(run.status) : null;
  const say = cleanSay(u.say);
  return {
    ok: u.ok === true,
    say: say || (u.ok === true ? "Done." : SAY_FALLBACK),
    running: status === "queued" || status === "running",
    searchId: (result ? str(result.search_id) : null) ?? str(u.search_id) ?? fallback.searchId,
    versionNo: (result ? int(result.version_no) : null) ?? fallback.versionNo,
    summary: result
      ? {
          homes: Math.max(run ? (int(run.fitting) ?? 0) : 0, homes.length),
          newHomes: run && int(run.new_homes) !== null ? (int(run.new_homes) as number) : homes.filter((h) => h.is_new === true).length,
        }
      : null,
  };
}

/** What the webhook answered to "add": the home went on the claim, was already there, or was not added. */
export function readAddAnswer(up: unknown, listingId: string): "added" | "already" | "failed" {
  const u = isRow(up) ? up : {};
  if (typeof u.added_listing_id === "string" && u.added_listing_id.toLowerCase() === listingId.toLowerCase()) return "added";
  if (u.ok === true && typeof u.say === "string" && /already on this claim/i.test(u.say)) return "already";
  return "failed";
}
