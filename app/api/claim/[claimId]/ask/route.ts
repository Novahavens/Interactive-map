import { NextRequest, NextResponse } from "next/server";
import { AgentError, askAgent } from "@/lib/agent-chat";
import { featureOn } from "@/lib/features";
import { ID_RE, clientIp } from "@/lib/map-agent";
import type { ApiError, AskResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
// The workflow answers only when its search is done; lib/agent-chat.ts gives up at 100 s.
export const maxDuration = 120;

const MAX_BODY = 4096;

const fail = (status: number, code: string, error: string) => NextResponse.json<ApiError>({ error, code }, { status });

/**
 * POST /api/claim/:claimId/ask  { action: "open" | "message" | "reject" | "more_like" | "undo", message?, listingId?, user? }
 *
 * One step of the agent chat, passed on to the Search Chat workflow (its address and key stay on the server).
 * Answers AskResponse; `running: true` means the search is still going and /outside should be read again.
 * While the `chat` feature is off: 200 `{ ok: false, say, running: false, … }` and nothing is sent.
 * 400 bad body, 413 over 4 KB, 429 over 30 per IP per 10 minutes, 502 `agent_error` / `db_error`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await ctx.params;
  if (!ID_RE.test(claimId)) return fail(400, "bad_request", "Invalid claim id");

  if (!featureOn("chat")) {
    return NextResponse.json<AskResponse>({ ok: false, say: "The agent is switched off.", running: false, searchId: null, versionNo: null, summary: null });
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > MAX_BODY) return fail(413, "too_large", "Message is too long");
    body = JSON.parse(text);
  } catch {
    return fail(400, "bad_request", "Body must be a JSON object");
  }

  try {
    return NextResponse.json<AskResponse>(await askAgent(claimId, body, clientIp(req.headers)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AgentError) return fail(e.status, e.code, e.message);
    console.error("POST /api/claim/[claimId]/ask failed", claimId, e instanceof Error ? e.name : "error");
    return fail(502, "agent_error", "The agent did not answer. Try again in a minute.");
  }
}
