// Runs migrations/001 against an in-memory Postgres (PGlite) with a stub of the
// existing nearsite_claims table. Nothing touches the real database.
// Run: NODE_PATH=<dir with @electric-sql/pglite> node --test tests/db/migration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.PGLITE_DIR + "/");
const { PGlite } = await import(require.resolve("@electric-sql/pglite"));

const sql = readFileSync(new URL("../../migrations/001_agent_approvals_and_outreach_channels.sql", import.meta.url), "utf8")
  + "\n" + readFileSync(new URL("../../migrations/002_harness_state.sql", import.meta.url), "utf8");
const STUB = `create table public.landlord_outreach (id uuid primary key default gen_random_uuid(), channel text not null
    constraint landlord_outreach_channel_check check (channel = 'ff_message'),
  status text not null constraint landlord_outreach_status_check check (status = any (array['queued','sending','sent','replied','address_found','no_answer','failed','cancelled'])));
  insert into public.landlord_outreach (channel, status) values ('ff_message','cancelled');
  create table public.submission_approvals (id bigint primary key, state text);`;

async function fresh() {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(sql);
  return db;
}

test("migration applies cleanly and can run twice, keeping existing rows", async () => {
  const db = await fresh();
  await db.exec(sql);
  const t = await db.query(`select table_name from information_schema.tables where table_schema='public' order by 1`);
  const names = t.rows.map((r) => r.table_name);
  for (const n of ["agent_approvals", "agent_graph", "agent_state", "agent_work", "agent_events", "agent_outbox", "agent_inbox"]) assert.ok(names.includes(n), n);
  for (const n of ["claims", "claim_homes", "all_claims"]) assert.ok(!names.includes(n), n + " should not be created: the map's tables are reused");
  assert.equal((await db.query(`select count(*)::int n from landlord_outreach`)).rows[0].n, 1);
  const cols = await db.query(`select column_name from information_schema.columns where table_name='submission_approvals'`);
  assert.deepEqual(cols.rows.map((r) => r.column_name).sort(), ["id", "state"]);
});

test("outreach takes the agent's channels and STOP; nothing else", async () => {
  const db = await fresh();
  for (const ch of ["ff_message", "sona_text", "sona_call", "in_app"]) await db.query(`insert into landlord_outreach (channel, status) values ($1,'queued')`, [ch]);
  await db.query(`insert into landlord_outreach (channel, status) values ('sona_text','opted_out')`);
  await assert.rejects(db.query(`insert into landlord_outreach (channel, status) values ('email','queued')`));
  await assert.rejects(db.query(`insert into landlord_outreach (channel, status) values ('sona_text','whatever')`));
});

test("approvals: only William and Lou, only approve / hold / reject", async () => {
  const db = await fresh();
  await assert.rejects(db.query(`insert into agent_approvals (batch_id, person, action, slack_user) values ('b','nobody','approve','U1')`));
  await assert.rejects(db.query(`insert into agent_approvals (batch_id, person, action, slack_user) values ('b','lou','submit','U1')`));
  await db.query(`insert into agent_approvals (batch_id, person, action, slack_user) values ('b','lou','approve','U00000000B2')`);
});

test("row level security is on for every new table", async () => {
  const db = await fresh();
  const r = await db.query(`select relname, relrowsecurity from pg_class where relname in ('agent_approvals','agent_graph','agent_state','agent_work','agent_events','agent_outbox','agent_inbox')`);
  assert.equal(r.rows.length, 7);
  assert.ok(r.rows.every((x) => x.relrowsecurity));
});

test("harness tables: work ids are unique, kinds checked, events append-only", async () => {
  const db = await fresh();
  await db.query(`insert into agent_work (id, claim_id, kind, status, item) values ('1:h:send_outreach:0','1','send_outreach','held_switch_off','{}')`);
  await assert.rejects(db.query(`insert into agent_work (id, claim_id, kind, status, item) values ('1:h:send_outreach:0','1','send_outreach','queued','{}')`));
  await assert.rejects(db.query(`insert into agent_work (id, claim_id, kind, status, item) values ('x','1','pay_landlord','queued','{}')`));
  await db.query(`insert into agent_state (claim_id, stage, state, graph_version) values ('90003','ready','{}','v')
                  on conflict (claim_id) do update set stage = excluded.stage`);
  await db.query(`insert into agent_state (claim_id, stage, state, graph_version) values ('90003','submitted','{}','v')
                  on conflict (claim_id) do update set stage = excluded.stage`);
  assert.equal((await db.query(`select stage from agent_state where claim_id='90003'`)).rows[0].stage, "submitted");
  await db.query(`insert into agent_events (claim_id, kind, event) values ('90003','home_moved','{}')`);
  await assert.rejects(db.query(`update agent_events set kind='x'`), /append-only/);
  await assert.rejects(db.query(`delete from agent_events`), /append-only/);
});

test("inbox takes only what people do in the map", async () => {
  const db = await fresh();
  await db.query(`insert into agent_inbox (claim_id, home_key, type, payload) values ('nearsite:90003','123','human_pick','{"decision":"accept"}')`);
  await assert.rejects(db.query(`insert into agent_inbox (claim_id, type) values ('nearsite:90003','submitted')`));
  await assert.rejects(db.query(`insert into agent_inbox (claim_id, type) values ('nearsite:90003','approvals')`));
});
