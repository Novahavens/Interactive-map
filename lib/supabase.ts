import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "server-only";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client. The key never reaches the browser.
 * The four RPCs are SECURITY DEFINER and granted to anon, so the publishable
 * key is sufficient; the properties table itself is RLS-locked with no policy.
 */
export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be set");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** RPC results come back as one row or an array of rows depending on the function. */
export function first<T>(data: unknown): T | undefined {
  return ((Array.isArray(data) ? data[0] : data) ?? undefined) as T | undefined;
}

/** Runs RPCs in parallel and returns their data in order; throws the first Supabase error. */
export async function rpcAll(calls: [fn: string, args?: Record<string, unknown>][]): Promise<unknown[]> {
  const results = await Promise.all(calls.map(([fn, args]) => supabase().rpc(fn, args)));
  for (const r of results) if (r.error) throw r.error;
  return results.map((r) => r.data);
}
