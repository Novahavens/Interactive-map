import { NextRequest, NextResponse } from "next/server";
import { editSecret } from "@/lib/edit-config";
import { holdsSecret, quoConfig, webhookUrl } from "@/lib/quo-config";
import { QuoError, ensureWebhook, quoEnabled } from "@/lib/quo";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/quo/setup (x-map-secret) — creates the one Quo webhook that sends calls, texts and call summaries
 * for every number to this deployment's /api/quo/webhook, and stores its signing key in sync_config. Safe to
 * run again: a matching webhook is kept; if its key was lost it is rotated. Answers with the mode in force.
 */
export async function POST(req: NextRequest) {
  if (!holdsSecret(req.headers)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!quoEnabled()) return NextResponse.json({ ok: false, error: "QUO_API_KEY is not set" }, { status: 503 });
  const url = webhookUrl(req.url);
  try {
    const config = await quoConfig(true);
    if (!config) return NextResponse.json({ ok: false, error: "the database refused MAP_EDIT_SECRET" }, { status: 503 });
    const hook = await ensureWebhook(url, config.webhookId, config.keys.length > 0, AbortSignal.timeout(20_000));
    if (hook.key) {
      const { data, error } = await supabase().rpc("quo_set_webhook", { p_secret: editSecret(), p_webhook_id: hook.id, p_key: hook.key });
      if (error || data !== true) throw new Error(`could not store the signing key: ${error?.message ?? data}`);
    }
    return NextResponse.json({ ok: true, url, webhookId: hook.id, action: hook.action, keyStored: !!hook.key || config.keys.length > 0, mode: config.mode });
  } catch (e) {
    const status = e instanceof QuoError ? e.status : 0;
    console.error("quo-setup: failed", errorText(e));
    return NextResponse.json({ ok: false, error: errorText(e), quoStatus: status || undefined }, { status: 502 });
  }
}
