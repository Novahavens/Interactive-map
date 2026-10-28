// End-to-end check of the Quo contact log: POST /api/quo/webhook, /api/quo/setup, /api/quo/backfill,
// GET /api/properties/:id/owner-said and the edit route's `source` (Owner said → Edit), against ONE mock that
// plays Monday (GraphQL at /v2), Supabase (PostgREST RPCs at /rest/v1/rpc/<fn>, with the rules of
// supabase/migrations/20261028_quo_contact_log.sql over in-memory tables and sync_config) and Quo (/v1/* reads
// and the dated /webhooks API). Hermetic: nothing reaches the live Monday board, Quo or the database.
// Deliveries are signed here (Standard Webhooks) with whsec_ keys the mock keeps in sync_config.
//
//   1. node tests/api/quo-webhook.mjs serve                                (mock on 127.0.0.1:3097)
//   2. NEXT_DIST_DIR=.next-quo npx next build; git checkout -- tsconfig.json  (a build rewrites it)
//   3. env SUPABASE_URL=http://127.0.0.1:3097 SUPABASE_KEY=test MONDAY_API_URL=http://127.0.0.1:3097/v2 \
//        MONDAY_API_TOKEN=test QUO_API_BASE=http://127.0.0.1:3097/v1 QUO_API_KEY=test MAP_EDIT_SECRET=test-secret \
//        NEXT_DIST_DIR=.next-quo npx next start -p 3033
//   4. node tests/api/quo-webhook.mjs                                       (BASE=http://localhost:3033 by default)
//
// Run 4 against a freshly started server (step 3): the server keeps the Quo directory and the config in
// per-instance caches. It takes about 50 s: 11 s waiting out the 5 s config cache after two mode flips and
// ~8 s for a Monday note that lands late. Exit code 0 only when every check passes.
// Checks marked [doc] test what a doc comment promises where the code was seen to do something else.
// Result on 28 Oct 2026 (code as of 15:30 UTC that day): 113 PASS, 6 FAIL, the same on two runs. Every FAIL
// is a bug in the routes:
//   - a retry wipes contact_events.date_ids (the dates the first attempt moved);
//   - Supabase errors are logged and stored as "[object Object]" (webhook and backfill);
//   - a Monday note that times out but lands is posted again on the retry;
//   - setup accepts a webhook to this URL that covers only some numbers;
//   - backfill scan fails (Postgres 21000) when one property shows up twice on a page.
import http from "node:http";
import { createHash, createHmac, randomBytes } from "node:crypto";

const PORT = 3097;
const MOCK = `http://127.0.0.1:${PORT}`;
const SECRET = "test-secret"; // the mock's sync_config MAP_EDIT_KEY
const TZ = "America/Chicago";
const BOARD = "18415735059";
const LAST_CONTACT_COL = "date_mm5yh71z";
const RENT_COL = "numeric_mm44b6ew";
const OUR = "+19185559999"; // PNmain
const OUR2 = "+19185559998"; // PNsecond
const DAY_MS = 86_400_000;
const EVENTS4 = ["call.completed", "message.received", "message.delivered", "call.summary.completed"];

const localDay = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
const localWhen = (at) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const whsec = (seed) => `whsec_${createHash("sha256").update(seed).digest("base64")}`;
const pgTs = (iso) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "+00:00"); // how Postgres writes a timestamptz in jsonb
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv[2] === "serve") {
  // ======================================================================================================
  // Mock: Monday + Supabase (PostgREST) + Quo
  // ======================================================================================================
  let seen = [];
  const blank = () => ({
    config: { MAP_EDIT_KEY: SECRET }, // sync_config
    props: {}, // public.properties by monday_item_id
    claimOptions: [], // property ids that are an option on an active claim
    events: {}, notes: {}, summaries: {}, backfill: {}, // contact_events, contact_notes, call_summaries, contact_backfill
    monday: {}, // item id → { column id → text }
    updates: [], // Monday updates that were posted
    editLog: [], // listing_edit_log
    // noteHangMs: the note lands in Monday, but only after the caller has given up; rpcFail: fn → failures left;
    // dateFail: item → refusals left ("Item not found"); datesDown: the next n date mutations fail whole, either
    // as an outage ("http503": a non-JSON 503 page) or as Monday's rate limit ("complexity").
    inject: { noteFail: {}, dateFail: {}, noteDelayMs: {}, noteHangMs: {}, callFail: {}, rpcFail: {}, datesDown: { kind: null, n: 0 } },
    quo: { users: [], phoneNumbers: [], calls: {}, conversations: {}, history: {}, webhooks: [], nextWebhookId: 123 },
  });
  let db = blank();
  const VOID = Symbol("void");

  const keyOk = (s) => typeof s === "string" && s !== "" && s === db.config.MAP_EDIT_KEY; // listing_edit_key_ok
  const today = () => new Date().toISOString().slice(0, 10); // current_date (UTC on Supabase)
  // public.quo_phone_keys: every North American number in a free-text cell, as its 10 digits.
  const phoneKeys = (p) => {
    const out = new Set();
    for (const m of String(p ?? "").matchAll(/(?<![\d+])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]*([2-9]\d{2})[\s.-]*(\d{4})(?!\d)/g)) out.add(m[1] + m[2] + m[3]);
    return [...out];
  };
  const readKeys = () => {
    try {
      const v = JSON.parse(db.config.QUO_WEBHOOK_KEYS ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const FINAL = ["shadow", "done", "unmatched", "ignored", "failed"];

  // Each function follows its SQL in 20261028_quo_contact_log.sql (secret gate first, same answers).
  const RPC = {
    quo_config: (a) => {
      if (!keyOk(a.p_secret)) return null;
      const mode = db.config.QUO_LOG_MODE;
      return {
        mode: mode == null ? "shadow" : String(mode).trim().toLowerCase(), liveUsers: db.config.QUO_LIVE_USERS ?? "", keys: readKeys(),
        webhookId: db.config.QUO_WEBHOOK_ID ?? null,
      };
    },
    quo_set_webhook: (a) => {
      if (!keyOk(a.p_secret)) return false;
      if (!a.p_key || !/^whsec_[A-Za-z0-9+/=]{16,200}$/.test(a.p_key) || !a.p_webhook_id) return false;
      // select p_key union all select x … where x <> p_key limit 2: the LIMIT applies to the whole union.
      db.config.QUO_WEBHOOK_KEYS = JSON.stringify([a.p_key, ...readKeys().filter((k) => k !== a.p_key)].slice(0, 2));
      db.config.QUO_WEBHOOK_ID = a.p_webhook_id;
      return true;
    },
    quo_match: (a) => {
      if (!keyOk(a.p_secret)) return null;
      const numbers = [...new Set((a.p_numbers ?? []).filter((n) => /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(n)))].slice(0, 20);
      const hits = [];
      for (const number of numbers) {
        const k = number.replace(/\D/g, "").slice(-10);
        const ps = Object.values(db.props).filter((p) => [...phoneKeys(p.owner_phone), ...phoneKeys(p.landlord_phone)].includes(k)).slice(0, 200);
        for (const p of ps) {
          hits.push({
            number, id: p.monday_item_id, owner: phoneKeys(p.owner_phone).includes(k), onClaim: db.claimOptions.includes(p.monday_item_id),
            lastContact: p.last_contact ?? null, street: (p.address ?? "").split(",")[0].trim() || null, _u: p.updated_at ?? null,
          });
        }
      }
      const desc = (x, y) => (x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? 1 : -1); // desc nulls last
      hits.sort((x, y) => Number(y.onClaim) - Number(x.onClaim) || desc(x.lastContact, y.lastContact) || desc(x._u, y._u) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      return hits.map(({ _u, ...h }) => h);
    },
    quo_event_begin: (a) => {
      if (!keyOk(a.p_secret)) return "forbidden";
      const e = a.p_event ?? {};
      const id = e.eventId == null ? "" : String(e.eventId);
      // 28 Oct change: no type, or `at` not an ISO timestamp, is 'invalid' (it used to throw a NOT NULL error).
      if (!id || id.length > 100 || !e.resourceId || !e.type || !/^\d{4}-\d{2}-\d{2}T/.test(String(e.at ?? ""))) return "invalid";
      const now = Date.now();
      const row = db.events[id];
      if (!row) {
        db.events[id] = {
          event_id: id, type: String(e.type).slice(0, 60), resource_id: String(e.resourceId).slice(0, 100), at: e.at, direction: e.direction ?? null,
          numbers: (e.numbers ?? []).slice(0, 10), inbox_id: e.inboxId ?? null, user_id: e.userId ?? null, teammate: e.teammate ?? null,
          quo_status: e.status ?? null, answered: e.answered ?? null, duration_sec: e.durationSec ?? null, mode: e.mode ?? null,
          property_ids: [], note_ids: [], date_ids: [], state: "received", attempts: 1, error: null, claimed_at: now, finishes: [],
        };
        return "new";
      }
      if (FINAL.includes(row.state)) return "duplicate";
      if (row.state === "received" && row.claimed_at > now - 20_000) return "busy";
      Object.assign(row, { state: "received", attempts: row.attempts + 1, claimed_at: now, mode: e.mode ?? null });
      return "retry";
    },
    quo_event_finish: (a) => {
      if (!keyOk(a.p_secret)) return false;
      if (![...FINAL, "retry"].includes(a.p_state)) return false;
      const row = db.events[a.p_event_id];
      if (!row) return false;
      // The ids merge with what is stored (distinct, sorted), so a retry keeps what the first attempt did.
      const merge = (stored, given) => [...new Set([...stored, ...(given ?? [])])].sort();
      Object.assign(row, {
        state: a.p_state, property_ids: merge(row.property_ids, a.p_property_ids), note_ids: merge(row.note_ids, a.p_note_ids), date_ids: merge(row.date_ids, a.p_date_ids),
        error: a.p_error == null ? null : String(a.p_error).slice(0, 500), done_at: a.p_state === "retry" ? null : Date.now(),
      });
      row.finishes.push(a.p_state);
      return true;
    },
    quo_note_claim: (a) => {
      if (!keyOk(a.p_secret)) return false;
      const slot = String(a.p_slot).slice(0, 120);
      const k = `${a.p_property_item_id}|${a.p_day}|${slot}`;
      const n = db.notes[k];
      if (!n) {
        db.notes[k] = { property_item_id: a.p_property_item_id, day: a.p_day, slot, event_id: a.p_event_id, update_id: null, claimed_at: Date.now() };
        return true;
      }
      if (n.update_id === null && n.claimed_at < Date.now() - 60_000) {
        Object.assign(n, { event_id: a.p_event_id, claimed_at: Date.now() });
        return true;
      }
      return false;
    },
    quo_note_done: (a) => {
      if (!keyOk(a.p_secret)) return false;
      const k = `${a.p_property_item_id}|${a.p_day}|${a.p_slot}`;
      const n = db.notes[k];
      if (!n || n.event_id !== a.p_event_id) return false;
      if (a.p_update_id == null) {
        if (n.update_id !== null) return false;
        delete db.notes[k]; // released: a retry may post it
        return true;
      }
      n.update_id = String(a.p_update_id).slice(0, 40);
      return true;
    },
    quo_mirror_last_contact: (a) => {
      if (!keyOk(a.p_secret)) return 0;
      if (!a.p_day || a.p_day < "2015-01-01" || a.p_day > addDays(today(), 1)) return 0;
      let n = 0;
      for (const id of a.p_ids ?? []) {
        const p = db.props[id];
        if (p && (!p.last_contact || p.last_contact < a.p_day)) {
          p.last_contact = a.p_day;
          p.updated_at = new Date().toISOString();
          n++;
        }
      }
      return n;
    },
    quo_summary_save: (a) => {
      if (!keyOk(a.p_secret)) return false;
      const r = a.p_row ?? {};
      if (!r.callId || !Array.isArray(r.summary)) return false;
      const prev = db.summaries[r.callId];
      db.summaries[r.callId] = {
        call_id: r.callId, event_id: r.eventId, at: r.at ?? new Date().toISOString(),
        teammate: r.teammate ?? prev?.teammate ?? null, duration_sec: r.durationSec ?? prev?.duration_sec ?? null,
        numbers: (r.numbers ?? []).slice(0, 10), property_ids: (r.propertyIds ?? []).slice(0, 200), property_count: r.propertyCount ?? null,
        summary: r.summary.slice(0, 20), next_steps: (r.nextSteps ?? []).slice(0, 20), facts: Array.isArray(r.facts) ? r.facts : [],
        applied_by: prev?.applied_by ?? null, applied_at: prev?.applied_at ?? null, applied_fields: prev?.applied_fields ?? null,
      };
      return true;
    },
    quo_owner_said: (a) => {
      if (!keyOk(a.p_secret)) return null;
      return Object.values(db.summaries)
        .filter((s) => s.property_ids.includes(a.p_property_item_id) && Date.parse(s.at) > Date.now() - 180 * DAY_MS)
        .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
        .slice(0, 3)
        .map((s) => ({
          callId: s.call_id, at: pgTs(s.at), by: s.teammate, durationSec: s.duration_sec, propertyCount: s.property_count,
          summary: s.summary, nextSteps: s.next_steps, facts: s.facts,
          applied: s.applied_at ? { by: s.applied_by, at: pgTs(s.applied_at), fields: s.applied_fields ?? [] } : null,
        }));
    },
    quo_summary_source: (a) => {
      if (!keyOk(a.p_secret)) return null;
      const s = db.summaries[a.p_call_id];
      return s && s.property_ids.includes(a.p_property_item_id) ? { at: pgTs(s.at), by: s.teammate } : null;
    },
    quo_summary_applied: (a) => {
      if (!keyOk(a.p_secret)) return false;
      const s = db.summaries[a.p_call_id];
      if (!s || !s.property_ids.includes(a.p_property_item_id)) return false;
      Object.assign(s, {
        applied_by: a.p_editor == null ? null : String(a.p_editor).slice(0, 80), applied_at: new Date().toISOString(),
        applied_fields: (a.p_fields ?? []).slice(0, 30).map((x) => String(x).slice(0, 40)),
      });
      return true;
    },
    quo_backfill_upsert: (a) => {
      if (!keyOk(a.p_secret)) return 0;
      if (!Array.isArray(a.p_rows)) return 0;
      // distinct on (id) … order by id, at desc: one row per property, the newest.
      const one = new Map();
      for (const r of a.p_rows.filter((x) => x && x.id && x.day != null)) {
        const id = String(r.id).slice(0, 20);
        if (!one.has(id) || Date.parse(r.at) > Date.parse(one.get(id).at)) one.set(id, r);
      }
      let n = 0;
      for (const r of one.values()) {
        const id = String(r.id).slice(0, 20);
        const b = db.backfill[id];
        const vals = { phone: r.phone, quo_at: r.at, quo_day: r.day, kind: r.kind, teammate: r.teammate ?? null, monday_day: r.mondayDay ?? null, scanned_at: Date.now() };
        if (!b) {
          db.backfill[id] = { property_item_id: id, ...vals, state: "proposed", error: null, applied_at: null };
          n++;
        } else if (b.state === "proposed" && Date.parse(r.at) > Date.parse(b.quo_at)) {
          Object.assign(b, vals);
          n++;
        }
      }
      return n;
    },
    quo_backfill_next: (a) => {
      if (!keyOk(a.p_secret)) return null;
      for (const b of Object.values(db.backfill)) {
        const p = db.props[b.property_item_id];
        if (b.state === "proposed" && p && p.last_contact && p.last_contact >= b.quo_day) b.state = "skipped";
      }
      const limit = Math.max(1, Math.min(a.p_limit ?? 25, 100));
      return Object.values(db.backfill)
        .filter((b) => b.state === "proposed")
        .sort((x, y) => (x.property_item_id < y.property_item_id ? -1 : 1))
        .slice(0, limit)
        .map((b) => ({ id: b.property_item_id, day: b.quo_day }));
    },
    quo_backfill_mark: (a) => {
      if (!keyOk(a.p_secret)) return 0;
      if (!["applied", "failed"].includes(a.p_state)) return 0;
      let n = 0;
      for (const id of a.p_ids ?? []) {
        const b = db.backfill[id];
        if (b && b.state === "proposed") {
          Object.assign(b, { state: a.p_state, error: a.p_error == null ? null : String(a.p_error).slice(0, 500), applied_at: a.p_state === "applied" ? Date.now() : b.applied_at });
          n++;
        }
      }
      if (a.p_state === "applied") {
        for (const id of a.p_ids ?? []) {
          const b = db.backfill[id];
          const p = db.props[id];
          if (b?.state === "applied" && p && (!p.last_contact || p.last_contact < b.quo_day)) p.last_contact = b.quo_day;
        }
      }
      return n;
    },
    // ---- the listing-edit RPCs the edit route uses (same rules as tests/api/edit-route.mjs) ----
    listing_edit_guard: (a) => {
      if (a.p_secret !== SECRET) return "forbidden";
      if (!db.props[a.p_property_item_id]) return "not_found";
      db.editLog.push({ id: db.editLog.length + 1, property_item_id: a.p_property_item_id, editor: a.p_editor, fields: a.p_fields, changes: a.p_changes, before: null, status: "pending", finishes: [] });
      return `ok:${db.editLog.length}`;
    },
    listing_edit_finish: (a) => {
      const entry = db.editLog.find((l) => l.id === a.p_log_id);
      if (a.p_secret === SECRET && entry && ((entry.status === "pending" && a.p_status !== "pending") || (entry.status === "monday_ok" && a.p_status === "applied"))) {
        entry.status = a.p_status;
        entry.finishes.push(a.p_status);
        if (a.p_before != null) entry.before = a.p_before;
        if (a.p_status === "monday_ok") entry.confirmed = (a.p_confirmed ?? []).filter((k) => k in entry.changes);
      }
      return VOID;
    },
    listing_edit_mirror: (a) => {
      const entry = db.editLog.find((l) => l.id === a.p_log_id);
      const row = db.props[a.p_property_item_id];
      if (a.p_secret !== SECRET || !entry || entry.property_item_id !== a.p_property_item_id || entry.status !== "monday_ok" || !row) return false;
      const patch = Object.fromEntries(Object.entries(entry.changes).filter(([k]) => (entry.confirmed ?? []).includes(k)));
      if (!Object.keys(patch).length) return false;
      Object.assign(row, patch);
      entry.status = "applied";
      return true;
    },
    listing_edit_owed_note: () => null,
    property_detail: (a) => (db.props[a.p_monday_item_id] ? [{ ...db.props[a.p_monday_item_id], geom: "0101", fields: { raw: true } }] : []),
    property_map_status: (a) => (db.props[a.p_monday_item_id] ? [{ status: "green", reason: "used_before" }] : []),
    property_claim_options: () => [],
  };

  const mondayText = (v) => (v == null ? "" : typeof v === "string" ? v : v.date !== undefined ? v.date : Array.isArray(v.labels) ? v.labels.join(", ") : v.text !== undefined ? v.text : JSON.stringify(v));

  http
    .createServer(async (req, res) => {
      const url = new URL(req.url, MOCK);
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      const send = (code, payload) => {
        if (code === 204) {
          res.writeHead(204);
          return res.end();
        }
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      // ---- test control ----
      if (url.pathname === "/__seen") return send(200, { seen, db });
      if (url.pathname === "/__reset") {
        seen = [];
        db = blank();
        const f = body ?? {};
        Object.assign(db.config, f.config ?? {});
        for (const p of f.props ?? []) {
          db.props[p.monday_item_id] = { ...p };
          db.monday[p.monday_item_id] = { [RENT_COL]: p.monthly_rate == null ? "" : String(p.monthly_rate), [LAST_CONTACT_COL]: p.last_contact ?? "" };
        }
        db.claimOptions = f.claimOptions ?? [];
        Object.assign(db.quo, f.quo ?? {});
        return send(200, { ok: true });
      }
      if (url.pathname === "/__patch") {
        const f = body ?? {};
        for (const [k, v] of Object.entries(f.config ?? {})) {
          if (v === null) delete db.config[k];
          else db.config[k] = v;
        }
        for (const [k, v] of Object.entries(f.inject ?? {})) Object.assign(db.inject[k], v);
        for (const [id, v] of Object.entries(f.props ?? {})) Object.assign(db.props[id], v);
        Object.assign(db.quo, f.quo ?? {});
        return send(200, { ok: true });
      }

      // ---- Monday GraphQL ----
      if (url.pathname === "/v2") {
        const q = body?.query ?? "";
        const v = body?.variables ?? {};
        const kind = /create_update/.test(q) ? "update" : /\bd0\s*:\s*change_multiple_column_values/.test(q) ? "dates" : /change_multiple_column_values/.test(q) ? "change" : /items\s*\(/.test(q) ? "read" : "other";
        const rec = { api: "monday", kind, mutation: /^\s*mutation\b/.test(q), variables: v, auth: req.headers.authorization ?? null, at: Date.now() };
        seen.push(rec);
        if (req.headers.authorization !== "test") return send(401, { error_message: "bad token" });
        if (kind === "dates") {
          rec.items = [];
          for (let i = 0; `i${i}` in v; i++) rec.items.push({ id: String(v[`i${i}`]), values: JSON.parse(v[`v${i}`]) });
          const down = db.inject.datesDown;
          if (down.n > 0) {
            down.n--;
            rec.failed = down.kind;
            if (down.kind === "http503") {
              res.writeHead(503, { "content-type": "text/html" });
              return res.end("<html><body>Service Unavailable</body></html>");
            }
            // Monday's rate limit: HTTP 200 with a ComplexityException.
            return send(200, { errors: [{ message: "Complexity budget exhausted, query cost 30001 budget remaining 29999 out of 1000000 reset in 13 seconds", extensions: { code: "ComplexityException" } }] });
          }
          const data = {};
          const errors = [];
          rec.items.forEach((it, i) => {
            if (db.inject.dateFail[it.id] > 0) {
              db.inject.dateFail[it.id]--;
              data[`d${i}`] = null;
              errors.push({ message: "Item not found", path: [`d${i}`], extensions: { code: "InvalidItemIdException" } });
              return;
            }
            db.monday[it.id] ??= {};
            for (const [col, val] of Object.entries(it.values)) db.monday[it.id][col] = mondayText(val);
            data[`d${i}`] = { id: it.id };
          });
          return send(200, errors.length ? { data, errors } : { data });
        }
        if (kind === "update") {
          const item = String(v.item);
          if (db.inject.noteDelayMs[item]) await sleep(db.inject.noteDelayMs[item]);
          if (db.inject.noteHangMs[item]) {
            const ms = db.inject.noteHangMs[item];
            db.inject.noteHangMs[item] = 0;
            await sleep(ms);
            rec.landedLate = true;
          }
          if (db.inject.noteFail[item] > 0) {
            db.inject.noteFail[item]--;
            rec.failed = true;
            return send(200, { errors: [{ message: "boom (note)" }] });
          }
          const id = `upd_${db.updates.length + 1}`;
          db.updates.push({ id, item, body: v.body, at: Date.now() });
          return send(200, { data: { create_update: { id } } });
        }
        if (kind === "change") {
          const id = String(v.item);
          for (const [col, val] of Object.entries(JSON.parse(v.values))) (db.monday[id] ??= {})[col] = mondayText(val);
          return send(200, { data: { change_multiple_column_values: { id } } });
        }
        if (kind === "read") {
          const id = String(v.ids?.[0]);
          const item = db.monday[id];
          if (!item) return send(200, { data: { items: [] } });
          return send(200, { data: { items: [{ id, column_values: (v.cols ?? []).map((c) => ({ id: c, text: item[c] ?? null })) }] } });
        }
        return send(200, { errors: [{ message: "not mocked" }] });
      }

      // ---- Supabase PostgREST RPC ----
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
      if (m) {
        const fn = m[1];
        const a = body ?? {};
        seen.push({ api: "supabase", fn, args: a, key: req.headers.apikey ?? null, at: Date.now() });
        const impl = RPC[fn];
        if (!impl) return send(404, { code: "PGRST202", message: `Could not find the function public.${fn}`, details: null, hint: null });
        if (db.inject.rpcFail[fn] > 0) {
          db.inject.rpcFail[fn]--;
          return send(500, { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null });
        }
        try {
          const out = await impl(a);
          return out === VOID ? send(204) : send(200, out);
        } catch (e) {
          return send(500, { code: "XX000", message: String(e?.message ?? e), details: null, hint: null });
        }
      }

      // ---- Quo: classic /v1 reads and the dated /webhooks API ----
      if (url.pathname.startsWith("/v1/") || url.pathname === "/webhooks" || url.pathname.startsWith("/webhooks/")) {
        const rec = { api: "quo", method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), version: req.headers["quo-api-version"] ?? null, auth: req.headers.authorization ?? null, body, at: Date.now() };
        seen.push(rec);
        if (rec.auth !== "test") return send(401, { message: "Unauthorized" });
        const p = url.pathname;
        if (p === "/webhooks" || p.startsWith("/webhooks/")) {
          if (rec.version !== "2026-03-30") return send(400, { message: "Quo-Api-Version is required" });
          const newKey = () => `whsec_${randomBytes(24).toString("base64")}`;
          if (p === "/webhooks" && req.method === "GET") return send(200, { data: db.quo.webhooks.map(({ key, ...w }) => w) });
          if (p === "/webhooks" && req.method === "POST") {
            const now = new Date().toISOString();
            const w = {
              id: String(db.quo.nextWebhookId++), orgId: "OR1", label: body?.label ?? null, status: body?.status ?? "enabled", url: body?.url,
              createdAt: now, updatedAt: now, apiVersion: "2026-03-30", events: body?.events ?? [], resourceIds: body?.resourceIds ?? ["*"], key: newKey(),
            };
            db.quo.webhooks.push(w);
            return send(201, { data: w });
          }
          const rot = p.match(/^\/webhooks\/([^/]+)\/rotate$/);
          if (rot && req.method === "POST") {
            const w = db.quo.webhooks.find((x) => x.id === decodeURIComponent(rot[1]));
            if (!w) return send(404, { message: "Not found" });
            w.key = newKey();
            return send(200, { data: { key: w.key } });
          }
          return send(404, { message: "not mocked" });
        }
        if (p === "/v1/users") return send(200, { data: db.quo.users, nextPageToken: null });
        if (p === "/v1/phone-numbers") return send(200, { data: db.quo.phoneNumbers });
        const one = p.match(/^\/v1\/calls\/([^/]+)$/);
        if (one) {
          const id = decodeURIComponent(one[1]);
          if (db.inject.callFail[id]) return send(db.inject.callFail[id], { message: "boom" });
          const c = db.quo.calls[id];
          return c ? send(200, { data: c }) : send(404, { message: "Not found" });
        }
        if (p === "/v1/conversations") {
          return send(200, db.quo.conversations[url.searchParams.get("pageToken") ?? ""] ?? { data: [], nextPageToken: null });
        }
        if (p === "/v1/calls" || p === "/v1/messages") {
          const pn = url.searchParams.get("phoneNumberId");
          const who = url.searchParams.get("participants");
          if (!pn || !who) return send(400, { message: "phoneNumberId and participants are required" });
          const h = db.quo.history[`${pn}|${who}`] ?? {};
          return send(200, { data: (p === "/v1/calls" ? h.calls : h.messages) ?? [], nextPageToken: null });
        }
        return send(404, { message: "not mocked" });
      }
      send(404, { message: "not mocked" });
    })
    .listen(PORT, "127.0.0.1", () => console.log(`mock Monday + Supabase + Quo on ${MOCK}`));
} else {
  // ======================================================================================================
  // Runner
  // ======================================================================================================
  const BASE = process.env.BASE ?? "http://localhost:3033";
  const failures = [];
  let passes = 0;
  const check = (name, ok, extra = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "\n      → " + String(extra).slice(0, 600) : ""}`);
    if (ok) passes++;
    else failures.push(name);
  };
  const section = (t) => console.log(`\n# ${t}`);
  const mockPost = async (p, b) => (await fetch(MOCK + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
  const st = async () => (await fetch(`${MOCK}/__seen`)).json();
  const mark = async () => (await st()).seen.length;
  const since = async (n) => (await st()).seen.slice(n);
  const dbNow = async () => (await st()).db;
  const mondayMut = (s) => s.filter((x) => x.api === "monday" && x.mutation);
  const rpcs = (s, fn) => s.filter((x) => x.api === "supabase" && x.fn === fn);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sorted = (a) => [...(a ?? [])].sort();
  const iso = (t) => new Date(t).toISOString();
  const minute = (t) => iso(Math.floor(t / 60_000) * 60_000);
  const J = (x) => JSON.stringify(x);

  // ---- time: the newest 17:14 UTC at least an hour ago (mid-day in Tulsa, so ±10 min stays on that day) ----
  const NOW = Date.now();
  let anchor = Date.parse(`${iso(NOW).slice(0, 10)}T17:14:00Z`);
  if (anchor > NOW - 3_600_000) anchor -= DAY_MS;
  const CALL_AT = iso(anchor);
  const DAY = localDay(CALL_AT);
  const SUM_AT = iso(anchor - DAY_MS); // the call a summary is about, the day before
  const BF_CALL_AT = minute(NOW - 2 * DAY_MS);
  const BF_DAY = localDay(BF_CALL_AT);

  // ---- fixtures ----
  const PH = {
    shared: "+19185550101", text: "+19185550102", attempt: "+19185550103", noteFail: "+19185550104", dateFail: "+19185550105",
    busy: "+19185550106", shadow: "+19185550107", pilot: "+19185550108", summary: "+19185550109", summary2: "+19185550110",
    missed: "+19185550111", summary3: "+19185550112", hang: "+19185550113", matchFail: "+19185550114", unmatched: "+19185550199",
    bf1: "+19185550120", bf2: "+19185550121", bf3: "+19185550122", bf4: "+19185550123", bfNone: "+19185550125",
  };
  const P = {
    shared1: "2001", shared2: "2002", shared3: "2003", shared4: "2004", text: "2005", attempt: "2006", noteFail: "2007", dateFail: "2008",
    busy: "2009", shadow1: "2010", shadow2: "2011", pilot: "2012", harvard: "2013", elm: "2014", oak: "2015", birch: "2016", missed: "2017",
    cedar: "2018", hang: "2019", matchFail: "2030", bf20: "2020", bf21: "2021", bf22: "2022", bf23: "2023", bf24: "2024", bf25: "2025",
    bf27: "2027", // deleted in Monday: every date write to it is refused
  };
  const prop = (id, o) => ({
    monday_item_id: id, name: (o.address ?? `${id} Test St`).split(",")[0], address: o.address ?? `${id} Test St, Tulsa, OK`,
    owner_phone: o.owner ?? null, landlord_phone: o.landlord ?? null, last_contact: o.last ?? null, updated_at: "2026-10-20T00:00:00Z",
    monthly_rate: 2200, bedrooms: 3, bathrooms: 2, sqft: 1200, pet_status: "No", next_availability: null, security_deposit: 500,
    property_link: null, notes: null, move_in_total: 2700,
  });
  const KEY1 = whsec("quo-test-key-one");
  const KEY2 = whsec("quo-test-key-two");
  const WRONG = whsec("someone-else");
  const FIXTURES = {
    config: { QUO_WEBHOOK_KEYS: J([KEY1]) }, // QUO_LOG_MODE unset: shadow is the default
    claimOptions: [P.shared1, P.oak],
    props: [
      prop(P.shared1, { owner: "(918) 555-0101", last: addDays(DAY, -2), address: "1 Shared Way, Tulsa, OK" }),
      prop(P.shared2, { owner: "918-555-0101", last: DAY }),
      prop(P.shared3, { owner: "+1 918 555 0101" }),
      prop(P.shared4, { owner: "(918) 555-7000", landlord: "918.555.0101", last: addDays(DAY, -10) }),
      prop(P.text, { owner: PH.text, last: addDays(DAY, -5) }),
      prop(P.attempt, { owner: PH.attempt, last: addDays(DAY, -5) }),
      prop(P.noteFail, { owner: PH.noteFail, last: addDays(DAY, -5) }),
      prop(P.dateFail, { owner: PH.dateFail, last: addDays(DAY, -5) }),
      prop(P.busy, { owner: PH.busy, last: addDays(DAY, -5) }),
      prop(P.shadow1, { owner: PH.shadow, last: addDays(DAY, -3) }),
      prop(P.shadow2, { owner: PH.shadow, last: addDays(DAY, -4) }),
      prop(P.pilot, { owner: PH.pilot, last: addDays(DAY, -5) }),
      prop(P.harvard, { owner: PH.summary, address: "4512 E Harvard Ave, Tulsa, OK 74135" }),
      prop(P.elm, { owner: PH.summary, address: "12 Elm St, Tulsa, OK 74104" }),
      prop(P.oak, { owner: PH.summary, address: "300 Oak Dr, Tulsa, OK 74105" }),
      prop(P.birch, { owner: PH.summary2, address: "77 Birch Ln, Tulsa, OK" }),
      prop(P.missed, { owner: PH.missed, last: addDays(DAY, -5) }),
      prop(P.cedar, { owner: PH.summary3, address: "9 Cedar Ct, Tulsa, OK" }),
      prop(P.hang, { owner: PH.hang, last: addDays(DAY, -5) }),
      prop(P.matchFail, { owner: PH.matchFail, last: addDays(DAY, -5) }),
      prop(P.bf20, { owner: PH.bf1, last: addDays(DAY, -30) }),
      prop(P.bf24, { owner: PH.bf1 }),
      prop(P.bf25, { owner: "(918) 555-7001", landlord: PH.bf1 }),
      prop(P.bf21, { owner: PH.bf1, last: DAY }),
      prop(P.bf22, { owner: PH.bf2, last: DAY }),
      prop(P.bf23, { owner: PH.bf3, last: addDays(DAY, -30) }),
      prop(P.bf27, { owner: PH.bf4, last: addDays(DAY, -30) }),
    ],
    quo: {
      users: [{ id: "USwill", firstName: "Will", email: "will@example.com" }, { id: "USlou", firstName: "Lou", email: "lou@example.com" }, { id: "USgaby", firstName: "Gaby", email: "gaby@example.com" }],
      phoneNumbers: [{ id: "PNmain", number: OUR }, { id: "PNsecond", number: OUR2 }],
      calls: {
        ACsum1abc: { id: "ACsum1abc", participants: [OUR, PH.summary], createdAt: SUM_AT, duration: 240, direction: "incoming", status: "completed", userId: "USwill", answeredBy: "USwill" },
        ACsum2abc: { id: "ACsum2abc", participants: [OUR, PH.summary2], createdAt: SUM_AT, duration: 95, direction: "outgoing", status: "completed", userId: "USwill", answeredBy: null },
        ACsum3abc: { id: "ACsum3abc", participants: [OUR, PH.summary3], createdAt: SUM_AT, duration: 60, direction: "outgoing", status: "completed", userId: "USwill", answeredBy: null },
      },
      conversations: {
        "": {
          data: [
            { id: "CN1", phoneNumberId: "PNmain", participants: [PH.bf1], lastActivityAt: iso(NOW - DAY_MS) },
            { id: "CN2", phoneNumberId: "PNmain", participants: [PH.bf2], lastActivityAt: iso(NOW - 5 * DAY_MS) }, // older than the map's date
            { id: "CN3", phoneNumberId: "PNmain", participants: ["+447700900123"], lastActivityAt: iso(NOW - DAY_MS) }, // not North American
            { id: "CN4", phoneNumberId: "PNmain", participants: [PH.bfNone], lastActivityAt: iso(NOW - DAY_MS) }, // on no property
            { id: "CN7", phoneNumberId: "PNmain", participants: [PH.bf4], lastActivityAt: iso(NOW - DAY_MS) },
          ],
          nextPageToken: "page2",
        },
        page2: {
          data: [
            { id: "CN5", phoneNumberId: "PNmain", participants: [PH.bf3], lastActivityAt: iso(NOW - DAY_MS) },
            { id: "CN6", phoneNumberId: "PNsecond", participants: [PH.bf3], lastActivityAt: iso(NOW - DAY_MS) }, // same number, other inbox
          ],
          nextPageToken: null,
        },
      },
      history: {
        [`PNmain|${PH.bf1}`]: {
          calls: [
            { createdAt: iso(NOW - DAY_MS), direction: "outgoing", status: "no-answer", duration: 0, answeredAt: null, answeredBy: null, userId: "USwill" },
            { createdAt: BF_CALL_AT, direction: "outgoing", status: "completed", duration: 300, answeredAt: iso(Date.parse(BF_CALL_AT) + 5000), answeredBy: null, userId: "USwill" },
          ],
          messages: [{ createdAt: iso(NOW - 3 * DAY_MS), direction: "incoming", text: "hi", media: [], userId: null }],
        },
        [`PNmain|${PH.bf4}`]: { calls: [{ createdAt: BF_CALL_AT, direction: "outgoing", status: "completed", duration: 90, answeredAt: BF_CALL_AT, answeredBy: null, userId: "USwill" }], messages: [] },
        [`PNmain|${PH.bf3}`]: { calls: [{ createdAt: iso(NOW - 3 * DAY_MS), direction: "incoming", status: "completed", duration: 60, answeredAt: iso(NOW - 3 * DAY_MS), answeredBy: "USwill", userId: "USwill" }], messages: [] },
        [`PNsecond|${PH.bf3}`]: { calls: [{ createdAt: BF_CALL_AT, direction: "outgoing", status: "completed", duration: 60, answeredAt: BF_CALL_AT, answeredBy: null, userId: "USlou" }], messages: [] },
      },
    },
  };

  // ---- deliveries, signed the Standard Webhooks way ----
  const hmac = (key, s) => createHmac("sha256", Buffer.from(key.slice(6), "base64")).update(s).digest("base64");
  const currentKey = async () => JSON.parse((await dbNow()).config.QUO_WEBHOOK_KEYS ?? "[]")[0];
  const deliver = async (event, o = {}) => {
    const raw = o.raw ?? J(event);
    const id = o.webhookId ?? `msg_${event?.id ?? "x"}`; // stable across retries of one delivery
    const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
    const key = o.key ?? (await currentKey());
    const good = `v1,${hmac(key, `${id}.${ts}.${o.signedRaw ?? raw}`)}`;
    const headers = { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": o.sig ?? (o.prependSig ? `${o.prependSig} ${good}` : good) };
    for (const h of o.omit ?? []) delete headers[h];
    const r = await fetch(`${BASE}/api/quo/webhook`, { method: "POST", headers, body: raw });
    return { status: r.status, body: await r.json().catch(() => null), retryAfter: r.headers.get("retry-after") };
  };
  const callCtx = (external, { userId = "USwill", resolution = "available" } = {}) => ({
    orgId: "OR1", phoneNumberId: "PNmain", conversationId: "CN1", phoneNumberType: "shared", userId,
    contacts: { ids: [], lookupStatus: "none" }, participants: { workspace: [OUR], external, resolution },
  });
  const call = (id, { callId = `AC${id}`, other, direction = "outgoing", status = "answered", duration = 185, at = CALL_AT, userId = "USwill", hasVoicemail = false, resolution } = {}) => {
    const end = iso(Date.parse(at) + (duration ?? 20) * 1000 + 5000);
    return {
      id, apiVersion: "2026-03-30", createdAt: end, type: "call.completed",
      data: {
        resource: { id: callId, direction, status, createdAt: at, answeredAt: status === "answered" ? iso(Date.parse(at) + 5000) : null, completedAt: end, updatedAt: end, duration, hasVoicemail },
        context: callCtx(other ? [other] : [], { userId, resolution }), links: { quo: null },
      },
    };
  };
  const text = (id, { other, type = "message.delivered", at = CALL_AT, userId = "USwill" }) => {
    const incoming = type === "message.received";
    return {
      id, apiVersion: "2026-03-30", createdAt: at, type,
      data: {
        resource: { id: `AM${id}`, direction: incoming ? "incoming" : "outgoing", text: "Is the house still available?", media: [], status: incoming ? "received" : "delivered", createdAt: at },
        context: { orgId: "OR1", phoneNumberId: "PNmain", conversationId: "CN1", userId, contacts: { ids: [], lookupStatus: "none" }, senderIdentifier: incoming ? other : OUR, recipientIdentifiers: incoming ? [OUR] : [other] },
        links: { quo: null },
      },
    };
  };
  const summary = (id, { callId, other, resolution = "available", lines, next = [], answeredBy = "USwill" }) => ({
    id, apiVersion: "2026-03-30", createdAt: iso(Date.now() - 600_000), type: "call.summary.completed",
    data: {
      resource: { callId, processingStatus: "completed", summary: lines, nextSteps: next, fromPhoneNumber: null, handledByAiAgent: false, answeredByUserId: answeredBy, jobs: [] },
      context: callCtx(other ? [other] : [], { resolution }), links: { quo: null },
    },
  });
  const noteFoot = (at, phone) => `<br>${localWhen(at)} · (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)} · logged from Quo`;
  const updatesOn = async (id) => (await dbNow()).updates.filter((u) => u.item === id);
  const datesIn = (s) => s.filter((x) => x.api === "monday" && x.kind === "dates");

  await mockPost("/__reset", FIXTURES);
  let r, s, e, d, m0;

  // ---------------------------------------------------------------------------------------------------
  section("Signatures");
  m0 = await mark();
  const sigEvent = call("EVsig1", { other: PH.shadow, callId: "ACsig1" });
  r = await deliver(sigEvent, { key: WRONG });
  check("signed with a key we don't hold → 401 'bad signature'", r.status === 401 && r.body?.detail === "bad signature", J(r));
  r = await deliver(sigEvent, { key: KEY1, ts: Math.floor(Date.now() / 1000) - 400 });
  check("right key, timestamp 400 s old (replay) → 401", r.status === 401, J(r));
  r = await deliver(sigEvent, { key: KEY1, ts: Math.floor(Date.now() / 1000) + 400 });
  check("right key, timestamp 400 s in the future → 401", r.status === 401, J(r));
  r = await deliver(sigEvent, { key: KEY1, omit: ["webhook-signature"] });
  check("no webhook-signature header → 401", r.status === 401, J(r));
  r = await deliver(sigEvent, { key: KEY1, omit: ["webhook-id"] });
  check("no webhook-id header → 401", r.status === 401, J(r));
  r = await deliver(sigEvent, { key: KEY1, omit: ["webhook-timestamp"] });
  check("no webhook-timestamp header → 401", r.status === 401, J(r));
  r = await deliver(sigEvent, { key: KEY1, signedRaw: J({ ...sigEvent, id: "EVother" }) });
  check("body changed after signing → 401", r.status === 401, J(r));
  r = await deliver(sigEvent, { key: KEY1, sig: "v2,c2lnbmF0dXJl" });
  check("only a non-v1 signature entry → 401", r.status === 401, J(r));
  s = await since(m0);
  d = await dbNow();
  check("rejected deliveries recorded nothing: no quo_event_begin, no row, no Monday or Quo call", rpcs(s, "quo_event_begin").length === 0 && !d.events.EVsig1 && s.every((x) => x.api === "supabase" && x.fn === "quo_config"), J(s.map((x) => x.fn ?? x.path ?? x.kind)));
  const spanS = (s.at(-1)?.at ?? 0) - (s[0]?.at ?? 0);
  check("…8 bad deliveries cost at most one config read a second (unsigned junk can't drive the database)", rpcs(s, "quo_config").length <= Math.floor(spanS / 1000) + 2, `${rpcs(s, "quo_config").length} reads in ${spanS} ms`);

  // ---------------------------------------------------------------------------------------------------
  section("Shadow (the default: QUO_LOG_MODE unset)");
  m0 = await mark();
  r = await deliver(call("EVshadow1", { other: PH.shadow, callId: "ACshadow1" }), { key: KEY1 });
  s = await since(m0);
  e = (await dbNow()).events.EVshadow1;
  check("shadow: 200 'shadow: would move 2 dates and post 2 notes'", r.status === 200 && r.body?.ok === true && r.body?.detail === "shadow: would move 2 dates and post 2 notes", J(r.body));
  check("…recorded state 'shadow', mode 'shadow', with the planned note and date ids", e?.state === "shadow" && e?.mode === "shadow" && same(sorted(e?.note_ids), [P.shadow1, P.shadow2]) && same(sorted(e?.date_ids), [P.shadow1, P.shadow2]) && same(sorted(e?.property_ids), [P.shadow1, P.shadow2]), J(e));
  check("…zero Monday calls, no note claim, no mirror", s.filter((x) => x.api === "monday").length === 0 && rpcs(s, "quo_note_claim").length === 0 && rpcs(s, "quo_mirror_last_contact").length === 0);
  check("…the row records the call: type, resource, direction, numbers, answered, duration", e?.type === "call.completed" && e?.resource_id === "ACshadow1" && e?.direction === "outgoing" && same(e?.numbers, [PH.shadow]) && e?.answered === true && e?.duration_sec === 185 && e?.at === CALL_AT, J(e));
  check("teammate name comes from Quo /v1/users ('Will' for USwill)", e?.teammate === "Will", J(e));
  check("…the /v1 reads carry the API key", s.filter((x) => x.api === "quo").every((x) => x.auth === "test"));

  r = await deliver(call("EVshadow2", { other: PH.shadow, callId: "ACshadow2" }), { key: KEY1, prependSig: "v1,bm90IGl0" });
  check("a second, wrong v1 entry before the right one is fine (any entry may match)", r.status === 200, J(r));

  // A rotation stored a moment ago: the instance still caches [KEY1].
  await mockPost("/__patch", { config: { QUO_WEBHOOK_KEYS: J([KEY2, KEY1]) } });
  await sleep(1_100); // a re-read on a miss happens at most once a second
  m0 = await mark();
  r = await deliver(call("EVrot1", { other: PH.unmatched, callId: "ACrot1" }), { key: KEY2 });
  s = await since(m0);
  check("a key rotated in the DB seconds ago verifies at once (config re-read on a miss despite the 5 s cache)", r.status === 200 && rpcs(s, "quo_config").length >= 1, J(r));
  r = await deliver(call("EVrot2", { other: PH.unmatched, callId: "ACrot2" }), { key: KEY1 });
  check("…the previous key still verifies after the rotation", r.status === 200, J(r));

  section("Matching");
  e = (await dbNow()).events.EVrot1;
  check("unmatched number: 200 'number not on any property', state 'unmatched'", e?.state === "unmatched" && same(e?.property_ids, []), J(e));

  section("Events the map doesn't use");
  m0 = await mark();
  r = await deliver({ id: "EVcontact1", apiVersion: "2026-03-30", createdAt: iso(Date.now()), type: "contact.updated", data: { resource: { id: "CT1" }, context: { orgId: "OR1" } } });
  check("contact.updated: 200 'event type not used'", r.status === 200 && r.body?.detail === "event type not used", J(r.body));
  r = await deliver(null, { raw: "{not json", webhookId: "msg_notjson" });
  check("signed body that isn't JSON: 200 'not JSON; ignored'", r.status === 200 && r.body?.detail === "not JSON; ignored", J(r.body));
  r = await deliver({ id: "EVbroken1", type: "call.completed", createdAt: iso(Date.now()), data: {} });
  check("call.completed without a resource: 200 'unreadable; ignored'", r.status === 200 && r.body?.detail === "unreadable; ignored", J(r.body));
  r = await deliver({ id: "EVbig1", type: "call.completed", pad: "x".repeat(300_000) });
  check("a body over 256 KB: 413", r.status === 413, J(r.body));
  s = await since(m0);
  check("…none of them recorded", rpcs(s, "quo_event_begin").length === 0);

  // ---------------------------------------------------------------------------------------------------
  section("Mode off");
  await mockPost("/__patch", { config: { QUO_LOG_MODE: " Off" } }); // the SQL trims and lowercases
  await sleep(5_600);
  m0 = await mark();
  r = await deliver(call("EVoff1", { other: PH.shadow, callId: "ACoff1" }));
  s = await since(m0);
  check("mode off: 200 'logging is off'", r.status === 200 && r.body?.detail === "logging is off", J(r.body));
  check("…nothing recorded, nothing written", !(await dbNow()).events.EVoff1 && rpcs(s, "quo_event_begin").length === 0 && s.filter((x) => x.api === "monday").length === 0);

  // ---------------------------------------------------------------------------------------------------
  section("Live (QUO_LOG_MODE=live, pilot QUO_LIVE_USERS=will)");
  await mockPost("/__patch", { config: { QUO_LOG_MODE: "live", QUO_LIVE_USERS: "will" } });
  await sleep(5_600);

  m0 = await mark();
  const L1 = call("EVlive1", { other: PH.shared, callId: "AClive1" });
  r = await deliver(L1);
  s = await since(m0);
  d = await dbNow();
  e = d.events.EVlive1;
  let dates = datesIn(s);
  const sharedOlder = [P.shared1, P.shared3, P.shared4];
  check("answered outgoing call: 200 'moved 3 dates, noted 1 properties'", r.status === 200 && r.body?.detail === "moved 3 dates, noted 1 properties", J(r.body));
  check("…ONE aliased Monday mutation sets Last Contact Date on every property with an older date (owner's and landlord's), not the one already at that day", dates.length === 1 && same(sorted(dates[0].items.map((i) => i.id)), sorted(sharedOlder)) && dates[0].items.every((i) => same(i.values, { [LAST_CONTACT_COL]: { date: DAY } })) && dates[0].variables.board === BOARD, J(dates.map((x) => x.items)));
  const mirror = rpcs(s, "quo_mirror_last_contact");
  check("…the map's mirror RPC called once with those ids and the day", mirror.length === 1 && same(sorted(mirror[0].args.p_ids), sorted(sharedOlder)) && mirror[0].args.p_day === DAY, J(mirror.map((x) => x.args)));
  check("…the mirror moved those dates and left the current one alone", sharedOlder.every((id) => d.props[id].last_contact === DAY) && d.props[P.shared2].last_contact === DAY && sharedOlder.every((id) => d.monday[id][LAST_CONTACT_COL] === DAY));
  let notes = s.filter((x) => x.api === "monday" && x.kind === "update");
  check("…exactly one note, on the active-claim property only", notes.length === 1 && notes[0].variables.item === P.shared1, J(notes.map((x) => x.variables)));
  const L1_NOTE = `📞 <b>Will called the owner</b> · 3 min${noteFoot(CALL_AT, PH.shared)}`;
  check("…note text: who, what, how long, when (Tulsa time), which number, 'logged from Quo'", notes[0]?.variables?.body === L1_NOTE, `${notes[0]?.variables?.body}  ≠  ${L1_NOTE}`);
  const order = s.map((x) => (x.api === "monday" ? x.kind : x.fn)).filter((k) => ["quo_event_begin", "quo_match", "dates", "quo_mirror_last_contact", "quo_note_claim", "update", "quo_note_done", "quo_event_finish"].includes(k));
  check("…order: begin, match, dates, mirror, claim, note, note_done, finish", same(order, ["quo_event_begin", "quo_match", "dates", "quo_mirror_last_contact", "quo_note_claim", "update", "quo_note_done", "quo_event_finish"]), J(order));
  check("…the claim is for (property, day, 'call:<call id>') and records the update id", d.notes[`${P.shared1}|${DAY}|call:AClive1`]?.update_id === d.updates.at(-1)?.id, J(d.notes));
  check("…event row: done, mode live, property/date/note ids", e?.state === "done" && e?.mode === "live" && same(sorted(e?.property_ids), sorted([P.shared1, P.shared2, P.shared3, P.shared4])) && same(sorted(e?.date_ids), sorted(sharedOlder)) && same(e?.note_ids, [P.shared1]), J(e));
  check("…every RPC carried the secret", s.filter((x) => x.api === "supabase").every((x) => x.args.p_secret === SECRET));

  m0 = await mark();
  r = await deliver(L1);
  s = await since(m0);
  check("same delivery again: 200 'already handled'", r.status === 200 && r.body?.detail === "already handled", J(r.body));
  check("…no Monday call, no match, no claim", s.filter((x) => x.api === "monday").length === 0 && rpcs(s, "quo_match").length === 0 && rpcs(s, "quo_note_claim").length === 0, J(s.map((x) => x.fn ?? x.kind)));

  // Texts: one note per property, day and direction.
  m0 = await mark();
  const T1_AT = CALL_AT;
  const r1 = await deliver(text("EVtext1", { other: PH.text, at: T1_AT }));
  const r2 = await deliver(text("EVtext2", { other: PH.text, at: iso(Date.parse(T1_AT) + 10 * 60_000) }));
  s = await since(m0);
  d = await dbNow();
  notes = s.filter((x) => x.api === "monday" && x.kind === "update");
  check("two texts out to the owner the same day: both 200", r1.status === 200 && r2.status === 200, J([r1.body, r2.body]));
  check("…one note between them, with the right wording (never the text itself)", notes.length === 1 && notes[0].variables.item === P.text && notes[0].variables.body === `💬 <b>Will texted the owner</b>${noteFoot(T1_AT, PH.text)}`, J(notes.map((x) => x.variables)));
  check("…the date moved once (the second text finds the property already at that day)", datesIn(s).length === 1 && d.props[P.text].last_contact === DAY && same(d.events.EVtext2?.date_ids, []), J(datesIn(s).map((x) => x.items)));
  check("…both events done; the slot is claimed by the first", d.events.EVtext1?.state === "done" && d.events.EVtext2?.state === "done" && d.notes[`${P.text}|${DAY}|text_out`]?.event_id === "EVtext1", J(d.notes[`${P.text}|${DAY}|text_out`]));
  m0 = await mark();
  r = await deliver(text("EVtext3", { other: PH.text, type: "message.received", at: iso(Date.parse(T1_AT) + 20 * 60_000) }));
  s = await since(m0);
  notes = s.filter((x) => x.api === "monday" && x.kind === "update");
  check("…a reply the same day gets its own note (the other direction)", r.status === 200 && notes.length === 1 && notes[0].variables.body.startsWith("💬 <b>The owner texted</b><br>"), J(notes.map((x) => x.variables)));

  // Unanswered attempt: a note, no date.
  m0 = await mark();
  r = await deliver(call("EVattempt1", { other: PH.attempt, status: "unanswered", duration: null, callId: "ACattempt1" }));
  s = await since(m0);
  notes = s.filter((x) => x.api === "monday" && x.kind === "update");
  check("unanswered outgoing call: 200, a note 'tried to call … no answer'", r.status === 200 && notes.length === 1 && notes[0].variables.item === P.attempt && notes[0].variables.body === `📞 <b>Will tried to call the owner</b> · no answer${noteFoot(CALL_AT, PH.attempt)}`, J(notes.map((x) => x.variables)));
  check("…no date moved, no mirror", datesIn(s).length === 0 && rpcs(s, "quo_mirror_last_contact").length === 0 && (await dbNow()).props[P.attempt].last_contact === addDays(DAY, -5));

  m0 = await mark();
  r = await deliver(call("EVmissed1", { other: PH.missed, direction: "incoming", status: "unanswered", duration: null, hasVoicemail: true, callId: "ACmissed1" }));
  s = await since(m0);
  notes = s.filter((x) => x.api === "monday" && x.kind === "update");
  check("missed incoming call with voicemail: a note '… missed · left a voicemail', no date", r.status === 200 && notes[0]?.variables?.body === `📞 <b>The owner called</b> · missed · left a voicemail${noteFoot(CALL_AT, PH.missed)}` && datesIn(s).length === 0, J(notes.map((x) => x.variables)));

  // Failed call: ignored.
  m0 = await mark();
  r = await deliver(call("EVfailed1", { other: PH.attempt, status: "failed", duration: null, callId: "ACfailed1" }));
  s = await since(m0);
  e = (await dbNow()).events.EVfailed1;
  check("failed call: 200 'call didn't connect', state ignored", r.status === 200 && r.body?.detail === "call didn't connect" && e?.state === "ignored", J([r.body, e]));
  check("…no Monday call, no match", s.filter((x) => x.api === "monday").length === 0 && rpcs(s, "quo_match").length === 0);

  // ---------------------------------------------------------------------------------------------------
  section("Failures and retries");
  await mockPost("/__patch", { inject: { noteFail: { [P.noteFail]: 1 } } });
  const N1 = call("EVnotefail1", { other: PH.noteFail, callId: "ACnotefail1" });
  m0 = await mark();
  r = await deliver(N1);
  s = await since(m0);
  d = await dbNow();
  e = d.events.EVnotefail1;
  check("Monday note failure: 503 with Retry-After", r.status === 503 && r.body?.ok === false && !!r.retryAfter, J(r));
  check("…state 'retry', the error names the note", e?.state === "retry" && /note/.test(e?.error ?? ""), J(e));
  check("…the claim was released (quo_note_done without an update id)", !d.notes[`${P.noteFail}|${DAY}|call:ACnotefail1`] && rpcs(s, "quo_note_done").some((x) => x.args.p_update_id === null));
  check("…the date was still set and mirrored", d.monday[P.noteFail][LAST_CONTACT_COL] === DAY && d.props[P.noteFail].last_contact === DAY);
  m0 = await mark();
  r = await deliver(N1);
  s = await since(m0);
  d = await dbNow();
  e = d.events.EVnotefail1;
  check("redelivery: 200", r.status === 200, J(r.body));
  check("…exactly one note on the property across both deliveries", (await updatesOn(P.noteFail)).length === 1, J(await updatesOn(P.noteFail)));
  check("…event done after 2 attempts", e?.state === "done" && e?.attempts === 2 && same(e?.finishes, ["retry", "done"]), J(e));
  check("[doc] …the row still lists the date the event moved (the retry doesn't wipe date_ids)", same(e?.date_ids, [P.noteFail]), `date_ids=${J(e?.date_ids)}`);

  await mockPost("/__patch", { inject: { dateFail: { [P.dateFail]: 1 } } });
  const D1 = call("EVdatefail1", { other: PH.dateFail, callId: "ACdatefail1" });
  m0 = await mark();
  r = await deliver(D1);
  d = await dbNow();
  check("Monday date failure: 503, state retry, Monday's date unchanged, the map's date unchanged", r.status === 503 && d.events.EVdatefail1?.state === "retry" && /dates/.test(d.events.EVdatefail1?.error ?? "") && d.monday[P.dateFail][LAST_CONTACT_COL] === addDays(DAY, -5) && d.props[P.dateFail].last_contact === addDays(DAY, -5), J([r.body, d.events.EVdatefail1]));
  r = await deliver(D1);
  s = await since(m0);
  d = await dbNow();
  check("…the retry succeeds: 200, date set in Monday and the mirror", r.status === 200 && d.events.EVdatefail1?.state === "done" && d.monday[P.dateFail][LAST_CONTACT_COL] === DAY && d.props[P.dateFail].last_contact === DAY, J([r.body, d.events.EVdatefail1]));
  check("…one note in all (posted by the first attempt, not again)", (await updatesOn(P.dateFail)).length === 1 && datesIn(s).length === 2, J(await updatesOn(P.dateFail)));

  await mockPost("/__patch", { inject: { noteDelayMs: { [P.busy]: 1500 } } });
  const C1 = call("EVbusy1", { other: PH.busy, callId: "ACbusy1" });
  const [ca, cb] = await Promise.all([deliver(C1), deliver(C1)]);
  check("two deliveries of one event at the same moment: one 200, one 503 'another delivery is handling this event'", same([ca.status, cb.status].sort(), [200, 503]) && [ca, cb].find((x) => x.status === 503)?.body?.detail === "another delivery is handling this event", J([ca, cb]));
  check("…one note, not two", (await updatesOn(P.busy)).length === 1, J(await updatesOn(P.busy)));
  r = await deliver(C1);
  check("…Quo's later retry of the busy one: 'already handled'", r.status === 200 && r.body?.detail === "already handled", J(r.body));

  // The database fails while matching: 503, and the row says why.
  await mockPost("/__patch", { inject: { rpcFail: { quo_match: 1 } } });
  const MF = call("EVmatchfail1", { other: PH.matchFail, callId: "ACmatchfail1" });
  r = await deliver(MF);
  e = (await dbNow()).events.EVmatchfail1;
  check("database error while matching: 503 'database unavailable', state retry", r.status === 503 && r.body?.detail === "database unavailable" && e?.state === "retry", J([r.body, e]));
  check("…the row's error keeps the database's message (not '[object Object]')", /statement timeout/.test(e?.error ?? ""), `error=${J(e?.error)}`);
  r = await deliver(MF);
  check("…the redelivery goes through: date and one note", r.status === 200 && (await updatesOn(P.matchFail)).length === 1 && (await dbNow()).props[P.matchFail].last_contact === DAY, J(r.body));

  // Monday is slow: the note lands after the route has given up on it (5 s). The claim is kept (update id
  // "unknown"), so nothing posts it again: one missing note is better than two.
  await mockPost("/__patch", { inject: { noteHangMs: { [P.hang]: 6_500 } } });
  const H1 = call("EVhang1", { other: PH.hang, callId: "AChang1" });
  const t0 = Date.now();
  r = await deliver(H1);
  const took = Date.now() - t0;
  d = await dbNow();
  check("a note that times out: 200 within Quo's ~10 s wait, event done, the date moved", r.status === 200 && took < 9_500 && d.events.EVhang1?.state === "done" && d.props[P.hang].last_contact === DAY, `${took} ms ${J([r.body, d.events.EVhang1?.state])}`);
  check("…the claim is kept with update id 'unknown' (not released for a second post)", d.notes[`${P.hang}|${DAY}|call:AChang1`]?.update_id === "unknown", J(d.notes[`${P.hang}|${DAY}|call:AChang1`]));
  await sleep(Math.max(0, 6_500 - took) + 800); // the late note is now in Monday
  r = await deliver(H1);
  check("…Quo delivering it again: 'already handled', and the note that landed late is the only one", r.status === 200 && r.body?.detail === "already handled" && (await updatesOn(P.hang)).length === 1, `${J(r.body)} ${(await updatesOn(P.hang)).length} notes`);

  // ---------------------------------------------------------------------------------------------------
  section("Pilot");
  m0 = await mark();
  r = await deliver(call("EVpilot1", { other: PH.pilot, callId: "ACpilot1", userId: "USlou" }));
  s = await since(m0);
  e = (await dbNow()).events.EVpilot1;
  check("pilot: Lou's answered call stays shadow while QUO_LIVE_USERS=will", r.status === 200 && /^shadow:/.test(r.body?.detail ?? "") && e?.state === "shadow" && e?.mode === "shadow" && e?.teammate === "Lou", J([r.body, e]));
  check("…no Monday mutation", mondayMut(s).length === 0);

  // ---------------------------------------------------------------------------------------------------
  section("Summaries (in live mode)");
  m0 = await mark();
  r = await deliver(summary("EVsum1", { callId: "ACsum1abc", other: PH.summary, lines: ["Owner said the house on Elm Street rents for $2,400 a month.", "Pets are allowed."], next: ["Send the lease for Elm Street."] }));
  s = await since(m0);
  d = await dbNow();
  let row = d.summaries.ACsum1abc;
  check("summary: 200 'summary saved on 1 properties'", r.status === 200 && r.body?.detail === "summary saved on 1 properties", J(r.body));
  check("…stored on the property its text names by street (12 Elm St), not the active-claim one", same(row?.property_ids, [P.elm]), J(row?.property_ids));
  check("…propertyCount = every property on the number (3)", row?.property_count === 3, J(row?.property_count));
  const rent = row?.facts?.find((f) => f.key === "monthly_rate");
  check("…facts: the rent sentence gives monthly_rate 2400 with its evidence; pets Yes", rent?.value === 2400 && rent?.evidence === "Owner said the house on Elm Street rents for $2,400 a month." && row?.facts?.some((f) => f.key === "pet_status" && f.value === "Yes"), J(row?.facts));
  check("…the call's own time, length and teammate (from /v1/calls/:id)", Date.parse(row?.at) === Date.parse(SUM_AT) && row?.duration_sec === 240 && row?.teammate === "Will" && s.some((x) => x.api === "quo" && x.path === "/v1/calls/ACsum1abc"), J(row));
  check("…no Monday call at all", s.filter((x) => x.api === "monday").length === 0);
  check("…event row done, mode 'summary'", d.events.EVsum1?.state === "done" && d.events.EVsum1?.mode === "summary" && same(d.events.EVsum1?.property_ids, [P.elm]), J(d.events.EVsum1));

  m0 = await mark();
  r = await deliver(summary("EVsum2", { callId: "ACsum2abc", resolution: "unavailable", lines: ["Owner will call back next week about the Birch Lane house."] }));
  s = await since(m0);
  row = (await dbNow()).summaries.ACsum2abc;
  check("summary with participants 'unavailable': falls back to /v1/calls/:id, stored on that number's property", r.status === 200 && same(row?.property_ids, [P.birch]) && same(row?.numbers, [PH.summary2]) && s.some((x) => x.api === "quo" && x.path === "/v1/calls/ACsum2abc"), J([r.body, row]));

  await mockPost("/__patch", { inject: { callFail: { ACsum3abc: 500 } } });
  const S3 = summary("EVsum3", { callId: "ACsum3abc", resolution: "unavailable", lines: ["Owner said the Cedar Court house is vacant now."] });
  m0 = await mark();
  r = await deliver(S3);
  s = await since(m0);
  e = (await dbNow()).events.EVsum3;
  check("summary with 'unavailable' participants whose call lookup fails (Quo 500): 503 'couldn't look up the call', so Quo retries", r.status === 503 && r.body?.detail === "couldn't look up the call" && !!r.retryAfter, J(r));
  check("…recorded nothing (no quo_event_begin, no row, no summary)", !e && rpcs(s, "quo_event_begin").length === 0 && !(await dbNow()).summaries.ACsum3abc, J(e));
  await mockPost("/__patch", { inject: { callFail: { ACsum3abc: 0 } } });
  r = await deliver(S3);
  row = (await dbNow()).summaries.ACsum3abc;
  check("…once Quo answers, the redelivery stores the summary on the call's property", r.status === 200 && same(row?.property_ids, [P.cedar]) && (await dbNow()).events.EVsum3?.state === "done", J([r.body, row?.property_ids]));
  m0 = await mark();
  r = await deliver(summary("EVsum4", { callId: "ACunknown404", resolution: "unavailable", lines: ["Owner said the yard is fenced."] }));
  s = await since(m0);
  e = (await dbNow()).events.EVsum4;
  check("summary with 'unavailable' participants for a call Quo doesn't know (404): 200 'no outside number', state ignored", r.status === 200 && r.body?.detail === "no outside number" && e?.state === "ignored" && !(await dbNow()).summaries.ACunknown404 && s.some((x) => x.api === "quo" && x.path === "/v1/calls/ACunknown404"), J([r.body, e]));

  // ---------------------------------------------------------------------------------------------------
  section("Owner said");
  let o = await fetch(`${BASE}/api/properties/${P.elm}/owner-said`);
  let ob = await o.json();
  let c = ob.calls?.[0];
  check("owner-said: 200, enabled, the Elm St summary", o.status === 200 && ob.enabled === true && ob.calls?.length === 1 && c?.callId === "ACsum1abc", J(ob));
  check("…with when, who, how long, propertyCount, sentences, next steps, facts, not applied", Date.parse(c?.at) === Date.parse(SUM_AT) && c?.by === "Will" && c?.durationSec === 240 && c?.propertyCount === 3 && same(c?.summary, ["Owner said the house on Elm Street rents for $2,400 a month.", "Pets are allowed."]) && same(c?.nextSteps, ["Send the lease for Elm Street."]) && c?.facts?.some((f) => f.key === "monthly_rate" && f.value === 2400) && c?.applied === null, J(c));
  ob = await (await fetch(`${BASE}/api/properties/${P.harvard}/owner-said`)).json();
  check("…another of the owner's properties shows nothing", ob.enabled === true && same(ob.calls, []), J(ob));
  ob = await (await fetch(`${BASE}/api/properties/${P.birch}/owner-said`)).json();
  check("…the fallback summary shows on its property", ob.calls?.[0]?.callId === "ACsum2abc", J(ob));
  o = await fetch(`${BASE}/api/properties/abc/owner-said`);
  check("…a bad id is 400", o.status === 400);

  section("Edit with source (Owner said → Edit form → Save)");
  m0 = await mark();
  const editReq = (id, b) => fetch(`${BASE}/api/properties/${id}/edit`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: J(b) });
  let er = await editReq(P.elm, { editor: "Gaby", changes: { monthly_rate: 2400 }, base: { monthly_rate: 2200 }, source: { kind: "quo_call", callId: "ACsum1abc" } });
  let eb = await er.json();
  s = await since(m0);
  const enote = s.find((x) => x.api === "monday" && x.kind === "update")?.variables;
  const todayUtc = new Date().toISOString().slice(0, 10);
  check("edit with source: 200, saved and noted", er.status === 200 && eb.ok === true && eb.noted === true && eb.mirrored === true, J(eb).slice(0, 300));
  check("…the Monday note says whose call: '…, from Will's call on <YYYY-MM-DD in Tulsa>:'", enote?.item === P.elm && enote?.body === `✏️ Edited on the map by Gaby on ${todayUtc}, from Will&#39;s call on ${localDay(SUM_AT)}:<br>• Monthly rent: $2,200 → $2,400`, enote?.body);
  const applied = rpcs(s, "quo_summary_applied")[0]?.args;
  check("…quo_summary_source, then quo_summary_applied(call, property, editor, confirmed fields)", rpcs(s, "quo_summary_source").length === 1 && same(applied, { p_secret: SECRET, p_call_id: "ACsum1abc", p_property_item_id: P.elm, p_editor: "Gaby", p_fields: ["monthly_rate"] }), J(applied));
  ob = await (await fetch(`${BASE}/api/properties/${P.elm}/owner-said`)).json();
  check("…the card now says who applied it", ob.calls?.[0]?.applied?.by === "Gaby" && same(ob.calls?.[0]?.applied?.fields, ["monthly_rate"]), J(ob.calls?.[0]?.applied));
  m0 = await mark();
  er = await editReq(P.harvard, { editor: "Gaby", changes: { monthly_rate: 2500 }, base: { monthly_rate: 2200 }, source: { kind: "quo_call", callId: "ACsum1abc" } });
  s = await since(m0);
  const hnote = s.find((x) => x.api === "monday" && x.kind === "update")?.variables?.body ?? "";
  check("…a call that isn't on this property: the edit saves, no 'from' in the note, nothing marked applied", er.status === 200 && hnote.startsWith("✏️ Edited on the map by Gaby on ") && !hnote.includes("call on") && rpcs(s, "quo_summary_applied").length === 0, hnote);

  // ---------------------------------------------------------------------------------------------------
  section("Setup");
  m0 = await mark();
  const setup = (h = {}) => fetch(`${BASE}/api/quo/setup`, { method: "POST", headers: h });
  let su = await setup();
  check("setup without x-map-secret: 403", su.status === 403);
  su = await setup({ "x-map-secret": "wrong-secret" });
  check("setup with the wrong secret: 403", su.status === 403);
  s = await since(m0);
  check("…neither reached Quo or the database", s.length === 0, J(s.map((x) => x.path ?? x.fn)));
  await sleep(1_100); // setup reads the config "fresh", which happens at most once a second
  m0 = await mark();
  su = await setup({ "x-map-secret": SECRET });
  let sb = await su.json();
  s = await since(m0);
  d = await dbNow();
  const created = s.find((x) => x.api === "quo" && x.method === "POST" && x.path === "/webhooks");
  check("setup: 200 action 'created', the mode in force", su.status === 200 && sb.ok === true && sb.action === "created" && sb.webhookId === "123" && sb.keyStored === true && sb.mode === "live" && /\/api\/quo\/webhook$/.test(sb.url ?? ""), J(sb));
  check("…the URL is the request's origin (not on Vercel)", sb.url === `${new URL(BASE).origin}/api/quo/webhook`, sb.url);
  check("…POST /webhooks with the 4 events, resourceIds ['*'], this deployment's URL, enabled", same(sorted(created?.body?.events), sorted(EVENTS4)) && same(created?.body?.resourceIds, ["*"]) && created?.body?.url === sb.url && created?.body?.status === "enabled", J(created?.body));
  check("…dated API: no /v1 in the path, Quo-Api-Version 2026-03-30 and the key on every call", s.filter((x) => x.api === "quo").every((x) => x.version === "2026-03-30" && x.auth === "test" && x.path.startsWith("/webhooks")), J(s.filter((x) => x.api === "quo").map((x) => [x.method, x.path, x.version])));
  const wh = d.quo.webhooks[0];
  check("…the key Quo returned is stored first, the previous one kept; webhook id stored", JSON.parse(d.config.QUO_WEBHOOK_KEYS)[0] === wh?.key && JSON.parse(d.config.QUO_WEBHOOK_KEYS).length === 2 && d.config.QUO_WEBHOOK_ID === "123", d.config.QUO_WEBHOOK_KEYS);
  await sleep(1_100);
  r = await deliver(call("EVsetup1", { other: PH.unmatched, callId: "ACsetup1" }), { key: wh.key });
  check("…a delivery signed with the new key verifies (a second after setup)", r.status === 200, J(r));
  m0 = await mark();
  su = await setup({ "x-map-secret": SECRET });
  sb = await su.json();
  s = await since(m0);
  check("setup again: 'existing' (key stored for this webhook id), nothing created or rotated", sb.action === "existing" && sb.webhookId === "123" && !s.some((x) => x.api === "quo" && x.method === "POST") && rpcs(s, "quo_set_webhook").length === 0, J(sb));

  // Keys stored, but for another webhook (QUO_WEBHOOK_ID differs): rotate this one.
  await mockPost("/__patch", { config: { QUO_WEBHOOK_ID: "999" } });
  await sleep(1_100);
  m0 = await mark();
  su = await setup({ "x-map-secret": SECRET });
  sb = await su.json();
  s = await since(m0);
  d = await dbNow();
  check("setup when the stored keys belong to another webhook: 'rotated', now this webhook's id and key first", sb.action === "rotated" && sb.webhookId === "123" && s.some((x) => x.api === "quo" && x.method === "POST" && x.path === "/webhooks/123/rotate") && d.config.QUO_WEBHOOK_ID === "123" && JSON.parse(d.config.QUO_WEBHOOK_KEYS)[0] === d.quo.webhooks[0].key, J([sb, d.config.QUO_WEBHOOK_ID]));

  await mockPost("/__patch", { config: { QUO_WEBHOOK_KEYS: "[]" } });
  await sleep(1_100);
  m0 = await mark();
  su = await setup({ "x-map-secret": SECRET });
  sb = await su.json();
  s = await since(m0);
  d = await dbNow();
  check("setup with the keys cleared: 'rotated' via POST /webhooks/123/rotate, the new key stored", sb.action === "rotated" && s.some((x) => x.api === "quo" && x.method === "POST" && x.path === "/webhooks/123/rotate") && same(JSON.parse(d.config.QUO_WEBHOOK_KEYS), [d.quo.webhooks[0].key]) && d.quo.webhooks.length === 1, J([sb, d.config.QUO_WEBHOOK_KEYS]));
  await sleep(1_100);
  r = await deliver(call("EVsetup2", { other: PH.unmatched, callId: "ACsetup2" }), { key: d.quo.webhooks[0].key });
  check("…a delivery signed with the rotated key verifies", r.status === 200, J(r));

  // A webhook to this URL that covers only one of the numbers.
  const setupUrl = sb.url;
  await mockPost("/__patch", { config: { QUO_WEBHOOK_KEYS: "[]" }, quo: { webhooks: [{ id: "200", orgId: "OR1", label: "old", status: "enabled", url: setupUrl, createdAt: iso(NOW), updatedAt: iso(NOW), apiVersion: "2026-03-30", events: EVENTS4, resourceIds: ["PNmain"], key: whsec("narrow") }] } });
  await sleep(1_100);
  su = await setup({ "x-map-secret": SECRET });
  sb = await su.json();
  d = await dbNow();
  const kept = d.quo.webhooks.find((w) => w.id === d.config.QUO_WEBHOOK_ID);
  check("setup ensures a webhook 'for every number': one that covers only PNmain is passed over and a ['*'] one created", sb.action === "created" && same(kept?.resourceIds, ["*"]), `action=${sb.action} webhookId=${sb.webhookId} resourceIds=${J(kept?.resourceIds)}`);

  // ---------------------------------------------------------------------------------------------------
  section("Backfill");
  const backfill = (b, h = { "x-map-secret": SECRET }) => fetch(`${BASE}/api/quo/backfill`, { method: "POST", headers: { "content-type": "application/json", ...h }, body: J(b) });
  const states = (d, ids) => ids.map((id) => d.backfill[id]?.state);
  let bf = await backfill({ mode: "scan" }, {});
  check("backfill without x-map-secret: 403", bf.status === 403);
  m0 = await mark();
  bf = await backfill({ mode: "scan" });
  let bb = await bf.json();
  s = await since(m0);
  d = await dbNow();
  check("scan: 200 with counts and the next page token", bf.status === 200 && bb.ok === true && bb.conversations === 5 && bb.matched === 3 && bb.read === 2 && bb.recorded === 4 && bb.next === "page2", J(bb));
  check("…asks Quo for pages of 50 conversations", s.find((x) => x.api === "quo" && x.path === "/v1/conversations")?.query?.maxResults === "50", J(s.find((x) => x.path === "/v1/conversations")?.query));
  const histReads = s.filter((x) => x.api === "quo" && (x.path === "/v1/calls" || x.path === "/v1/messages"));
  check("…history read only where Quo is newer than the map (PNmain with bf1 and bf4)", histReads.length === 4 && histReads.every((x) => x.query.phoneNumberId === "PNmain" && [PH.bf1, PH.bf4].includes(x.query.participants)), J(histReads.map((x) => x.query)));
  const want = [P.bf20, P.bf24, P.bf25, P.bf27];
  check("…proposes rows only for properties whose date is older than Quo's newest answered call or text", same(sorted(Object.keys(d.backfill)), sorted(want)), J(Object.keys(d.backfill)));
  check("…each row: the newest answered call (not the later unanswered one), its day, kind, teammate, Monday's day", want.every((id) => d.backfill[id].state === "proposed" && d.backfill[id].quo_at === BF_CALL_AT && d.backfill[id].quo_day === BF_DAY && d.backfill[id].kind === "call" && d.backfill[id].teammate === "Will" && d.backfill[id].phone === (id === P.bf27 ? PH.bf4 : PH.bf1) && d.backfill[id].monday_day === (d.props[id].last_contact ?? null)), J(want.map((id) => d.backfill[id])));
  check("…scan wrote nothing to Monday", s.filter((x) => x.api === "monday").length === 0);

  await mockPost("/__patch", { props: { [P.bf25]: { last_contact: DAY } } }); // the map caught up meanwhile
  // Monday is down (a 503 page): nothing is written, and nothing may be marked failed.
  await mockPost("/__patch", { inject: { datesDown: { kind: "http503", n: 99 } } });
  bf = await backfill({ mode: "apply" });
  bb = await bf.json();
  d = await dbNow();
  check("apply while Monday is down (503): 502, every row still proposed (none marked failed)", bf.status === 502 && bb.ok === false && /Monday/.test(bb.error ?? "") && same(states(d, [P.bf20, P.bf24, P.bf27]), ["proposed", "proposed", "proposed"]) && d.backfill[P.bf25].state === "skipped", J([bf.status, bb, states(d, want)]));
  await mockPost("/__patch", { inject: { datesDown: { kind: null, n: 0 } } });

  m0 = await mark();
  bf = await backfill({ mode: "apply", limit: 2 });
  bb = await bf.json();
  s = await since(m0);
  d = await dbNow();
  dates = datesIn(s);
  check("apply (limit 2): 200, applied 2, failed 0", bf.status === 200 && bb.ok === true && bb.applied === 2 && bb.failed === 0, J(bb));
  check("…both written in ONE aliased Monday mutation with their days", dates.length === 1 && same(sorted(dates[0].items.map((i) => i.id)), [P.bf20, P.bf24]) && dates[0].items.every((i) => same(i.values, { [LAST_CONTACT_COL]: { date: BF_DAY } })), J(dates.map((x) => x.items)));
  check("…marked applied, and the map's dates moved", [P.bf20, P.bf24].every((id) => d.backfill[id].state === "applied" && d.props[id].last_contact === BF_DAY && d.monday[id][LAST_CONTACT_COL] === BF_DAY));

  // 2027 was deleted in Monday: Monday refuses it every time.
  await mockPost("/__patch", { inject: { dateFail: { [P.bf27]: 99 } } });
  m0 = await mark();
  bf = await backfill({ mode: "apply" });
  bb = await bf.json();
  s = await since(m0);
  d = await dbNow();
  check("apply with a row Monday refuses (deleted item): 200, applied 0, failed 1, the row marked failed with Monday's error", bf.status === 200 && bb.ok === true && bb.applied === 0 && bb.failed === 1 && d.backfill[P.bf27].state === "failed" && /Item not found/.test(d.backfill[P.bf27].error ?? ""), J([bb, d.backfill[P.bf27]]));
  m0 = await mark();
  bf = await backfill({ mode: "apply" });
  bb = await bf.json();
  s = await since(m0);
  check("…apply again: applied 0, done, no Monday call (the failed row isn't retried)", bb.ok === true && bb.applied === 0 && bb.done === true && s.filter((x) => x.api === "monday").length === 0, J(bb));

  bf = await backfill({ mode: "scan", pageToken: "page2" });
  bb = await bf.json();
  d = await dbNow();
  check("scan: one number with conversations in two inboxes (one property) records the newest contact once", bf.status === 200 && bb.recorded === 1 && d.backfill[P.bf23]?.quo_at === BF_CALL_AT && d.backfill[P.bf23]?.teammate === "Lou", `${bf.status} ${J(bb)}`);

  // Monday's rate limit (a ComplexityException, HTTP 200) on every attempt: transient, like an outage.
  await mockPost("/__patch", { inject: { datesDown: { kind: "complexity", n: 99 } } });
  bf = await backfill({ mode: "apply" });
  bb = await bf.json();
  d = await dbNow();
  check("[doc] apply while Monday rate-limits every write (ComplexityException): 502, the row still proposed, not marked failed", bf.status === 502 && d.backfill[P.bf23].state === "proposed", J([bf.status, bb, d.backfill[P.bf23]?.state, d.backfill[P.bf23]?.error]));
  await mockPost("/__patch", { inject: { datesDown: { kind: null, n: 0 } } });

  await mockPost("/__patch", { inject: { rpcFail: { quo_match: 1 } } });
  bf = await backfill({ mode: "scan" });
  bb = await bf.json();
  check("a scan the database fails: 502 that names the database's error and the page to retry", bf.status === 502 && bb.ok === false && /statement timeout/.test(bb.error ?? "") && bb.pageToken === null, J(bb));

  // ---------------------------------------------------------------------------------------------------
  section("Whole run");
  d = await dbNow();
  const all = (await st()).seen;
  check("every quo_* RPC carried the secret", all.filter((x) => x.api === "supabase" && x.fn.startsWith("quo_")).every((x) => x.args.p_secret === SECRET));
  check("no event left mid-way ('received')", Object.values(d.events).every((x) => x.state !== "received"), J(Object.values(d.events).filter((x) => x.state === "received").map((x) => x.event_id)));
  check("every Quo call carried the API key; every webhooks call the version header", all.filter((x) => x.api === "quo").every((x) => x.auth === "test" && (!x.path.startsWith("/webhooks") || x.version === "2026-03-30")));
  check("no note claim left without its update id", Object.values(d.notes).every((n) => n.update_id), J(Object.values(d.notes).filter((n) => !n.update_id)));

  console.log(`\n${passes} PASS, ${failures.length} FAIL${failures.length ? `\nFAILED:\n  - ${failures.join("\n  - ")}` : "\nALL PASSED"}`);
  process.exit(failures.length ? 1 : 0);
}
