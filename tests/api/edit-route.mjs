// End-to-end check of POST /api/properties/:id/edit against ONE mock that plays both Monday (GraphQL) and
// Supabase (PostgREST RPC). Hermetic: nothing reaches the live Monday board or the live database.
//
//   1. node tests/api/edit-route.mjs serve                                   (mock on 127.0.0.1:3098)
//   2. NEXT_DIST_DIR=.next-api npx next build
//   3. ENV="SUPABASE_URL=http://127.0.0.1:3098 SUPABASE_KEY=test MONDAY_API_URL=http://127.0.0.1:3098/v2 MONDAY_API_TOKEN=test"
//      env $ENV NEXT_DIST_DIR=.next-api npx next start -p 3031              → BASE=http://localhost:3031 node tests/api/edit-route.mjs
//      env $ENV MONDAY_DRY_RUN=1 NEXT_DIST_DIR=.next-api npx next start -p 3031 → MODE=dry node tests/api/edit-route.mjs
//      env $ENV MAP_EDITING=off NEXT_DIST_DIR=.next-api npx next start -p 3031  → MODE=off node tests/api/edit-route.mjs
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

const OK = ["1001", "1002", "1003", "1004", "1005", "5021", "5022", "5023", "5024", "5030"];
const GUARD_SAYS = { "429001": "ip_limit", "429002": "property_limit", "429003": "daily_cap" };
const GUARD_ERRORS = "500500";
const MONDAY_READ_FAILS = "5021";
const MONDAY_WRITE_FAILS = "5022";
const NOTE_FAILS = "5023";
const MIRROR_FAILS = "5024";
const STATUS_FAILS = "5030";
const ND = "1005"; // property_map_status errors: GET answers 502 db_error

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
  };
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
          if (id === MONDAY_READ_FAILS) return send(200, { errors: [{ message: "boom (read)" }] });
          const item = monday[id];
          if (!item) return send(200, { data: { items: [] } });
          return send(200, { data: { items: [{ id, column_values: (v.cols ?? []).map((c) => ({ id: c, text: item[c] ?? null })) }] } });
        }
        if (kind === "change") {
          const id = String(v.item);
          if (id === MONDAY_WRITE_FAILS) return send(200, { errors: [{ message: "boom (write)" }] });
          const values = JSON.parse(v.values);
          for (const [col, val] of Object.entries(values)) monday[id][col] = mondayText(val);
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
            if (id === GUARD_ERRORS) return pgError("guard exploded");
            if (GUARD_SAYS[id]) return send(200, GUARD_SAYS[id]);
            if (!rows[id]) return send(200, "not_found");
            log.push({ id: log.length + 1, property_item_id: id, ip: a.p_ip, editor: a.p_editor, fields: a.p_fields, changes: a.p_changes, before: null, status: "pending" });
            return send(200, `ok:${log.length}`);
          }
          case "listing_edit_finish": {
            const entry = log.find((l) => l.id === a.p_log_id);
            if (entry) {
              entry.status = a.p_status;
              if (a.p_before !== undefined && a.p_before !== null) entry.before = a.p_before;
            }
            return send(204);
          }
          case "listing_edit_mirror": {
            const id = a.p_property_item_id;
            if (id === MIRROR_FAILS) return pgError("mirror exploded");
            if (!rows[id]) return send(200, false);
            Object.assign(rows[id], a.p_patch);
            return send(200, true);
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

  if (MODE === "off") {
    const m0 = await mark();
    const r = await edit("1001", HAPPY);
    check("MAP_EDITING=off: 403 editing_off", r.status === 403 && r.body?.code === "editing_off", JSON.stringify(r.body));
    check("MAP_EDITING=off: nothing reached Monday or Supabase", (await since(m0)).length === 0);
    const h = await fetch(`${BASE}/api/health`).then((x) => x.json());
    check("health says editing is off", h.editing === false);
  } else if (MODE === "dry") {
    const m0 = await mark();
    const r = await edit("1001", HAPPY);
    const s = await since(m0);
    check("dry run: 200 with dryRun, not mirrored, not noted", r.status === 200 && r.body?.dryRun === true && r.body?.mirrored === false && r.body?.noted === false, JSON.stringify(r.body).slice(0, 200));
    check("dry run: the detail shows the edit laid over the record", r.body?.detail?.monthly_rate === 2400 && r.body?.detail?.pet_status === "Yes" && r.body?.detail?.next_availability === "2026-11-01");
    check("dry run: move_in_total follows the new rent", r.body?.detail?.move_in_total === 2900, String(r.body?.detail?.move_in_total));
    check("dry run: Monday was read (conflict check still runs)", s.some((x) => x.api === "monday" && x.kind === "read"));
    check("dry run: no mutation reached Monday", mutations(s).length === 0, JSON.stringify(mutations(s)));
    check("dry run: nothing mirrored", rpcs(s, "listing_edit_mirror").length === 0);
    check("dry run: logged as dry_run", (await logOf("1001"))?.status === "dry_run");
    check("dry run: mock record untouched", (await state()).rows["1001"].monthly_rate === 2200 && (await state()).monday["1001"][C.monthly_rate] === "2200");
    const h = await fetch(`${BASE}/api/health`).then((x) => x.json());
    check("health says dry run and editing on", h.dryRun === true && h.editing === true);
  } else {
    // ---- Happy path ----
    let m0 = await mark();
    let r = await edit("1001", HAPPY);
    let s = await since(m0);
    check("happy path: 200, noted, mirrored, not dry run", r.status === 200 && r.body?.ok === true && r.body?.noted === true && r.body?.mirrored === true && !r.body?.dryRun, JSON.stringify(r.body).slice(0, 300));
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
    check("mirror got the patch (only what changed)", mirror?.p_property_item_id === "1001" && same(mirror?.p_patch, { monthly_rate: 2400, next_availability: "2026-11-01", pet_status: "Yes", notes: "Line one\nLine two" }), JSON.stringify(mirror));
    const order = s.map((x) => (x.api === "monday" ? x.kind : x.fn)).filter((k) => ["change", "listing_edit_mirror", "update"].includes(k));
    check("order: Monday write, then mirror, then note", same(order, ["change", "listing_edit_mirror", "update"]), JSON.stringify(order));
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
    check("log: applied, before = Monday's values then", l1?.status === "applied" && same(l1?.before, { monthly_rate: 2200, next_availability: null, pet_status: "No", notes: "Old", bedrooms: 3 }), JSON.stringify(l1));

    // ---- Clearing fields ----
    m0 = await mark();
    r = await edit("1002", { editor: "Will", changes: { sqft: "", property_link: null }, base: { sqft: 1200, property_link: "https://example.com/listing/1" } });
    s = await since(m0);
    const clear = JSON.parse(s.find((x) => x.kind === "change")?.variables?.values ?? "null");
    check("clear: 200", r.status === 200 && r.body?.mirrored === true, JSON.stringify(r.body).slice(0, 200));
    check("clear: Monday got null for the number and the text column", same(clear, { [C.sqft]: null, [C.property_link]: null }), JSON.stringify(clear));
    check("clear: mirror got nulls", same(rpcs(s, "listing_edit_mirror")[0]?.args?.p_patch, { sqft: null, property_link: null }));
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
    check("no-op: 200, noted false, mirrored true, unchanged detail", r.status === 200 && r.body?.noted === false && r.body?.mirrored === true && r.body?.detail?.monthly_rate === 2200 && r.body?.detail?.map_status === "green", JSON.stringify(r.body).slice(0, 200));
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
    for (const [id, why] of Object.entries(GUARD_SAYS)) {
      r = await edit(id, HAPPY);
      check(`guard ${why}: 429 rate_limited with a message`, r.status === 429 && r.body?.code === "rate_limited" && typeof r.body?.error === "string" && r.body.error.length > 10, JSON.stringify(r.body));
    }
    r = await edit(GUARD_ERRORS, HAPPY);
    check("guard RPC error: 500", r.status === 500 && r.body?.code === "server_error");
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
    check("Monday write failure: 502 monday_error", r.status === 502 && r.body?.code === "monday_error", JSON.stringify(r.body));
    check("Monday write failure: nothing mirrored, no note, logged failed", rpcs(s, "listing_edit_mirror").length === 0 && !s.some((x) => x.kind === "update") && (await logOf(MONDAY_WRITE_FAILS))?.status === "failed");
    check("Monday write failure: the mirror row is untouched", (await state()).rows[MONDAY_WRITE_FAILS].monthly_rate === 2200);

    // ---- Note failure ----
    r = await edit(NOTE_FAILS, HAPPY);
    check("note failure: 200 with noted false, edit saved and mirrored", r.status === 200 && r.body?.noted === false && r.body?.mirrored === true && r.body?.detail?.monthly_rate === 2400, JSON.stringify(r.body).slice(0, 200));
    check("note failure: still logged applied", (await logOf(NOTE_FAILS))?.status === "applied");

    // ---- Mirror failure ----
    r = await edit(MIRROR_FAILS, HAPPY);
    check("mirror failure: 200 mirrored false, detail still shows the edit", r.status === 200 && r.body?.mirrored === false && r.body?.noted === true && r.body?.detail?.monthly_rate === 2400 && r.body?.detail?.move_in_total === 2900, JSON.stringify(r.body).slice(0, 200));

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
      ["body too large", "1001", { editor: "Will", changes: { notes: "x" }, pad: "y".repeat(40_000) }, "Body is too large"],
    ];
    for (const [name, id, body, message] of bad) {
      r = await edit(id, body);
      check(`400: ${name}`, r.status === 400 && r.body?.code === "bad_request" && r.body?.error === message, JSON.stringify(r.body));
    }
    check("bad requests reached neither Supabase nor Monday", (await since(m0)).length === 0);

    const h = await fetch(`${BASE}/api/health`).then((x) => x.json());
    check("health: editing on, not dry run", h.editing === true && h.dryRun === false);
  }

  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
  process.exit(failures.length ? 1 : 0);
}
