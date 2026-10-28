// End-to-end check of POST /api/properties/:id/edit against ONE mock that plays both Monday (GraphQL) and
// Supabase (PostgREST RPC). Hermetic: nothing reaches the live Monday board or the live database.
//
//   1. node tests/api/edit-route.mjs serve                                   (mock on 127.0.0.1:3098)
//   2. NEXT_DIST_DIR=.next-api npx next build
//   3. ENV="SUPABASE_URL=http://127.0.0.1:3098 SUPABASE_KEY=test MONDAY_API_URL=http://127.0.0.1:3098/v2 MONDAY_API_TOKEN=test"
//      env $ENV MAP_EDIT_SECRET=test-secret NEXT_DIST_DIR=.next-api npx next start -p 3031 → node tests/api/edit-route.mjs
//      ... MAP_EDIT_SECRET=test-secret MONDAY_DRY_RUN=1  → MODE=dry
//      ... MAP_EDIT_SECRET=test-secret MAP_EDITING=off   → MODE=off
//      ... (no MAP_EDIT_SECRET)                           → MODE=nosecret
//      ... MAP_EDIT_SECRET=wrong-secret                   → MODE=forbidden
//   MODE=get OUT=file.json node tests/api/edit-route.mjs  snapshots GET /api/properties/:id (compare two builds).
import http from "node:http";
import { writeFileSync } from "node:fs";

const PORT = 3098;
const MOCK = `http://127.0.0.1:${PORT}`;

// Monday column ids (lib/listing-edit.ts) used by the fixtures.
const C = {
  next_availability: "date_mm4416ne", bedrooms: "numeric_mm44r6x9", sqft: "numeric_mm4b1e83", pet_status: "dropdown_mm3ywgac",
  monthly_rate: "numeric_mm44b6ew", property_link: "text_mm3ykmnv", notes: "long_text_mm4jpg99",
};

// Every fixture property starts from the same record, in Monday and in the mirror.
const SEED_MONDAY = {
  [C.next_availability]: "", [C.bedrooms]: "3", [C.sqft]: "1200", [C.pet_status]: "No",
  [C.monthly_rate]: "2200", [C.property_link]: "https://example.com/listing/1", [C.notes]: "Old",
};
const SEED_ROW = {
  monday_item_id: "", name: "1 Test St", geom: "0101000020E6100000", fields: { raw: true },
  next_availability: null, bedrooms: 3, bathrooms: 2, sqft: 1200, pet_status: "No", monthly_rate: 2200,
  security_deposit: 500, property_link: "https://example.com/listing/1", notes: "Old", owner_phone: "+15550000000",
  move_in_total: 2700, updated_at: "2026-10-26T00:00:00Z",
};

const OK = ["1001", "1002", "1003", "1004", "1005", "1006", "5021", "5022", "5023", "5024", "5030", "5031", "5032", "5033", "5034", "5035", "5036", "1007", "5037"];
const SECRET = "test-secret"; // the mock's sync_config MAP_EDIT_KEY
const GUARD_SAYS = { "429001": "ip_limit", "429002": "property_limit", "429003": "daily_cap", "400400": "invalid", "409409": "busy" };
const GUARD_ERRORS = "500500";
const MONDAY_READ_FAILS = "5021";
const MONDAY_WRITE_FAILS = "5022";
const NOTE_FAILS = "5023";
const MIRROR_FAILS = "5024";
const STATUS_FAILS = "5030";
const ND = "1005";
const SAME_EDIT = "1006"; // someone already set the rent to 2400 in Monday
const HANG_READ = "5031"; // the first Monday read answers after 12 s (the route gives up at 10 s)
const HANG_WRITE_LANDS = "5032"; // the write lands in Monday, but the answer comes after 12 s
const IGNORES_PETS = "5033"; // Monday answers the write OK but silently keeps the pets column
const REREAD_FAILS = "5034"; // the read-back after the write fails
const HANG_MS = 12_000;
const LATE_429 = "5035"; // the first read answers 429 after 9.3 s: the 1.2 s retry pause would overrun the 10 s timeout
const QUICK_429 = "5036"; // the first read answers 429 at once: the retry goes ahead and works
const LANDS_THEN_WEBHOOK = "5037"; // like HANG_WRITE_LANDS, then the Monday webhook catches the map up
const MAP_BEHIND = "1007"; // Monday already has rent 2400 (changed there directly); the mirror still says 2200 // property_map_status errors: GET answers 502 db_error

if (process.argv[2] === "serve") {
  let seen, monday, rows, log;
  const reset = () => {
    seen = [];
    log = [];
    monday = Object.fromEntries(OK.map((id) => [id, { ...SEED_MONDAY }]));
    rows = Object.fromEntries(OK.map((id) => [id, { ...SEED_ROW, monday_item_id: id }]));
    // 1005 holds a hand-typed pets value that would not validate ("N/D"), in Monday and in the mirror.
    monday[ND][C.pet_status] = "N/D";
    rows[ND].pet_status = "N/D";
    monday[SAME_EDIT][C.monthly_rate] = "2400";
    monday[MAP_BEHIND][C.monthly_rate] = "2400";
    reads = {};
  };
  let reads = {};
  reset();

  const mondayText = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (v.date !== undefined) return v.date;
    if (Array.isArray(v.labels)) return v.labels.join(", ");
    if (v.text !== undefined) return v.text;
    return JSON.stringify(v);
  };

  http
    .createServer(async (req, res) => {
      const url = new URL(req.url, MOCK);
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      const send = (code, payload) => {
        if (code === 204) {
          res.writeHead(204);
          return res.end();
        }
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (url.pathname === "/__seen") return send(200, { seen, log, rows, monday });
      if (url.pathname === "/__webhook") {
        // What the Monday webhook does: the mirror row takes Monday's values.
        const id = url.searchParams.get("id");
        const numeric = new Set(["bedrooms", "sqft", "monthly_rate"]);
        for (const [key, col] of Object.entries(C)) {
          const t = monday[id][col];
          rows[id][key] = t === "" || t == null ? null : numeric.has(key) ? Number(t) : t;
        }
        return send(200, rows[id]);
      }
      if (url.pathname === "/__reset") {
        reset();
        return send(200, { ok: true });
      }

      // ---- Monday GraphQL ----
      if (url.pathname === "/v2") {
        const q = body?.query ?? "";
        const v = body?.variables ?? {};
        const kind = /change_multiple_column_values/.test(q) ? "change" : /create_update/.test(q) ? "update" : /items\s*\(/.test(q) ? "read" : "other";
        seen.push({ api: "monday", kind, mutation: /^\s*mutation\b/.test(q), variables: v, auth: req.headers.authorization ?? null });
        if (req.headers.authorization !== "test") return send(401, { error_message: "bad token" });
        if (kind === "read") {
          const id = String(v.ids?.[0]);
          reads[id] = (reads[id] ?? 0) + 1;
          if (id === MONDAY_READ_FAILS) return send(200, { errors: [{ message: "boom (read)" }] });
          if (id === REREAD_FAILS && reads[id] > 1) return send(200, { errors: [{ message: "boom (read-back)" }] });
          if (id === HANG_READ && reads[id] === 1) await new Promise((r) => setTimeout(r, HANG_MS));
          if (id === LATE_429 && reads[id] === 1) {
            await new Promise((r) => setTimeout(r, 9_300));
            return send(429, {});
          }
          if (id === QUICK_429 && reads[id] === 1) return send(429, {});
          const item = monday[id];
          if (!item) return send(200, { data: { items: [] } });
          return send(200, { data: { items: [{ id, column_values: (v.cols ?? []).map((c) => ({ id: c, text: item[c] ?? null })) }] } });
        }
        if (kind === "change") {
          const id = String(v.item);
          if (id === MONDAY_WRITE_FAILS) return send(200, { errors: [{ message: "boom (write)" }] });
          const values = JSON.parse(v.values);
          for (const [col, val] of Object.entries(values)) if (!(id === IGNORES_PETS && col === C.pet_status)) monday[id][col] = mondayText(val);
          if (id === HANG_WRITE_LANDS || id === LANDS_THEN_WEBHOOK) await new Promise((r) => setTimeout(r, HANG_MS));
          return send(200, { data: { change_multiple_column_values: { id } } });
        }
        if (kind === "update") {
          if (String(v.item) === NOTE_FAILS) return send(200, { errors: [{ message: "boom (note)" }] });
          return send(200, { data: { create_update: { id: "upd_1" } } });
        }
        return send(200, { errors: [{ message: "not mocked" }] });
      }

      // ---- Supabase PostgREST RPC ----
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
      if (m) {
        const fn = m[1];
        const a = body ?? {};
        seen.push({ api: "supabase", fn, args: a, key: req.headers.apikey ?? null });
        const pgError = (message) => send(400, { code: "P0001", message, details: null, hint: null });
        switch (fn) {
          case "listing_edit_guard": {
            const id = a.p_property_item_id;
            if (a.p_secret !== SECRET) return send(200, "forbidden");
            if (id === GUARD_ERRORS) return pgError("guard exploded");
            if (GUARD_SAYS[id]) return send(200, GUARD_SAYS[id]);
            if (!rows[id]) return send(200, "not_found");
            log.push({ id: log.length + 1, property_item_id: id, ip: a.p_ip, editor: a.p_editor, fields: a.p_fields, changes: a.p_changes, before: null, status: "pending" });
            return send(200, `ok:${log.length}`);
          }
          case "listing_edit_finish": {
            // Same rules as the SQL: secret, then only forward moves (pending → any outcome, monday_ok → applied).
            const entry = log.find((l) => l.id === a.p_log_id);
            if (a.p_secret === SECRET && entry && ((entry.status === "pending" && a.p_status !== "pending") || (entry.status === "monday_ok" && a.p_status === "applied"))) {
              entry.status = a.p_status;
              entry.finishes = [...(entry.finishes ?? []), a.p_status];
              if (a.p_before !== undefined && a.p_before !== null) entry.before = a.p_before;
              if (a.p_status === "monday_ok") entry.confirmed = (a.p_confirmed ?? []).filter((k) => k in entry.changes);
            }
            return send(204);
          }
          case "listing_edit_mirror": {
            // Applies the logged row's own changes, only after monday_ok, then marks it applied.
            const id = a.p_property_item_id;
            if (id === MIRROR_FAILS) return pgError("mirror exploded");
            const entry = log.find((l) => l.id === a.p_log_id);
            if (a.p_secret !== SECRET || !entry || entry.property_item_id !== id || entry.status !== "monday_ok" || !rows[id]) return send(200, false);
            const patch = Object.fromEntries(Object.entries(entry.changes).filter(([k]) => (entry.confirmed ?? []).includes(k)));
            if (!Object.keys(patch).length) return send(200, false);
            Object.assign(rows[id], patch);
            entry.status = "applied";
            return send(200, true);
          }
          case "listing_edit_owed_note": {
            // Same rule as the SQL: newest failed row with `before`, same property, same changes, 10 min, not
            // followed by an applied row with the same changes.
            if (a.p_secret !== SECRET) return send(200, null);
            const key = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
            const f = log.filter((l) => l.property_item_id === a.p_property_item_id && l.status === "failed" && l.before && key(l.changes) === key(a.p_changes)).at(-1);
            if (!f || log.some((l) => l.id > f.id && l.property_item_id === f.property_item_id && l.status === "applied" && key(l.changes) === key(a.p_changes))) return send(200, null);
            return send(200, { before: f.before, editor: f.editor });
          }
          case "property_detail":
            return send(200, rows[a.p_monday_item_id] ? [rows[a.p_monday_item_id]] : []);
          case "property_map_status":
            if (a.p_monday_item_id === STATUS_FAILS) return pgError("status exploded");
            return send(200, rows[a.p_monday_item_id] ? [{ status: "green", reason: "used_before" }] : []);
          case "property_claim_options":
            return send(200, rows[a.p_monday_item_id] ? [{ subitemId: "s1", claimId: "c1", claimName: "Claim 1", status: "To Do" }] : []);
          default:
            return pgError(`rpc ${fn} not mocked`);
        }
      }
      send(404, { message: "not mocked" });
    })
    .listen(PORT, "127.0.0.1", () => console.log(`mock Monday + Supabase on ${MOCK}`));
} else {
  const BASE = process.env.BASE ?? "http://localhost:3031";
  const MODE = process.env.MODE ?? "full";
  const failures = [];
  const check = (name, ok, extra = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? "  " + extra : ""}`);
    if (!ok) failures.push(name);
  };
  const state = async () => (await fetch(`${MOCK}/__seen`)).json();
  const since = async (mark) => (await state()).seen.slice(mark);
  const mark = async () => (await state()).seen.length;
  const edit = async (id, body, headers = {}) => {
    const r = await fetch(`${BASE}/api/properties/${id}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const mutations = (s) => s.filter((x) => x.api === "monday" && x.mutation);
  const rpcs = (s, fn) => s.filter((x) => x.api === "supabase" && x.fn === fn);
  const logOf = async (id) => (await state()).log.filter((l) => l.property_item_id === id).at(-1);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  await fetch(`${MOCK}/__reset`);

  const HAPPY = {
    editor: "Will <b>Tester</b>",
    changes: { monthly_rate: "$2,400", next_availability: "2026-11-01", pet_status: "yes", notes: "Line one\nLine two", bedrooms: 3 },
    base: { monthly_rate: 2200, next_availability: null, pet_status: "No", notes: "Old", bedrooms: 3 },
  };

  if (MODE === "get") {
    const out = {};
    for (const id of ["1001", "999999", "abc", STATUS_FAILS]) {
      const r = await fetch(`${BASE}/api/properties/${id}`);
      out[id] = { status: r.status, cache: r.headers.get("cache-control"), body: await r.json().catch(() => null) };
    }
    writeFileSync(process.env.OUT ?? "get.json", JSON.stringify(out, null, 2));
    console.log(`wrote ${process.env.OUT ?? "get.json"}`);
    process.exit(0);
  }

  if (MODE === "off" || MODE === "nosecret") {
    const why = MODE === "off" ? "MAP_EDITING=off" : "no MAP_EDIT_SECRET";
    const m0 = await mark();
    const r = await edit("1001", HAPPY);
    check(`${why}: 403 editing_off`, r.status === 403 && r.body?.code === "editing_off", JSON.stringify(r.body));
    check(`${why}: nothing reached Monday or Supabase`, (await since(m0)).length === 0);
    const h = await fetch(`${BASE}/api/health`).then((x) => x.json());
    check(`${why}: health says editing is off`, h.editing === false);
  } else if (MODE === "forbidden") {
    const m0 = await mark();
    const r = await edit("1001", HAPPY);
    const s = await since(m0);
    check("wrong secret: the guard says forbidden → 503 editing_off", r.status === 503 && r.body?.code === "editing_off", JSON.stringify(r.body));
    check("wrong secret: the route did pass its secret", rpcs(s, "listing_edit_guard")[0]?.args?.p_secret === "wrong-secret");
    check("wrong secret: nothing reached Monday, nothing logged", s.filter((x) => x.api === "monday").length === 0 && (await state()).log.length === 0);
  } else if (MODE === "dry") {
    const m0 = await mark();
    const r = await edit("1001", HAPPY);
    const s = await since(m0);
    check("dry run: 200 with dryRun, not mirrored, not noted, not already saved", r.status === 200 && r.body?.dryRun === true && r.body?.mirrored === false && r.body?.noted === false && same(r.body?.unconfirmed, []) && r.body?.alreadySaved === false, JSON.stringify(r.body).slice(0, 200));
    check("dry run: the detail shows the edit laid over the record", r.body?.detail?.monthly_rate === 2400 && r.body?.detail?.pet_status === "Yes" && r.body?.detail?.next_availability === "2026-11-01");
    check("dry run: move_in_total follows the new rent", r.body?.detail?.move_in_total === 2900, String(r.body?.detail?.move_in_total));
    check("dry run: Monday was read (conflict check still runs)", s.some((x) => x.api === "monday" && x.kind === "read"));
    check("dry run: no mutation reached Monday", mutations(s).length === 0, JSON.stringify(mutations(s)));
    check("dry run: nothing mirrored", rpcs(s, "listing_edit_mirror").length === 0);
    check("dry run: logged as dry_run, never monday_ok", (await logOf("1001"))?.status === "dry_run" && JSON.stringify((await logOf("1001"))?.finishes) === JSON.stringify(["dry_run"]));
    check("dry run: mock record untouched", (await state()).rows["1001"].monthly_rate === 2200 && (await state()).monday["1001"][C.monthly_rate] === "2200");
    const m1 = await mark();
    const rb = await edit(MAP_BEHIND, { editor: "Will", changes: { monthly_rate: 2400 }, base: { monthly_rate: 2400 } });
    const s1 = await since(m1);
    check("dry run, map behind Monday: 200 dryRun alreadySaved, detail overlaid, nothing mirrored or noted", rb.status === 200 && rb.body?.dryRun === true && rb.body?.alreadySaved === true && rb.body?.mirrored === false && rb.body?.detail?.monthly_rate === 2400 && rpcs(s1, "listing_edit_mirror").length === 0 && mutations(s1).length === 0 && (await logOf(MAP_BEHIND))?.status === "dry_run" && (await state()).rows[MAP_BEHIND].monthly_rate === 2200, JSON.stringify(rb.body).slice(0, 200));
    const h = await fetch(`${BASE}/api/health`).then((x) => x.json());
    check("health says dry run and editing on", h.dryRun === true && h.editing === true);
  } else {
    // ---- Happy path ----
    let m0 = await mark();
    let r = await edit("1001", HAPPY);
    let s = await since(m0);
    check("happy path: 200, noted, mirrored, nothing unconfirmed, not already saved, not dry run", r.status === 200 && r.body?.ok === true && r.body?.noted === true && r.body?.mirrored === true && same(r.body?.unconfirmed, []) && r.body?.alreadySaved === false && !r.body?.dryRun, JSON.stringify(r.body).slice(0, 300));
    const guard = rpcs(s, "listing_edit_guard")[0]?.args;
    check(
      "guard got the id, client IP, cleaned editor, fields and normalised changes",
      guard?.p_property_item_id === "1001" && guard?.p_ip === "203.0.113.9" && guard?.p_editor === "Will <b>Tester</b>" &&
        same(guard?.p_fields, ["monthly_rate", "next_availability", "pet_status", "notes", "bedrooms"]) &&
        same(guard?.p_changes, { monthly_rate: 2400, next_availability: "2026-11-01", pet_status: "Yes", notes: "Line one\nLine two", bedrooms: 3 }),
      JSON.stringify(guard),
    );
    const read = s.find((x) => x.api === "monday" && x.kind === "read");
    check("Monday read asked for exactly the changed columns", same(read?.variables?.cols, [C.monthly_rate, C.next_availability, C.pet_status, C.notes, C.bedrooms]) && same(read?.variables?.ids, ["1001"]), JSON.stringify(read?.variables));
    const change = s.filter((x) => x.kind === "change");
    check("exactly one change_multiple_column_values", change.length === 1);
    check(
      "Monday got exactly the right column_values (unchanged bedrooms left out)",
      same(JSON.parse(change[0]?.variables?.values ?? "null"), {
        [C.monthly_rate]: "2400", [C.next_availability]: { date: "2026-11-01" }, [C.pet_status]: { labels: ["Yes"] }, [C.notes]: { text: "Line one\nLine two" },
      }),
      change[0]?.variables?.values,
    );
    check("write went to the property board, item 1001", change[0]?.variables?.board === "18415735059" && change[0]?.variables?.item === "1001");
    check("Authorization header carries the token on every Monday call", s.filter((x) => x.api === "monday").every((x) => x.auth === "test"));
    const mirror = rpcs(s, "listing_edit_mirror")[0]?.args;
    check("mirror called with the secret, property and log id only (no patch)", same(mirror, { p_secret: SECRET, p_property_item_id: "1001", p_log_id: 1 }), JSON.stringify(mirror));
    check("every edit RPC carried the secret", s.filter((x) => x.api === "supabase" && x.fn.startsWith("listing_edit_")).every((x) => x.args.p_secret === SECRET));
    const order = s.map((x) => (x.api === "monday" ? x.kind : x.fn === "listing_edit_finish" ? `finish:${x.args.p_status}` : x.fn))
      .filter((k) => ["read", "change", "listing_edit_mirror", "update"].includes(k) || k.startsWith("finish:"));
    check("order: read, write, read back, monday_ok, mirror, note, applied", same(order, ["read", "change", "read", "finish:monday_ok", "listing_edit_mirror", "update", "finish:applied"]), JSON.stringify(order));
    check("the read-back asked for the same columns", same(s.filter((x) => x.kind === "read")[1]?.variables?.cols, [C.monthly_rate, C.next_availability, C.pet_status, C.notes, C.bedrooms]));
    check("the mirror applied the logged row's values to the record", (await state()).rows["1001"].monthly_rate === 2400 && (await state()).rows["1001"].bedrooms === 3);
    const note = s.find((x) => x.kind === "update")?.variables;
    const today = new Date().toISOString().slice(0, 10);
    const expectedNote =
      `✏️ Edited on the map by Will &lt;b&gt;Tester&lt;/b&gt; on ${today}:<br>` +
      ["• Next availability: blank → Nov 1, 2026", "• Pets allowed: No → Yes", "• Monthly rent: $2,200 → $2,400", "• Terms and notes: &quot;Old&quot; → &quot;Line one Line two&quot;"].join("<br>");
    check("note on item 1001 names the editor (escaped) and lists each change on its own line", note?.item === "1001" && note?.body === expectedNote, note?.body);
    const d = r.body?.detail;
    check("response detail has the new values from the mirror", d?.monthly_rate === 2400 && d?.pet_status === "Yes" && d?.next_availability === "2026-11-01" && d?.notes === "Line one\nLine two");
    check("response detail carries map_status, map_reason, other_claims like GET; no geom/fields", d?.map_status === "green" && d?.map_reason === "used_before" && d?.other_claims?.length === 1 && !("geom" in d) && !("fields" in d));
    const l1 = await logOf("1001");
    check("log: confirmed = every field Monday now shows at the new value (unchanged bedrooms included)", same(l1?.confirmed, ["monthly_rate", "next_availability", "pet_status", "notes", "bedrooms"]), JSON.stringify(l1?.confirmed));
    check("log: monday_ok then applied (by the mirror), before = Monday's values then", l1?.status === "applied" && same(l1?.finishes, ["monday_ok"]) && same(l1?.before, { monthly_rate: 2200, next_availability: null, pet_status: "No", notes: "Old", bedrooms: 3 }), JSON.stringify(l1));

    // ---- Clearing fields ----
    m0 = await mark();
    r = await edit("1002", { editor: "Will", changes: { sqft: "", property_link: null }, base: { sqft: 1200, property_link: "https://example.com/listing/1" } });
    s = await since(m0);
    const clear = JSON.parse(s.find((x) => x.kind === "change")?.variables?.values ?? "null");
    check("clear: 200", r.status === 200 && r.body?.mirrored === true, JSON.stringify(r.body).slice(0, 200));
    check("clear: Monday got null for the number and the text column", same(clear, { [C.sqft]: null, [C.property_link]: null }), JSON.stringify(clear));
    check("clear: the logged changes (what the mirror applies) are nulls", same((await logOf("1002"))?.changes, { sqft: null, property_link: null }) && (await state()).rows["1002"].sqft === null);
    check("clear: detail shows blanks", r.body?.detail?.sqft === null && r.body?.detail?.property_link === null);
    check("clear: note says → blank", /Square feet: 1200 → blank<br>• Listing link: https:\/\/example.com\/listing\/1 → blank$/.test(s.find((x) => x.kind === "update")?.variables?.body ?? ""), s.find((x) => x.kind === "update")?.variables?.body);

    // ---- Conflict ----
    m0 = await mark();
    r = await edit("1003", { editor: "Will", changes: { monthly_rate: 2500, bedrooms: 4 }, base: { monthly_rate: 2000, bedrooms: 3 } });
    s = await since(m0);
    check("conflict: 409 with the fields and Monday's current values for them only", r.status === 409 && r.body?.code === "conflict" && r.body?.error === "Someone changed this in Monday since you opened it" && same(r.body?.fields, ["monthly_rate"]) && same(r.body?.current, { monthly_rate: 2200 }), JSON.stringify(r.body));
    check("conflict: no mutation, no mirror", mutations(s).length === 0 && rpcs(s, "listing_edit_mirror").length === 0);
    check("conflict: logged as conflict", (await logOf("1003"))?.status === "conflict");

    // ---- No-op ----
    m0 = await mark();
    r = await edit("1004", { editor: "Will", changes: { monthly_rate: "2200", pet_status: "No" }, base: { monthly_rate: 2200, pet_status: "No" } });
    s = await since(m0);
    check("no-op: 200, alreadySaved, noted false, mirrored true, unchanged detail", r.status === 200 && r.body?.alreadySaved === true && r.body?.noted === false && r.body?.mirrored === true && r.body?.detail?.monthly_rate === 2200 && r.body?.detail?.map_status === "green", JSON.stringify(r.body).slice(0, 200));
    check("no-op: no mutation, no mirror", mutations(s).length === 0 && rpcs(s, "listing_edit_mirror").length === 0);
    check("no-op: logged as noop", (await logOf("1004"))?.status === "noop");

    // ---- A value Monday holds that would not validate (pets "N/D") is not a conflict for ever ----
    m0 = await mark();
    r = await edit(ND, { editor: "Will", changes: { pet_status: "Yes" }, base: { pet_status: "N/D" } });
    s = await since(m0);
    check("pets N/D → Yes: saves instead of a 409 every time", r.status === 200 && r.body?.detail?.pet_status === "Yes", JSON.stringify(r.body).slice(0, 200));
    check("pets N/D → Yes: Monday got the Yes label, note reads N/D → Yes", same(JSON.parse(s.find((x) => x.kind === "change")?.variables?.values ?? "null"), { [C.pet_status]: { labels: ["Yes"] } }) && /Pets allowed: N\/D → Yes$/.test(s.find((x) => x.kind === "update")?.variables?.body ?? ""));

    // ---- Guard refusals ----
    m0 = await mark();
    r = await edit("404404", HAPPY);
    check("guard not_found: 404", r.status === 404 && r.body?.code === "not_found");
    for (const [id, why] of Object.entries(GUARD_SAYS).filter(([, w]) => /limit|cap/.test(w))) {
      r = await edit(id, HAPPY);
      check(`guard ${why}: 429 rate_limited with a message`, r.status === 429 && r.body?.code === "rate_limited" && typeof r.body?.error === "string" && r.body.error.length > 10, JSON.stringify(r.body));
    }
    r = await edit(GUARD_ERRORS, HAPPY);
    check("guard RPC error: 500", r.status === 500 && r.body?.code === "server_error");
    r = await edit("400400", HAPPY);
    check("guard invalid: 400 bad_request", r.status === 400 && r.body?.code === "bad_request", JSON.stringify(r.body));
    r = await edit("409409", HAPPY);
    check("guard busy: 409 busy with the message", r.status === 409 && r.body?.code === "busy" && r.body?.error === "Someone else is saving this property; try again in a moment", JSON.stringify(r.body));
    s = await since(m0);
    check("refused edits never reached Monday", s.filter((x) => x.api === "monday").length === 0);

    // ---- Monday read failure ----
    m0 = await mark();
    r = await edit(MONDAY_READ_FAILS, HAPPY);
    s = await since(m0);
    check("Monday read failure: 502 monday_error with the fixed message", r.status === 502 && r.body?.code === "monday_error" && r.body?.error === "Could not reach Monday; nothing was changed. Try again", JSON.stringify(r.body));
    check("Monday read failure: no write, nothing mirrored, logged failed", mutations(s).length === 0 && rpcs(s, "listing_edit_mirror").length === 0 && (await logOf(MONDAY_READ_FAILS))?.status === "failed");

    // ---- Monday write failure ----
    m0 = await mark();
    r = await edit(MONDAY_WRITE_FAILS, HAPPY);
    s = await since(m0);
    check("Monday write failure: 502 monday_error, 'may not have saved'", r.status === 502 && r.body?.code === "monday_error" && r.body?.error === "Monday may not have saved this. Reopen the property to check before trying again", JSON.stringify(r.body));
    check("Monday write failure: nothing mirrored, no note, logged failed", rpcs(s, "listing_edit_mirror").length === 0 && !s.some((x) => x.kind === "update") && (await logOf(MONDAY_WRITE_FAILS))?.status === "failed");
    check("Monday write failure: the mirror row is untouched", (await state()).rows[MONDAY_WRITE_FAILS].monthly_rate === 2200);

    // ---- Note failure ----
    r = await edit(NOTE_FAILS, HAPPY);
    check("note failure: 200 with noted false, edit saved and mirrored", r.status === 200 && r.body?.noted === false && r.body?.mirrored === true && r.body?.detail?.monthly_rate === 2400, JSON.stringify(r.body).slice(0, 200));
    check("note failure: still logged applied", (await logOf(NOTE_FAILS))?.status === "applied");

    // ---- Mirror failure ----
    r = await edit(MIRROR_FAILS, HAPPY);
    check("mirror failure: 200 mirrored false, detail still shows the edit", r.status === 200 && r.body?.mirrored === false && r.body?.noted === true && r.body?.detail?.monthly_rate === 2400 && r.body?.detail?.move_in_total === 2900, JSON.stringify(r.body).slice(0, 200));
    check("mirror failure: the route closes the row (monday_ok → applied)", same((await logOf(MIRROR_FAILS))?.finishes, ["monday_ok", "applied"]) && (await logOf(MIRROR_FAILS))?.status === "applied");

    // ---- Equal to current is not a conflict ----
    m0 = await mark();
    r = await edit(SAME_EDIT, { editor: "Will", changes: { monthly_rate: 2400, bedrooms: 4 }, base: { monthly_rate: 2200, bedrooms: 3 } });
    s = await since(m0);
    check("someone already made the same edit: no conflict for that field, 200", r.status === 200 && r.body?.mirrored === true, JSON.stringify(r.body).slice(0, 200));
    check("…only the other field is written and noted", same(JSON.parse(s.find((x) => x.kind === "change")?.variables?.values ?? "null"), { [C.bedrooms]: "4" }) && /<br>• Bedrooms: 3 → 4$/.test(s.find((x) => x.kind === "update")?.variables?.body ?? ""), s.find((x) => x.kind === "update")?.variables?.body);
    r = await edit("1003", { editor: "Will", changes: { monthly_rate: 2200, bedrooms: 4 }, base: { monthly_rate: 2000, bedrooms: 2 } });
    check("stale base on a field set to Monday's value is fine; a real conflict on another field still 409s", r.status === 409 && same(r.body?.fields, ["bedrooms"]) && same(r.body?.current, { bedrooms: 3 }), JSON.stringify(r.body));

    // ---- Hung Monday ----
    m0 = await mark();
    let t = Date.now();
    r = await edit(HANG_READ, HAPPY);
    let took = Date.now() - t;
    s = await since(m0);
    check("hung Monday read: 502 'nothing was changed' after ~10 s", r.status === 502 && r.body?.error === "Could not reach Monday; nothing was changed. Try again" && took >= 9_000 && took < HANG_MS, `${took} ms ${JSON.stringify(r.body)}`);
    check("hung Monday read: no write, no mirror, logged failed", mutations(s).length === 0 && rpcs(s, "listing_edit_mirror").length === 0 && (await logOf(HANG_READ))?.status === "failed");
    m0 = await mark();
    t = Date.now();
    r = await edit(HANG_WRITE_LANDS, HAPPY);
    took = Date.now() - t;
    s = await since(m0);
    check("hung Monday write: 502 'may not have saved' after ~10 s", r.status === 502 && r.body?.error === "Monday may not have saved this. Reopen the property to check before trying again" && took >= 9_000 && took < HANG_MS, `${took} ms ${JSON.stringify(r.body)}`);
    check("hung Monday write: nothing mirrored, no note, logged failed with before", rpcs(s, "listing_edit_mirror").length === 0 && !s.some((x) => x.kind === "update") && (await logOf(HANG_WRITE_LANDS))?.status === "failed" && (await logOf(HANG_WRITE_LANDS))?.before?.monthly_rate === 2200);
    await new Promise((res) => setTimeout(res, HANG_MS - took + 300)); // let the mock finish its late answer
    m0 = await mark();
    r = await edit(HANG_WRITE_LANDS, { ...HAPPY, editor: "Gaby" }); // a colleague retries the same edit
    s = await since(m0);
    const caught = await logOf(HANG_WRITE_LANDS);
    check("retry of a save that had landed: 200 alreadySaved, no conflict, no Monday write", r.status === 200 && r.body?.alreadySaved === true && s.filter((x) => x.kind === "change").length === 0, JSON.stringify(r.body).slice(0, 200));
    check("…the map catches up: monday_ok with every field confirmed, mirrored, detail has the values", r.body?.mirrored === true && same(r.body?.unconfirmed, []) && rpcs(s, "listing_edit_mirror").length === 1 && same(caught?.finishes, ["monday_ok"]) && caught?.status === "applied" && same(caught?.confirmed, ["monthly_rate", "next_availability", "pet_status", "notes", "bedrooms"]) && r.body?.detail?.monthly_rate === 2400 && (await state()).rows[HANG_WRITE_LANDS].pet_status === "Yes", JSON.stringify(caught));
    const owedNote = s.find((x) => x.kind === "update")?.variables?.body ?? "";
    check("…and the note the failed save never posted is posted now, against Monday's values before it", r.body?.noted === true && owedNote.includes("Monthly rent: $2,200 → $2,400") && owedNote.includes("Pets allowed: No → Yes") && !owedNote.includes("Bedrooms"), owedNote);
    check("…credited to whoever made the failed save, not the person retrying", owedNote.startsWith("✏️ Edited on the map by Will &lt;b&gt;Tester&lt;/b&gt; on ") && !owedNote.includes("Gaby"), owedNote);
    m0 = await mark();
    r = await edit(HANG_WRITE_LANDS, HAPPY);
    s = await since(m0);
    check("a third try: Monday and the map agree and the note was posted, a true no-op (alreadySaved, no mirror, no note)", r.status === 200 && r.body?.alreadySaved === true && r.body?.noted === false && r.body?.mirrored === true && rpcs(s, "listing_edit_mirror").length === 0 && !s.some((x) => x.kind === "update") && (await logOf(HANG_WRITE_LANDS))?.status === "noop", JSON.stringify(r.body).slice(0, 200));

    // ---- A write that landed, the webhook caught the map up, then the same save again: the note is still owed ----
    t = Date.now();
    r = await edit(LANDS_THEN_WEBHOOK, HAPPY);
    took = Date.now() - t;
    check("landed write (then webhook): first try 502 'may not have saved'", r.status === 502 && r.body?.code === "monday_error");
    await new Promise((res) => setTimeout(res, HANG_MS - took + 300));
    await fetch(`${MOCK}/__webhook?id=${LANDS_THEN_WEBHOOK}`);
    check("…the webhook brought Monday's values into the map", (await state()).rows[LANDS_THEN_WEBHOOK].monthly_rate === 2400);
    m0 = await mark();
    r = await edit(LANDS_THEN_WEBHOOK, HAPPY);
    s = await since(m0);
    const lw = await logOf(LANDS_THEN_WEBHOOK);
    const lwNote = s.find((x) => x.kind === "update")?.variables?.body ?? "";
    check("…saving again: 200 alreadySaved, noted (the owed note is posted), no Monday write", r.status === 200 && r.body?.alreadySaved === true && r.body?.noted === true && s.filter((x) => x.kind === "change").length === 0 && lwNote.includes("Monthly rent: $2,200 → $2,400"), JSON.stringify(r.body).slice(0, 200) + " " + lwNote);
    check("…the row went monday_ok → applied, not noop", same(lw?.finishes, ["monday_ok"]) && lw?.status === "applied", JSON.stringify(lw));
    m0 = await mark();
    r = await edit(LANDS_THEN_WEBHOOK, HAPPY);
    s = await since(m0);
    check("…and once more: the note isn't posted twice (a true no-op)", r.status === 200 && r.body?.alreadySaved === true && r.body?.noted === false && !s.some((x) => x.kind === "update") && (await logOf(LANDS_THEN_WEBHOOK))?.status === "noop", JSON.stringify(r.body).slice(0, 200));

    // ---- Monday already has the value but the map is behind (changed in Monday, webhook not here yet) ----
    m0 = await mark();
    r = await edit(MAP_BEHIND, { editor: "Will", changes: { monthly_rate: 2400 }, base: { monthly_rate: 2400 } });
    s = await since(m0);
    check("map behind Monday: 200 alreadySaved, mirrored, detail caught up, no Monday write", r.status === 200 && r.body?.alreadySaved === true && r.body?.mirrored === true && r.body?.detail?.monthly_rate === 2400 && mutations(s).length === 0, JSON.stringify(r.body).slice(0, 200));
    check("…no note (no failed save of this edit was owed one)", r.body?.noted === false && rpcs(s, "listing_edit_owed_note").length === 1 && (await logOf(MAP_BEHIND))?.status === "applied");

    // ---- The pause before a read retry respects the deadline ----
    t = Date.now();
    r = await edit(LATE_429, HAPPY);
    took = Date.now() - t;
    check("429 late in the read: no retry pause past the 10 s timeout (502 at ~10 s, not ~10.5 s)", r.status === 502 && r.body?.error === "Could not reach Monday; nothing was changed. Try again" && took >= 9_900 && took < 10_350, `${took} ms ${JSON.stringify(r.body)}`);
    m0 = await mark();
    r = await edit(QUICK_429, HAPPY);
    s = await since(m0);
    check("429 at once: the read is retried after the pause and the save goes through", r.status === 200 && s.filter((x) => x.kind === "read").length === 3, JSON.stringify(r.body).slice(0, 200));

    // ---- Monday silently ignores a column ----
    m0 = await mark();
    r = await edit(IGNORES_PETS, HAPPY);
    s = await since(m0);
    check("Monday ignored pets: 200 with unconfirmed ['pet_status'], not already saved", r.status === 200 && same(r.body?.unconfirmed, ["pet_status"]) && r.body?.mirrored === true && r.body?.alreadySaved === false, JSON.stringify(r.body).slice(0, 300));
    check("…pets is not mirrored; the other fields are", (await state()).rows[IGNORES_PETS].pet_status === "No" && (await state()).rows[IGNORES_PETS].monthly_rate === 2400 && same((await logOf(IGNORES_PETS))?.confirmed, ["monthly_rate", "next_availability", "notes", "bedrooms"]));
    check("…the detail shows Monday's pets, not the edit", r.body?.detail?.pet_status === "No" && r.body?.detail?.monthly_rate === 2400);
    const ignoredNote = s.find((x) => x.kind === "update")?.variables?.body ?? "";
    check("…the note leaves pets out", !ignoredNote.includes("Pets allowed") && ignoredNote.includes("Monthly rent: $2,200 → $2,400"), ignoredNote);

    // ---- The read-back fails ----
    m0 = await mark();
    r = await edit(REREAD_FAILS, HAPPY);
    s = await since(m0);
    check("read-back failed: 200, mirrored false, every written field unconfirmed", r.status === 200 && r.body?.mirrored === false && same(r.body?.unconfirmed, ["monthly_rate", "next_availability", "pet_status", "notes"]), JSON.stringify(r.body).slice(0, 300));
    check("…nothing mirrored, row closed applied with nothing confirmed", rpcs(s, "listing_edit_mirror").length === 0 && (await state()).rows[REREAD_FAILS].monthly_rate === 2200 && same((await logOf(REREAD_FAILS))?.confirmed, []) && (await logOf(REREAD_FAILS))?.status === "applied");
    check("…the detail is the record as it is (the webhook brings Monday's truth)", r.body?.detail?.monthly_rate === 2200);

    // ---- Bad requests never reach the guard ----
    m0 = await mark();
    const bad = [
      ["bad id (letters)", "abc", HAPPY, "Invalid property id"],
      ["bad id (21 digits)", "1".repeat(21), HAPPY, "Invalid property id"],
      ["body not JSON", "1001", "{not json", "Body must be a JSON object"],
      ["body an array", "1001", "[]", "Body must be a JSON object"],
      ["no editor", "1001", { changes: { monthly_rate: 1 } }, "Your name is required"],
      ["empty changes", "1001", { editor: "Will", changes: {} }, "Nothing to change"],
      ["unknown field", "1001", { editor: "Will", changes: { colour: "red" } }, "colour can't be edited from the map"],
      ["availability is not editable", "1001", { editor: "Will", changes: { availability: "Available Now" } }, "availability can't be edited from the map"],
      ["owner_phone is not editable", "1001", { editor: "Will", changes: { owner_phone: "+15551234567" } }, "owner_phone can't be edited from the map"],
      ["bad value", "1001", { editor: "Will", changes: { bedrooms: "3.5" } }, "Bedrooms must be a whole number"],
    ];
    for (const [name, id, body, message] of bad) {
      r = await edit(id, body);
      check(`400: ${name}`, r.status === 400 && r.body?.code === "bad_request" && r.body?.error === message, JSON.stringify(r.body));
    }
    const big = JSON.stringify({ editor: "Will", changes: { notes: "x" }, pad: "y".repeat(40_000) });
    r = await edit("1001", big);
    check("Content-Length over 32 KB: 413 too_large before the body is read", r.status === 413 && r.body?.code === "too_large", JSON.stringify(r.body));
    // No Content-Length (chunked): the size is checked after reading.
    const enc = new TextEncoder().encode(big);
    const chunked = await fetch(`${BASE}/api/properties/1001/edit`, {
      method: "POST", headers: { "content-type": "application/json" }, duplex: "half",
      body: new ReadableStream({ start(c) { c.enqueue(enc.slice(0, 20_000)); c.enqueue(enc.slice(20_000)); c.close(); } }),
    });
    const cb = await chunked.json().catch(() => null);
    check("chunked body over 32 KB (no Content-Length): 413 too_large", chunked.status === 413 && cb?.code === "too_large", JSON.stringify(cb));
    const small = new TextEncoder().encode(JSON.stringify({ editor: "Will", changes: { colour: "red" } }));
    const chunkedOk = await fetch(`${BASE}/api/properties/1001/edit`, {
      method: "POST", headers: { "content-type": "application/json" }, duplex: "half",
      body: new ReadableStream({ start(c) { c.enqueue(small.slice(0, 10)); c.enqueue(small.slice(10)); c.close(); } }),
    });
    check("a small chunked body is read in full and parsed", chunkedOk.status === 400 && (await chunkedOk.json()).error === "colour can't be edited from the map");
    check("bad requests reached neither Supabase nor Monday", (await since(m0)).length === 0);

    const left = (await state()).log.filter((l) => l.status === "pending" || l.status === "monday_ok");
    check("every path finished its log row (none left pending or monday_ok)", left.length === 0, JSON.stringify(left));
    const h = await fetch(`${BASE}/api/health`).then((x) => x.json());
    check("health: editing on, not dry run", h.editing === true && h.dryRun === false);
  }

  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
  process.exit(failures.length ? 1 : 0);
}
