// End-to-end check of GET /api/properties/:id/contact against a mock Quo API.
//
//   1. node tests/api/contact-route.mjs serve            (mock Quo on :3099)
//   2. QUO_API_KEY=test-key QUO_API_BASE=http://127.0.0.1:3099/v1 next start -p 3012
//   3. BASE=http://localhost:3012 node tests/api/contact-route.mjs
//
// Uses real property records (read-only): one with an owner phone, one with none.
import http from "node:http";

const PORT = 3099;
const WITH_PHONE = process.env.WITH_PHONE ?? "12511893876"; // owner (918) 740-9628
const WITH_PHONE_E164 = process.env.WITH_PHONE_E164 ?? "+19187409628";
const NO_PHONE = process.env.NO_PHONE ?? "13350010945";
const FAILING = "+14058358916"; // a phone the mock refuses, to check the 502 path
const FAILING_ID = process.env.FAILING_ID ?? "13351327433";
const BUSY = "+17034074378"; // answers 429 once, then works: the client must retry
const BUSY_ID = process.env.BUSY_ID ?? "12236087634";
const REVOKED = "+15712056958"; // answers 401: a refused key must hide the digest, not show an error
const REVOKED_ID = process.env.REVOKED_ID ?? "12236087635";
const TWO_ID = process.env.TWO_ID ?? "12787901248"; // owner (509) 252-5051, landlord (509) 995-7235
const TWO_FAILS = "+15099957235"; // the landlord number fails; the owner number has no history

if (process.argv[2] === "serve") {
  const seen = [];
  const busy = {};
  let directoryReads = 0;
  http
    .createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const send = (code, body) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/__seen") return send(200, seen);
      seen.push({ path: url.pathname, query: url.search, auth: req.headers.authorization ?? null });
      if (req.headers.authorization !== "test-key") return send(401, { message: "bad key" });
      // The first directory read fails fast while /users is still in flight: the route must answer 502,
      // not crash on an unhandled rejection, and the next request must read the directory again.
      if (url.pathname === "/v1/phone-numbers") {
        if (++directoryReads === 1) return send(500, { message: "directory down" });
        return send(200, { data: [{ id: "PNmock1" }, { id: "PNmock2" }] });
      }
      if (url.pathname === "/v1/users") {
        return setTimeout(() => send(200, { data: [{ id: "USwill", firstName: "William", email: "william@x" }] }), 300);
      }
      const participants = url.searchParams.getAll("participants");
      if (participants[0] === FAILING || participants[0] === TWO_FAILS) return send(500, { message: "boom" });
      if (participants[0] === REVOKED) return send(401, { message: "revoked" });
      if (participants[0] === BUSY) {
        const key = `${url.pathname}${url.searchParams.get("phoneNumberId")}`;
        busy[key] = (busy[key] ?? 0) + 1;
        if (busy[key] === 1) {
          res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
          return res.end(JSON.stringify({ message: "slow down" }));
        }
        const first = url.searchParams.get("phoneNumberId") === "PNmock1";
        return send(200, { data: url.pathname === "/v1/calls" && first ? [{ createdAt: "2026-10-26T12:00:00Z", direction: "incoming", status: "completed", duration: 30, answeredAt: null, answeredBy: null, userId: null }] : [], nextPageToken: null });
      }
      if (participants.length !== 1 || participants[0] !== WITH_PHONE_E164 || !/^PNmock[12]$/.test(url.searchParams.get("phoneNumberId") ?? "")) {
        return send(200, { data: [], nextPageToken: null });
      }
      const inbox2 = url.searchParams.get("phoneNumberId") === "PNmock2";
      if (url.pathname === "/v1/calls") {
        // Two pages on inbox 1, so pagination is exercised.
        if (inbox2) return send(200, { data: [], nextPageToken: null });
        if (!url.searchParams.get("pageToken")) {
          return send(200, {
            data: [{ createdAt: "2026-10-20T15:00:00Z", direction: "outgoing", status: "no-answer", duration: 0, answeredAt: null, userId: "USwill" }],
            nextPageToken: "p2",
          });
        }
        return send(200, {
          data: [{ createdAt: "2026-10-24T16:00:00Z", direction: "outgoing", status: "completed", duration: 190, answeredAt: "2026-10-24T16:00:04Z", userId: "USwill" }],
          nextPageToken: null,
        });
      }
      if (url.pathname === "/v1/messages") {
        return send(200, {
          data: inbox2
            ? [{ createdAt: "2026-10-25T09:00:00Z", direction: "incoming", text: "Yes, it's free from Nov 1", media: [], userId: null }]
            : [
                { createdAt: "2026-10-19T10:00:00Z", direction: "outgoing", text: "Hi, is the house available?", media: [], userId: "USwill" },
                { createdAt: "2026-10-21T10:00:00Z", direction: "outgoing", text: "Following up", media: [], userId: "USwill" },
              ],
          nextPageToken: null,
        });
      }
      send(404, { message: "not mocked" });
    })
    .listen(PORT, () => console.log(`mock Quo on :${PORT}`));
} else {
  const BASE = process.env.BASE ?? "http://localhost:3012";
  const failures = [];
  const check = (name, ok, extra = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
    if (!ok) failures.push(name);
  };
  const get = async (id, headers = {}) => {
    const r = await fetch(`${BASE}/api/properties/${id}/contact`, { headers });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const down = await get(WITH_PHONE);
  check("Quo directory down: 502, not a crash", down.status === 502 && down.body?.code === "quo_error");
  const alive = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false);
  check("server still up after the directory failure", alive);

  const a = await get(WITH_PHONE);
  const d = a.body?.digest;
  check("200 with a digest for a property with an owner phone", a.status === 200 && a.body?.enabled === true && !!d, JSON.stringify(a.body).slice(0, 200));
  check("the owner number is normalised and labelled", JSON.stringify(a.body?.numbers) === JSON.stringify([{ label: "Owner", phone: WITH_PHONE_E164 }]));
  check("calls from both pages are counted (2 calls, 1 unanswered)", d?.calls.total === 2 && d?.calls.missed === 1 && d?.calls.outgoing === 2);
  check("last call is the newest one, answered, by William, 190 s", d?.calls.last?.at === "2026-10-24T16:00:00Z" && d?.calls.last?.answered === true && d?.calls.last?.by === "William" && d?.calls.last?.durationSec === 190);
  check("texts across both inboxes: 2 sent, 1 reply", d?.texts.sent === 2 && d?.texts.received === 1);
  check("last text is the reply with its preview", d?.texts.last?.direction === "incoming" && d?.texts.last?.preview === "Yes, it's free from Nov 1");
  check("lastContactAt is the newest call or text", d?.lastContactAt === "2026-10-25T09:00:00Z");
  check("not truncated, nothing unread", d?.calls.truncated === false && d?.texts.truncated === false && d?.unread === 0);

  const seen = await (await fetch(`http://127.0.0.1:${PORT}/__seen`)).json();
  const quoCalls = seen.filter((s) => s.path === "/v1/calls" || s.path === "/v1/messages");
  check("Authorization header carries the key", seen.every((s) => s.auth === "test-key"));
  check(
    "participants sent without brackets, URL-encoded, one per request",
    quoCalls.length > 0 && quoCalls.every((s) => s.query.includes(`participants=${encodeURIComponent(WITH_PHONE_E164)}`) && !s.query.includes("participants%5B")),
    quoCalls[0]?.query,
  );
  check("every inbox is read (PNmock1 and PNmock2)", ["PNmock1", "PNmock2"].every((p) => quoCalls.some((s) => s.query.includes(`phoneNumberId=${p}`))));

  const before = seen.length;
  const again = await get(WITH_PHONE);
  const after = (await (await fetch(`http://127.0.0.1:${PORT}/__seen`)).json()).length;
  check("second open is served from cache (no new Quo requests)", again.status === 200 && after === before, `${before} -> ${after}`);

  const none = await get(NO_PHONE);
  check("no phone on the record: enabled, no numbers, no digest", none.status === 200 && none.body?.numbers?.length === 0 && none.body?.digest === null);

  const bad = await get(FAILING_ID);
  const two = await get(TWO_ID);
  check(
    "two numbers, one unreadable, the other quiet: 200 with unread 1 and zero counts (not 'no history')",
    two.status === 200 && two.body?.numbers?.length === 2 && two.body?.digest?.unread === 1 && two.body?.digest?.calls.total === 0,
    JSON.stringify(two.body).slice(0, 220),
  );

  check("Quo failure is a 502 with a fixed message", bad.status === 502 && bad.body?.code === "quo_error" && bad.body?.error === "Couldn't reach Quo");

  const b = await get(BUSY_ID);
  check("Quo 429 once: retried after Retry-After, then 200", b.status === 200 && b.body?.digest?.calls.total === 1, JSON.stringify(b.body).slice(0, 160));
  check("an incoming call that ran with nobody answering counts as missed (voicemail)", b.body?.digest?.calls.missed === 1 && b.body?.digest?.calls.last?.answered === false);

  const r = await get(REVOKED_ID);
  check("Quo 401 (key refused): enabled false, nothing shown", r.status === 200 && r.body?.enabled === false && r.body?.digest === null);

  check("invalid id is a 400", (await get("abc")).status === 400);
  check("unknown property is a 404", (await get("99999999999")).status === 404);

  let limited = false;
  let retryAfter = null;
  for (let i = 0; i < 130 && !limited; i++) {
    const r2 = await fetch(`${BASE}/api/properties/${WITH_PHONE}/contact`, { headers: { "x-forwarded-for": "198.51.100.7" } });
    limited = r2.status === 429;
    if (limited) retryAfter = r2.headers.get("retry-after");
  }
  check("per-IP limit answers 429 with Retry-After", limited && retryAfter === "60");

  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
  process.exit(failures.length ? 1 : 0);
}
