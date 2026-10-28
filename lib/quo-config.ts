import "server-only";
import { timingSafeEqual } from "node:crypto";
import { editSecret } from "./edit-config";
import { supabase } from "./supabase";

/**
 * The contact log's switches, from sync_config (so they change without a deploy): QUO_LOG_MODE 'shadow'
 * (record only, the default), 'live' (write Monday) or 'off' (ignore events); QUO_LIVE_USERS limits live
 * writes to some teammates; QUO_WEBHOOK_KEYS are the signing keys /api/quo/setup stored. A change takes
 * effect within 5 s. All behind the same server secret as listing edits (MAP_EDIT_SECRET = sync_config
 * MAP_EDIT_KEY).
 */
export interface QuoConfig {
  mode: "shadow" | "live" | "off";
  liveUsers: string;
  keys: string[];
}

const TTL_MS = 5_000;
let cached: { at: number; value: QuoConfig } | null = null;

/** Null when the secret is missing or the database refuses it. Cached per instance for 5 s. */
export async function quoConfig(fresh = false): Promise<QuoConfig | null> {
  const secret = editSecret();
  if (!secret) return null;
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const { data, error } = await supabase().rpc("quo_config", { p_secret: secret });
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const mode = d.mode === "live" || d.mode === "off" ? d.mode : "shadow";
  const value: QuoConfig = {
    mode,
    liveUsers: typeof d.liveUsers === "string" ? d.liveUsers : "",
    keys: Array.isArray(d.keys) ? d.keys.filter((k): k is string => typeof k === "string" && k.startsWith("whsec_")) : [],
  };
  cached = { at: Date.now(), value };
  return value;
}

/** The team's time zone for dates and note times (Tulsa). */
export const quoTimeZone = () => process.env.QUO_TIMEZONE?.trim() || "America/Chicago";

/** An operator route's caller proves it holds the server secret (MAP_EDIT_SECRET) in `x-map-secret`. */
export function holdsSecret(headers: Headers): boolean {
  const secret = editSecret();
  const given = headers.get("x-map-secret") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
