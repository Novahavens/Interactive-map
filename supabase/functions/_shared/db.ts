// Supabase side of the sync: the one place the edge functions write to the mirror.
import { createClient } from "npm:@supabase/supabase-js@2";
import { LANDLORD_COLUMNS, landlordIdsOf, toLandlord, toRow, type LandlordInfo, type MondayItem } from "./mapping.ts";
import { monday } from "./monday.ts";

let client: ReturnType<typeof createClient> | undefined;

export function supabase() {
  client ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  return client;
}

/**
 * Shared secret for the backfill endpoint. The row in public.sync_config
 * (service-role only, RLS locked) is authoritative: rotation is
 * `update sync_config set value = encode(gen_random_bytes(32),'hex') where key = 'SYNC_SECRET'`.
 * The SYNC_SECRET env var is only a fallback for a fresh project with no row yet.
 */
export async function syncSecret(): Promise<string | null> {
  const { data, error } = await supabase().from("sync_config").select("value").eq("key", "SYNC_SECRET").maybeSingle();
  if (error) console.error("sync_config read failed", error.message);
  const value = (data as { value?: string } | null)?.value;
  if (value) return value;
  return Deno.env.get("SYNC_SECRET") ?? null;
}

/** Landlord details come straight from the landlord board. The mirror columns
 *  on the property board return "unsupported" through the API. */
export async function fetchLandlords(ids: string[]): Promise<Map<string, LandlordInfo>> {
  const out = new Map<string, LandlordInfo>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const data = await monday<{ items: MondayItem[] }>(
      `query ($ids: [ID!]) { items (ids: $ids) { id name column_values (ids: ${JSON.stringify(LANDLORD_COLUMNS)}) { id text value } } }`,
      { ids: unique.slice(i, i + 100) },
    );
    for (const item of data.items ?? []) out.set(item.id, toLandlord(item));
  }
  return out;
}

export async function upsertItems(items: MondayItem[]): Promise<number> {
  if (!items.length) return 0;
  const landlords = await fetchLandlords(landlordIdsOf(items));
  const now = new Date();
  const rows = items.map((i) => toRow(i, landlords, now));
  const { error } = await supabase().from("properties").upsert(rows as never, { onConflict: "monday_item_id" });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  return rows.length;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase().from("properties").delete().eq("monday_item_id", itemId);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}
