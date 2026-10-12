import { NextRequest, NextResponse } from "next/server";
import { listActiveClaims, MondayError } from "@/lib/monday";
import type { ActiveClaim, ActiveClaimsResponse, ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

// Per-instance cache so reopening the drawer doesn't page Monday each time. `fresh=1` (the Refresh button) bypasses it.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; claims: ActiveClaim[] }>();

/**
 * GET /api/claims/active?q=&includeTest=0&fresh=0
 *
 * Claims waiting on housing options (see ACTIVE_GROUPS in lib/monday.ts), newest first.
 * `q` filters by name or loss address; the drawer also filters client-side as you type.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const includeTest = sp.get("includeTest") === "1";
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const key = includeTest ? "test" : "live";

  try {
    let hit = cache.get(key);
    if (!hit || sp.get("fresh") === "1" || Date.now() - hit.at > TTL_MS) {
      hit = { at: Date.now(), claims: await listActiveClaims(includeTest) };
      cache.set(key, hit);
    }
    const claims = q
      ? hit.claims.filter((c) => c.name.toLowerCase().includes(q) || (c.lossAddress ?? "").toLowerCase().includes(q))
      : hit.claims;
    return NextResponse.json<ActiveClaimsResponse>({ claims, count: claims.length });
  } catch (e) {
    const code = e instanceof MondayError ? "monday_error" : "server_error";
    const message = e instanceof Error ? e.message : "Could not list active claims";
    return NextResponse.json<ApiError>({ error: message, code }, { status: 502 });
  }
}
