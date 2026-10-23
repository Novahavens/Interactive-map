// Keeps public.claim_options current: every active option (a claim sub-item that points at a
// property), so the map can say "already on claim X" before someone adds it to another claim.
//
//   POST x-sync-secret         the 10-minute cron (public.claim_options_kick())
//   POST ?key=<MAP_HOOK_KEY>   a webhook on the claim board (sub-item status / property changes);
//                              only a hint, the board is re-read either way, throttled to one run per 20 s
//
// Monday cost per run: one boards query for all nine groups (sub-items nested), plus one
// next_items_page per group that holds more than 100 claims. Normally 1-2 calls; the count is returned.
// Replace semantics: upsert everything read, then delete rows this run did not touch. If Monday
// returned 0 claims the run fails and the old rows stay.
// ?dry=1: read and count, write nothing.
// Secrets: MONDAY_API_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ACTIVE_GROUPS, CLAIM_BOARD, SUBITEM_PROPERTY_COL, SUBITEM_STATUS_COL, replaceGuard, toOptions, type RawClaim } from "./rules.ts";

const MONDAY_API = "https://api.monday.com/v2";
const THROTTLE_MS = 20_000;
const CHUNK = 200;
const PAGE = 100;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function config(key: string): Promise<string | null> {
  const { data } = await sb.from("sync_config").select("value").eq("key", key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

let calls = 0;
async function monday<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");
  calls++;
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.data || (Array.isArray(json.errors) && json.errors.length)) {
    throw new Error(json?.errors?.[0]?.message ?? `monday.com returned ${res.status}`);
  }
  return json.data as T;
}

type Page = { cursor: string | null; items: RawClaim[] };

const ITEM = `id name group { id } subitems { id name column_values(ids: ${JSON.stringify([SUBITEM_STATUS_COL, SUBITEM_PROPERTY_COL])}) { id text ... on BoardRelationValue { linked_item_ids } } }`;

async function readClaims(): Promise<RawClaim[]> {
  const ids = JSON.stringify(Object.keys(ACTIVE_GROUPS));
  const first = await monday<{ boards: { groups: { id: string; items_page: Page }[] }[] }>(
    `query { boards(ids: [${CLAIM_BOARD}]) { groups(ids: ${ids}) { id items_page(limit: ${PAGE}) { cursor items { ${ITEM} } } } } }`,
  );
  const claims: RawClaim[] = [];
  for (const g of first.boards?.[0]?.groups ?? []) {
    claims.push(...g.items_page.items);
    let cursor = g.items_page.cursor;
    while (cursor) {
      const next = await monday<{ next_items_page: Page }>(
        `query ($c: String!) { next_items_page(limit: ${PAGE}, cursor: $c) { cursor items { ${ITEM} } } }`,
        { c: cursor },
      );
      claims.push(...next.next_items_page.items);
      cursor = next.next_items_page.cursor;
    }
  }
  return claims;
}

async function run(dry: boolean) {
  const claims = await readClaims();
  const guard = replaceGuard(claims.length);
  if (!guard.replace) throw new Error(guard.reason);
  const rows = toOptions(claims);
  if (dry) return { dry: true, claims: claims.length, options: rows.length, mondayCalls: calls };

  const started = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from("claim_options").upsert(
      rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: started })), { onConflict: "subitem_id" },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }
  // Options that left an active claim or status are the rows this run did not touch.
  const { error: delErr, count } = await sb.from("claim_options").delete({ count: "exact" }).lt("updated_at", started);
  if (delErr) throw new Error(`cleanup failed: ${delErr.message}`);
  await sb.from("claim_options_log").insert({ claims: claims.length, options: rows.length });
  return { claims: claims.length, options: rows.length, removed: count ?? 0, mondayCalls: calls };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("claim-options-sync", { status: 200 });
  const url = new URL(req.url);
  calls = 0;
  try {
    const header = req.headers.get("x-sync-secret");
    if (header !== null) {
      const secret = await config("SYNC_SECRET");
      if (!secret || !safeEqual(header, secret)) return new Response("unauthorized", { status: 401 });
      return Response.json(await run(url.searchParams.get("dry") === "1"));
    }

    // claim-board webhook
    const key = await config("MAP_HOOK_KEY");
    if (!key || !safeEqual(url.searchParams.get("key") ?? "", key)) return new Response("unauthorized", { status: 401 });
    const body = await req.json().catch(() => null);
    if (typeof body?.challenge === "string") return Response.json({ challenge: body.challenge });
    const { data: last } = await sb.from("claim_options_log").select("at").order("id", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date((last as { at: string }).at).getTime() < THROTTLE_MS) {
      return Response.json({ skipped: "ran moments ago; the 10-minute run covers this" });
    }
    return Response.json(await run(url.searchParams.get("dry") === "1"));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("claim-options-sync failed", message);
    await sb.from("claim_options_log").insert({ error: message.slice(0, 500) });
    return Response.json({ error: message }, { status: 500 });
  }
});
