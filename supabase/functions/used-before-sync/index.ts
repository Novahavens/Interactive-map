// Keeps public.used_before_keys current: the owner emails and phones on claims where we placed a
// tenant. A property whose owner matches one is green on the map ("used before").
//
//   POST x-sync-secret         the 10-minute cron (public.used_before_kick())
//   POST ?key=<MAP_HOOK_KEY>   a webhook on the claim board (item moved to a group); it is only a
//                              hint, the claims are re-read from Monday either way
//
// One Monday read per run (about 330 claims). If Monday returns fewer than MIN_KEYS_TO_REPLACE
// keys the run is treated as a failure and the existing list is left alone.
// ?dry=1: read and count, write nothing.
// Secrets: MONDAY_API_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CLAIM_BOARD, MIN_KEYS_TO_REPLACE, OWNER_EMAIL_COL, OWNER_PHONE_COL, PLACED_GROUPS, tally, type ClaimOwner,
} from "./keys.ts";

const MONDAY_API = "https://api.monday.com/v2";
const THROTTLE_MS = 20_000;
const CHUNK = 100;

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

async function monday<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");
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

type Item = { id: string; column_values: { id: string; text: string | null }[] };
type Page = { cursor: string | null; items: Item[] };

const COLS = JSON.stringify([OWNER_EMAIL_COL, OWNER_PHONE_COL]);

async function readPlacedClaims(): Promise<ClaimOwner[]> {
  const ids = JSON.stringify(Object.keys(PLACED_GROUPS));
  const first = await monday<{ boards: { groups: { id: string; items_page: Page }[] }[] }>(
    `query { boards(ids: [${CLAIM_BOARD}]) { groups(ids: ${ids}) { id items_page(limit: 500) { cursor items { id column_values(ids: ${COLS}) { id text } } } } } }`,
  );
  const claims: ClaimOwner[] = [];
  const take = (items: Item[]) => {
    for (const it of items) {
      const col = (id: string) => it.column_values.find((c) => c.id === id)?.text ?? null;
      claims.push({ email: col(OWNER_EMAIL_COL), phone: col(OWNER_PHONE_COL) });
    }
  };
  for (const g of first.boards?.[0]?.groups ?? []) {
    take(g.items_page.items);
    let cursor = g.items_page.cursor;
    while (cursor) {
      const next = await monday<{ next_items_page: Page }>(
        `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { id column_values(ids: ${COLS}) { id text } } } }`,
        { c: cursor },
      );
      take(next.next_items_page.items);
      cursor = next.next_items_page.cursor;
    }
  }
  return claims;
}

async function run(dry: boolean) {
  const claims = await readPlacedClaims();
  const rows = tally(claims);
  if (rows.length < MIN_KEYS_TO_REPLACE) {
    throw new Error(`only ${rows.length} contact keys from ${claims.length} claims; leaving the list alone`);
  }
  if (dry) return { dry: true, claims: claims.length, keys: rows.length, emails: rows.filter((r) => r.kind === "email").length };

  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from("used_before_keys").upsert(
      rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now })), { onConflict: "key" },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }
  // Remove keys whose claims left the placed groups (rows not touched by this run).
  const { error: delErr, count } = await sb.from("used_before_keys").delete({ count: "exact" }).lt("updated_at", now);
  if (delErr) throw new Error(`cleanup failed: ${delErr.message}`);
  await sb.from("used_before_log").insert({ claims: claims.length, keys: rows.length });
  return { claims: claims.length, keys: rows.length, removed: count ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("used-before-sync", { status: 200 });
  const url = new URL(req.url);
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
    const { data: last } = await sb.from("used_before_log").select("at").order("id", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date((last as { at: string }).at).getTime() < THROTTLE_MS) {
      return Response.json({ skipped: "ran moments ago; the 10-minute run covers this" });
    }
    return Response.json(await run(false));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("used-before-sync failed", message);
    await sb.from("used_before_log").insert({ error: message.slice(0, 500) });
    return Response.json({ error: message }, { status: 500 });
  }
});
