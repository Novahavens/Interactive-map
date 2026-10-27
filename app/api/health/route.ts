import { NextResponse } from "next/server";
import { DRY_RUN } from "@/lib/monday";
import { quoEnabled } from "@/lib/quo";
import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness, whether Monday writes are disabled (MONDAY_DRY_RUN), whether Quo is set up, and whether listing edits are on (MAP_EDITING). */
export function GET() {
  return NextResponse.json<HealthResponse>({ ok: true, dryRun: DRY_RUN, quo: quoEnabled(), editing: process.env.MAP_EDITING !== "off" });
}
