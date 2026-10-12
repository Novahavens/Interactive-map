import { NextResponse } from "next/server";
import { DRY_RUN } from "@/lib/monday";
import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness plus whether Monday writes are disabled (MONDAY_DRY_RUN). */
export function GET() {
  return NextResponse.json<HealthResponse>({ ok: true, dryRun: DRY_RUN });
}
