import "server-only";
import { editSecret } from "./edit-config";
import { chatToken, chatUrl } from "./features";
import {
  RateLimiter, cleanText, parseAsk, readAddAnswer, refused, toAskResponse, toClaimContext, upstreamFor, MAX_USER,
  type ChatUpstreamBody, type ClaimContext,
} from "./map-agent";
import { BOARDS, DRY_RUN } from "./monday";
import { supabase } from "./supabase";
import type { AddOutsideResponse, AskResponse } from "./types";

/**
 * The map's side of the Search Chat webhook (n8n workflow "Nearsite · 08 Search Chat API"): the same API the
 * Monday side panel and the Slack agent use. The webhook address (MAP_CHAT_URL) and its panel key
 * (MAP_CHAT_TOKEN) stay on the server; the browser only ever sees AskResponse / AddOutsideResponse.
 *
 * Request body: { token, action, item_id, board_id, user_id, user_name, message, listing_id }, actions
 * open | message | reject | more_like | add (plus the landlord actions, which the map does not use).
 * Answer: { ok, say, claim, result, changed, added_listing_id, outreach }; `result` is the search as
 * chat_get_search returns it. The workflow answers only when it is done, and a search can take two minutes.
 */

/** A refusal the route turns into an ApiError. `message` is always safe to show. */
export class AgentError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 100_000;
/** Who the map is to the workflow. Its pilot list, when one is set, must include this id. */
const chatUserId = () => process.env.MAP_CHAT_USER_ID?.trim() || "map";

// 30 calls per IP per 10 minutes across ask and add-outside, per server instance: each call can start a paid search.
const limiter = new RateLimiter(30, 10 * 60_000);

async function claimContext(claimId: string, listingId: string | null): Promise<ClaimContext> {
  const secret = editSecret();
  if (!secret) throw new AgentError(503, "agent_off", "The agent is switched off");
  const { data, error } = await supabase().rpc("map_claim_context", { p_secret: secret, p_claim_item_id: claimId, p_listing_id: listingId });
  if (error) {
    console.error("agent: map_claim_context failed", claimId, error.message);
    throw new AgentError(502, "db_error", "Could not read the claim's search");
  }
  if (refused(data)) {
    console.error("agent: map_claim_context refused the secret");
    throw new AgentError(502, "db_error", "Could not read the claim's search");
  }
  return toClaimContext(data);
}

/** POSTs to the webhook. Null when it timed out; throws AgentError when it could not be reached or made no sense. */
async function callWebhook(body: Omit<ChatUpstreamBody, "token">): Promise<unknown | null> {
  const url = chatUrl();
  const token = chatToken();
  if (!url || !token) throw new AgentError(503, "agent_off", "The agent is switched off");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body } satisfies ChatUpstreamBody),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("agent: webhook answered", res.status);
      throw new AgentError(502, "agent_error", "The agent did not answer. Try again in a minute.");
    }
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof AgentError) throw e;
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return null;
    // Never the raw error: it can carry the webhook address.
    console.error("agent: webhook call failed", e instanceof Error ? e.name : "error");
    throw new AgentError(502, "agent_error", "The agent did not answer. Try again in a minute.");
  }
}

/**
 * One step of the chat for a claim: open the search, say something, hide a home, search around a home, or go
 * back one search. `req` is the browser's body, validated here. Throws AgentError (400, 429, 502, 503).
 */
export async function askAgent(claimId: string, req: unknown, ip: string): Promise<AskResponse> {
  const ask = parseAsk(req);
  if ("error" in ask) throw new AgentError(400, "bad_request", ask.error);
  if (!limiter.allow(ip)) throw new AgentError(429, "rate_limited", "Too many messages; try again in a few minutes");

  const ctx = await claimContext(claimId, null);
  if (!ctx.known) throw new AgentError(404, "not_found", "This claim is not in the search system yet.");
  const step = upstreamFor(ask, ctx.versionNo);
  if ("say" in step) {
    return { ok: true, say: step.say, running: false, searchId: ctx.searchId, versionNo: ctx.versionNo, summary: null };
  }

  const answer = await callWebhook({
    action: step.action,
    item_id: claimId,
    board_id: ctx.boardId ?? BOARDS.claim,
    user_id: chatUserId(),
    user_name: ask.user,
    message: step.message,
    listing_id: step.listingId,
  });
  if (answer === null) {
    return {
      ok: true,
      say: "Still searching. New homes will show here when it finishes.",
      running: true,
      searchId: ctx.searchId,
      versionNo: ctx.versionNo,
      summary: null,
    };
  }
  return toAskResponse(answer, { searchId: ctx.searchId, versionNo: ctx.versionNo });
}

/**
 * "Add to claim" for a home found outside our database: the workflow puts it in PROPERTY DATABASE once and
 * adds the sub-item under the claim. Checked first, without calling the workflow: the home exists, is not
 * already on the claim, and has an address (the workflow would otherwise add a sub-item with no property
 * behind it). With MONDAY_DRY_RUN=1 nothing is sent. Throws AgentError (404, 409 no_address, 429, 502, 504).
 */
export async function addOutsideHome(claimId: string, listingId: string, user: unknown, ip: string): Promise<AddOutsideResponse & { created: boolean }> {
  const userName = cleanText(user, MAX_USER);
  if (userName === undefined) throw new AgentError(400, "bad_request", `user must be text up to ${MAX_USER} characters`);
  if (DRY_RUN) return { ok: true, propertyId: null, subitemId: null, alreadyOnClaim: false, dryRun: true, created: false };
  if (!limiter.allow(ip)) throw new AgentError(429, "rate_limited", "Too many requests; try again in a few minutes");

  const ctx = await claimContext(claimId, listingId);
  if (!ctx.known) throw new AgentError(404, "not_found", "This claim is not in the search system yet.");
  const home = ctx.listing;
  if (!home?.found || !home.inRun) throw new AgentError(404, "not_found", "That home is no longer in this claim's search results");
  if (home.onClaim) {
    return { ok: true, propertyId: home.propertyItemId, subitemId: home.subitemId, alreadyOnClaim: true, created: false };
  }
  if (!home.addressKnown) {
    throw new AgentError(409, "no_address", "This home has no street address yet. Ask the landlord for it first");
  }

  const answer = await callWebhook({
    action: "add",
    item_id: claimId,
    board_id: ctx.boardId ?? BOARDS.claim,
    user_id: chatUserId(),
    user_name: userName,
    message: "",
    listing_id: listingId,
  });
  if (answer === null) {
    throw new AgentError(504, "timeout", "Adding is taking longer than usual. Check the claim before trying again");
  }
  const outcome = readAddAnswer(answer, listingId);
  if (outcome === "failed") {
    console.error("agent: add was not confirmed", claimId, listingId);
    throw new AgentError(502, "agent_error", "The home was not added. Try again in a minute");
  }

  // The answer carries no ids; the search system has them once the add is recorded.
  let after = home;
  try {
    after = (await claimContext(claimId, listingId)).listing ?? home;
  } catch {
    // The add landed; the ids are only a convenience.
  }
  return { ok: true, propertyId: after.propertyItemId, subitemId: after.subitemId, alreadyOnClaim: outcome === "already", created: outcome === "added" };
}
