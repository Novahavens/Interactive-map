import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { featureOn } from "@/lib/features";
import { NO_AGENT, toAgentState, type AgentState } from "@/lib/agent-graph";
import { ID_RE, refused } from "@/lib/map-agent";
import { supabase } from "@/lib/supabase";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * GET /api/claim/:claimId/agent
 * Where the claims agent has this claim on its graph: the stage, what it waits on, and each home's step.
 * Read-only; never cached. `{ enabled: false, … }` while the `agentGraph` feature is off.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");
  const secret = editSecret();
  if (!featureOn("agentGraph") || !secret) return NextResponse.json<AgentState>(NO_AGENT);
  try {
    const { data, error } = await supabase().rpc("map_agent_state", { p_secret: secret, p_claim_item_id: claimId });
    if (error) throw error;
    if (refused(data)) {
      console.error("GET /api/claim/[claimId]/agent: the database refused the map secret");
      return fail(502, "db_error", "Database query failed");
    }
    return NextResponse.json<AgentState>(toAgentState(data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/claim/[claimId]/agent failed", claimId, e instanceof Error ? e.message : e);
    return fail(502, "db_error", "Database query failed");
  }
}
