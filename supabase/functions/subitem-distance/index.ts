// Fills "Distance to Loss (mi)" (numeric_mm7np0z7) on every claim option,
// however the option was added: from the map's "+" button or by hand in Monday.
//
// Two ways in:
//   POST ?key=<SUBITEM_HOOK_KEY>   monday webhook on the claim board (create_subitem,
//                                  change_subitem_column_value). Queues the sub-item;
//                                  never calls Monday, so it costs no API quota.
//   POST x-sync-secret             the sweep, started by public.subitem_distance_sweep()
//                                  every 30 s when something in the queue is ready.
//
// The sweep re-reads each queued sub-item and its claim from Monday (events are
// unsigned, so they are only hints), measures with property_distance_miles (the
// same PostGIS figure the map shows) and writes the column. An option whose
// property is still being located waits in the queue at no Monday cost until the
// property has coordinates.
//
// ?dry=1 on the sweep: read and measure, write nothing anywhere.
// Secrets: MONDAY_API_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  COL, SUBITEM_BOARD, columnValue, parseEvent, parseLoss, plan, retryAt,
  type Mode, type Outcome, type SubitemRead,
} from "./distance.ts";

const MONDAY_API = "https://api.monday.com/v2";
const BATCH = 50;
const MONDAY_CHUNK = 20;

type Row = {
  subitem_id: string;
  claim_id: string | null;
  property_id: string | null;
  mode: Mode;
  queued_at: string;
  attempts: number;
};

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

async function monday<T>(query: string, variables: Record<string, unknown> = {}): Promise<{ data: T; errors: { message?: string; path?: unknown[] }[] }> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  if (!json?.data) throw new Error(errors[0]?.message ?? `monday.com returned ${res.status}`);
  return { data: json.data as T, errors };
}

async function readSubitems(ids: string[]): Promise<Map<string, SubitemRead>> {
  const { data } = await monday<{ items: SubitemRead[] }>(
    `query ($ids: [ID!]) { items (ids: $ids, limit: 100) {
      id state board { id } parent_item { id }
      column_values (ids: ${JSON.stringify([COL.property, COL.distance])}) { id text ... on BoardRelationValue { linked_item_ids } }
    } }`,
    { ids },
  );
  return new Map((data.items ?? []).map((i) => [String(i.id), i]));
}

async function readLoss(claimIds: string[]): Promise<Map<string, { lat: number; lng: number } | null>> {
  const out = new Map<string, { lat: number; lng: number } | null>();
  if (!claimIds.length) return out;
  const { data } = await monday<{ items: { id: string; column_values: { id: string; value: string | null }[] }[] }>(
    `query ($ids: [ID!]) { items (ids: $ids, limit: 100) { id column_values (ids: ${JSON.stringify([COL.lossAddress])}) { id value } } }`,
    { ids: claimIds },
  );
  for (const c of data.items ?? []) out.set(String(c.id), parseLoss(c.column_values?.[0]?.value));
  return out;
}

/** Aliased mutations, so one bad sub-item cannot fail the rest of the chunk. */
async function writeDistances(items: { id: string; miles: number }[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < items.length; i += MONDAY_CHUNK) {
    const chunk = items.slice(i, i + MONDAY_CHUNK);
    const varDefs = chunk.map((_, j) => `$v${j}: JSON!`).join(", ");
    const body = chunk
      .map((it, j) => `m${j}: change_multiple_column_values(board_id: ${SUBITEM_BOARD}, item_id: ${it.id}, column_values: $v${j}) { id }`)
      .join("\n");
    const variables: Record<string, string> = {};
    chunk.forEach((it, j) => { variables[`v${j}`] = JSON.stringify({ [COL.distance]: columnValue(it.miles) }); });
    try {
      const { data, errors } = await monday<Record<string, { id?: string } | null>>(`mutation (${varDefs}) { ${body} }`, variables);
      chunk.forEach((it, j) => {
        if (data?.[`m${j}`]?.id) out.set(it.id, null);
        else out.set(it.id, errors.find((e) => e.path?.[0] === `m${j}`)?.message ?? errors[0]?.message ?? "no id returned");
      });
    } catch (e) {
      chunk.forEach((it) => out.set(it.id, e instanceof Error ? e.message : String(e)));
    }
  }
  return out;
}

type Result = { row: Row; outcome: Outcome; claimId: string | null; propertyId: string | null; miles?: number; detail?: string };

async function sweep(dry: boolean) {
  const { data, error } = await sb.from("subitem_distance_due").select("subitem_id, claim_id, property_id, mode, queued_at, attempts").limit(BATCH);
  if (error) throw new Error(`queue read failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { due: 0 };

  const subitems = await readSubitems(rows.map((r) => r.subitem_id));
  const results: Result[] = [];
  const toMeasure: { row: Row; claimId: string; propertyId: string }[] = [];
  for (const row of rows) {
    const p = plan({ subitemId: row.subitem_id, claimId: row.claim_id, mode: row.mode }, subitems.get(row.subitem_id));
    if (p.kind === "skip") results.push({ row, outcome: p.outcome, claimId: p.claimId, propertyId: p.propertyId });
    else toMeasure.push({ row, claimId: p.claimId, propertyId: p.propertyId });
  }

  const loss = await readLoss([...new Set(toMeasure.map((m) => m.claimId))]);
  const toWrite: { id: string; miles: number; r: Result }[] = [];
  for (const m of toMeasure) {
    const at = loss.get(m.claimId);
    if (!at) { results.push({ row: m.row, outcome: "no_loss_location", claimId: m.claimId, propertyId: m.propertyId }); continue; }
    const { data: miles, error: dErr } = await sb.rpc("property_distance_miles", { p_monday_item_id: m.propertyId, p_lat: at.lat, p_lng: at.lng });
    if (dErr) { results.push({ row: m.row, outcome: "error", claimId: m.claimId, propertyId: m.propertyId, detail: dErr.message }); continue; }
    if (typeof miles !== "number") { results.push({ row: m.row, outcome: "no_property_location", claimId: m.claimId, propertyId: m.propertyId }); continue; }
    const r: Result = { row: m.row, outcome: "written", claimId: m.claimId, propertyId: m.propertyId, miles };
    toWrite.push({ id: m.row.subitem_id, miles, r });
    results.push(r);
  }

  if (!dry && toWrite.length) {
    const written = await writeDistances(toWrite);
    for (const w of toWrite) {
      const err = written.get(w.id);
      if (err) { w.r.outcome = "error"; w.r.detail = err; }
    }
  }

  const now = new Date();
  const counts: Record<string, number> = {};
  const upserts = results.map((r) => {
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    // retryAt is null both for finished outcomes and for waits that ran out of time.
    const next = retryAt(r.outcome, new Date(r.row.queued_at), now);
    const waiting = next !== null;
    const gaveUp = !waiting && !["written", "already_set", "not_subitem"].includes(r.outcome);
    return {
      subitem_id: r.row.subitem_id,
      claim_id: r.claimId,
      property_id: r.propertyId,
      mode: r.row.mode,
      state: waiting ? "waiting" : "done",
      outcome: r.outcome,
      distance_miles: r.miles ?? null,
      detail: r.detail ?? (gaveUp ? "gave up" : null),
      attempts: r.row.attempts + 1,
      next_at: (next ?? now).toISOString(),
      updated_at: now.toISOString(),
    };
  });
  if (!dry) {
    const { error: upErr } = await sb.from("subitem_distance").upsert(upserts, { onConflict: "subitem_id" });
    if (upErr) throw new Error(`queue write failed: ${upErr.message}`);
  }
  return { due: rows.length, dry, ...counts, ...(dry && { preview: upserts.map((u) => ({ id: u.subitem_id, outcome: u.outcome, miles: u.distance_miles })) }) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("subitem-distance", { status: 200 });
  const url = new URL(req.url);

  // The sweep (pg_cron -> pg_net).
  const header = req.headers.get("x-sync-secret");
  if (header !== null) {
    const secret = await config("SYNC_SECRET");
    if (!secret || !safeEqual(header, secret)) return new Response("unauthorized", { status: 401 });
    try {
      return Response.json(await sweep(url.searchParams.get("dry") === "1"));
    } catch (e) {
      console.error("subitem-distance sweep failed", e);
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  // The monday webhook. The key in its URL is the only thing that tells it apart from noise.
  const key = await config("SUBITEM_HOOK_KEY");
  if (!key || !safeEqual(url.searchParams.get("key") ?? "", key)) return new Response("unauthorized", { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const challenge = (body as { challenge?: unknown })?.challenge;
  if (typeof challenge === "string") return Response.json({ challenge });

  const q = parseEvent(body);
  if (!q) return Response.json({ ignored: true });
  const { error } = await sb.rpc("subitem_distance_enqueue", { p_subitem: q.subitemId, p_claim: q.claimId, p_mode: q.mode });
  if (error) {
    console.error("enqueue failed", q, error.message);
    return new Response("enqueue failed", { status: 500 }); // monday retries
  }
  return Response.json({ queued: q.subitemId, mode: q.mode });
});
