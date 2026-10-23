// Keeps public.claim_options current: every active option (a claim sub-item that points at a
// property), so the map can say "already on claim X" before someone adds it to another claim.
//
//   POST x-sync-secret         the 10-minute cron (public.claim_options_kick())
//   POST ?key=<MAP_HOOK_KEY>   a webhook on the claim board (sub-item status / property changes);
//                              only a hint, the board is re-read either way, throttled to one run per 20 s
//
// Monday cost per run: one boards query for all nine groups (sub-items nested), plus one
// next_items_page per group that holds more than 100 claims. Normally 1-2 calls; the count is returned.
// Replace semantics: upsert everything read, then delete rows this run did not touch. A run that
// looks like a partial read (0 claims, under half of the last good run, or an active group missing
// from the response) fails and the old rows stay. Each run logs a row at its start, so webhook runs
// can see one that is still in flight; log rows older than 30 days are pruned after a good run.
// ?dry=1: read and count, write nothing.
// Secrets: MONDAY_API_TOKEN.
import { authorize } from "../_shared/auth.ts";
import { supabase } from "../_shared/db.ts";
import { monday } from "../_shared/monday.ts";
import {
  ACTIVE_GROUPS, CLAIM_BOARD, SUBITEM_PROPERTY_COL, SUBITEM_STATUS_COL, replaceGuard, shouldThrottle, toOptions, type RawClaim,
} from "./rules.ts";

const CHUNK = 200;
const PAGE = 100;
const LOG_KEEP_DAYS = 30;

type Query = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

type Page = { cursor: string | null; items: RawClaim[] };

const ITEM = `id name group { id } subitems { id name column_values(ids: ${JSON.stringify([SUBITEM_STATUS_COL, SUBITEM_PROPERTY_COL])}) { id text ... on BoardRelationValue { linked_item_ids } } }`;

async function readClaims(query: Query): Promise<{ claims: RawClaim[]; groupIds: string[] }> {
  const ids = JSON.stringify(Object.keys(ACTIVE_GROUPS));
  const first = await query<{ boards: { groups: { id: string; items_page: Page }[] }[] }>(
    `query { boards(ids: [${CLAIM_BOARD}]) { groups(ids: ${ids}) { id items_page(limit: ${PAGE}) { cursor items { ${ITEM} } } } } }`,
  );
  const claims: RawClaim[] = [];
  const groups = first.boards?.[0]?.groups ?? [];
  for (const g of groups) {
    claims.push(...g.items_page.items);
    let cursor = g.items_page.cursor;
    while (cursor) {
      const next = await query<{ next_items_page: Page }>(
        `query ($c: String!) { next_items_page(limit: ${PAGE}, cursor: $c) { cursor items { ${ITEM} } } }`,
        { c: cursor },
      );
      claims.push(...next.next_items_page.items);
      cursor = next.next_items_page.cursor;
    }
  }
  return { claims, groupIds: groups.map((g) => g.id) };
}

/** Webhook runs are skipped when a run started moments ago or is still going; cron and dry runs always read. */
async function run(dry: boolean, throttle: boolean) {
  const sb = supabase();
  const log = () => sb.from("claim_options_log");
  if (throttle) {
    const { data: last } = await log().select("started_at, finished_at, error").order("id", { ascending: false }).limit(1).maybeSingle();
    if (shouldThrottle(last as Parameters<typeof shouldThrottle>[0], Date.now())) {
      return { skipped: "ran moments ago or still running; the 10-minute run covers this" };
    }
  }

  let calls = 0;
  const query: Query = (q, v) => { calls++; return monday(q, v); };
  const startedAt = new Date().toISOString();
  let logId: number | null = null;
  if (!dry) {
    const { data, error } = await log().insert({ started_at: startedAt }).select("id").single();
    if (error) throw new Error(`log insert failed: ${error.message}`);
    logId = (data as { id: number }).id;
  }
  const finish = async (fields: Record<string, unknown>) => {
    if (logId === null) return;
    const { error } = await log().update({ finished_at: new Date().toISOString(), ...fields }).eq("id", logId);
    if (error) console.error("claim_options_log update failed", error.message);
  };

  try {
    const { data: lastOk } = await log().select("claims").is("error", null).not("claims", "is", null).order("id", { ascending: false }).limit(1).maybeSingle();
    const { claims, groupIds } = await readClaims(query);
    const guard = replaceGuard(claims.length, (lastOk as { claims: number } | null)?.claims ?? null, groupIds);
    if (!guard.replace) throw new Error(guard.reason);
    const rows = toOptions(claims);
    if (dry) return { dry: true, claims: claims.length, options: rows.length, mondayCalls: calls };

    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await sb.from("claim_options").upsert(
        rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: startedAt })), { onConflict: "subitem_id" },
      );
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }
    // Options that left an active claim or status are the rows this run did not touch.
    const { error: delErr, count } = await sb.from("claim_options").delete({ count: "exact" }).lt("updated_at", startedAt);
    if (delErr) throw new Error(`cleanup failed: ${delErr.message}`);
    await finish({ claims: claims.length, options: rows.length });
    const cutoff = new Date(Date.now() - LOG_KEEP_DAYS * 86_400_000).toISOString();
    const { error: pruneErr } = await log().delete().lt("at", cutoff);
    if (pruneErr) console.error("claim_options_log prune failed", pruneErr.message);
    return { claims: claims.length, options: rows.length, removed: count ?? 0, mondayCalls: calls };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (logId !== null) await finish({ error: message.slice(0, 500) });
    else await log().insert({ error: message.slice(0, 500) });
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("claim-options-sync", { status: 200 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const { mode } = await authorize(req);
    if (mode === "unauthorized") return new Response("unauthorized", { status: 401 });
    if (mode === "cron") return Response.json(await run(dry, false));

    // claim-board webhook
    const body = await req.json().catch(() => null);
    if (typeof body?.challenge === "string") return Response.json({ challenge: body.challenge });
    return Response.json(await run(dry, true));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("claim-options-sync failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
});
