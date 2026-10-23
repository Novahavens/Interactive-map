// Who is calling a sync function: the pg_cron kick (x-sync-secret), a Monday webhook (?key=), or nobody.
import { supabase } from "./db.ts";
import { safeEqual } from "./mapping.ts";

/** Value from public.sync_config (service-role only). A read error throws (a 500), never reads as "no secret" (a 401). */
export async function config(key: string): Promise<string | null> {
  const { data, error } = await supabase().from("sync_config").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`sync_config read failed: ${error.message}`);
  return (data as { value?: string } | null)?.value ?? null;
}

export type AuthMode = { mode: "cron" | "webhook" | "unauthorized" };

export async function authorize(req: Request): Promise<AuthMode> {
  const header = req.headers.get("x-sync-secret");
  if (header !== null) {
    const secret = await config("SYNC_SECRET");
    return { mode: secret && safeEqual(header, secret) ? "cron" : "unauthorized" };
  }
  const key = await config("MAP_HOOK_KEY");
  return { mode: key && safeEqual(new URL(req.url).searchParams.get("key") ?? "", key) ? "webhook" : "unauthorized" };
}
