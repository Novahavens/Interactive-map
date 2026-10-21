// Gets owner-board changes onto the map. When an owner's approval status, note, phone, email or
// property list changes on "Landlord & PMs Contact", every property they own must be re-read, or
// the dot colour would stay stale until some other edit touched that property.
//
// monday-webhook already knows how to re-read a property and mirror it into Supabase, so this
// function only finds the owner's properties and asks it to, with the same synthetic event
// Monday would send. The event is a hint there as well: the property is re-read from Monday.
//
//   POST ?key=<MAP_HOOK_KEY>   webhook on board 9616452671 (change_column_value, change_name)
//
// Replies at once and does the work in the background (Monday gives up on slow webhooks).
// Secrets: MONDAY_API_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";
import { MAX_PROPERTIES_PER_EVENT, OWNERSHIP_COLUMN, parseLandlordEvent, propertyEvent } from "./event.ts";

const MONDAY_API = "https://api.monday.com/v2";
const SYNC_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/monday-webhook`;
const DEDUPE_MS = 20_000;
const CONCURRENCY = 5;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function hookKey(): Promise<string | null> {
  const { data } = await sb.from("sync_config").select("value").eq("key", "MAP_HOOK_KEY").maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function ownedProperties(landlordId: string): Promise<string[]> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-10" },
    body: JSON.stringify({
      query: `query ($ids: [ID!]) { items (ids: $ids) { column_values (ids: ["${OWNERSHIP_COLUMN}"]) { id ... on BoardRelationValue { linked_item_ids } } } }`,
      variables: { ids: [landlordId] },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.data) throw new Error(json?.errors?.[0]?.message ?? `monday.com returned ${res.status}`);
  const linked: string[] = json.data.items?.[0]?.column_values?.[0]?.linked_item_ids ?? [];
  return linked.map(String);
}

// Bulk edits by one person send many events for the same owner; handle each owner once per window.
const recent = new Map<string, number>();

async function resync(landlordId: string) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  if (recent.has(landlordId)) return;
  recent.set(landlordId, now);

  const properties = (await ownedProperties(landlordId)).slice(0, MAX_PROPERTIES_PER_EVENT);
  let i = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, properties.length) }, async () => {
    while (i < properties.length) {
      const id = properties[i++];
      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propertyEvent(id)),
      }).catch(() => null);
      if (!res || !res.ok) failed++;
    }
  }));
  console.info(`landlord ${landlordId}: re-read ${properties.length} properties, ${failed} failed`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("landlord-webhook", { status: 200 });
  const url = new URL(req.url);
  const key = await hookKey();
  if (!key || !safeEqual(url.searchParams.get("key") ?? "", key)) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.challenge === "string") return Response.json({ challenge: body.challenge });

  const parsed = parseLandlordEvent(body);
  if (!parsed) return Response.json({ ignored: true });

  const work = resync(parsed.landlordId).catch((e) => console.error("landlord resync failed", parsed.landlordId, e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work);
  else await work;
  return Response.json({ queued: parsed.landlordId });
});
