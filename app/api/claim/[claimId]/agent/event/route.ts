import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { parseAgentEvent } from "@/lib/agent-graph";
import { cleanText, clientIp, ID_RE, RateLimiter } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });
const limiter = new RateLimiter(60, 60_000);

/**
 * POST /api/claim/:claimId/agent/event   { type, homeKey?, decision? | action?, resumeTo?, by? }
 * Records what a person decided (tick or X a home, press Submit, drop or send back a home) in agent_inbox.
 * The agent picks it up and moves the claim on its graph; nothing is sent from here. Off with `agentGraph`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");
  const secret = editSecret();
  if (!featureOn("agentGraph") || !secret) return fail(404, "off", "The claims agent is switched off");
  if (!limiter.allow(clientIp(req.headers))) return fail(429, "rate_limited", "Too many changes, try again in a minute");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Expected JSON");
  }
  const ev = parseAgentEvent(body);
  if (!ev.ok) return fail(400, "bad_request", ev.error);
  const by = cleanText((body as Record<string, unknown>).by, 60);
  if (by === undefined) return fail(400, "bad_request", "Name too long");

  try {
    const { data, error } = await supabase().rpc("map_agent_event", {
      p_secret: secret, p_claim_item_id: claimId, p_home_key: ev.homeKey, p_type: ev.type, p_payload: ev.payload, p_by: by || null,
    });
    if (error) throw error;
    const ok = data && typeof data === "object" && (data as Record<string, unknown>).ok === true;
    if (!ok) return fail(409, "refused", String((data as Record<string, unknown> | null)?.error ?? "Refused"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/claim/[claimId]/agent/event failed", claimId, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
