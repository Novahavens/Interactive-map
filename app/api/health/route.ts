import { NextResponse } from "next/server";
import { DRY_RUN } from "@/lib/monday";
import { quoEnabled } from "@/lib/quo";
import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness, whether Monday writes are disabled (MONDAY_DRY_RUN), and whether Quo is set up. */
export function GET() {
  return NextResponse.json<HealthResponse>({ ok: true, dryRun: DRY_RUN, quo: quoEnabled() });
}
