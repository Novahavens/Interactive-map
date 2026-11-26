// The housing agent's list in the full map (components/MapApp.tsx): every outside home the API returns has a row,
// the Furnished Finder ones with no coordinates sit under "No map location" and the ones that broke a rule say why;
// a failed outside read keeps the last good list, shows a short message and Retry recovers; an attach refreshes the
// submit status, the outside list and the claims drawer's option counts.
//
// Everything the page reads is mocked with fictional data (health, claim, claims, properties, outside, submit
// status, add), so it writes nothing. Google Maps itself is real; its key errors are not checked here.
//
//   BASE=http://localhost:3110 node tests/browser/outside-list.mjs [screenshot-dir]
//
// The dev server must run with MAP_FEATURES=all. playwright-core is resolved from node_modules, then from PW_CORE.
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3110";
const OUT = process.argv[2] ?? "test-results/outside-list";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright-core")
  .catch(() => require("playwright-core"))
  .catch(() => import(process.env.PW_CORE ?? "/opt/node-tools/node_modules/playwright-core/index.mjs"));
const CHROME = [process.env.CHROME, "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"].find((p) => p && fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

// ---------- fixtures (fictional) ----------
const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const brief = {
  status: "Working on it", group: "New Housing Request", receivedOn: "2026-10-19", moveIn: "2026-11-02", leaseMonths: 3,
  frv: 3000, adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, petDescription: "One small dog, 20 lb",
  utilityCap: 250, specialRequests: null, accountManager: "Melissa C.", searcher: "Demo Searcher", coordinator: "Demo Coordinator", company: "Alacrity",
};
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-3001", loss: LOSS, needs, attached: [], attachedPins: [], brief };
const claims = [
  { id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." },
];
const HEALTH = {
  ok: true, dryRun: true, quo: false, editing: false,
  features: { outside: true, bestMatch: false, chat: false, addOutside: false, submit: true, mine: false, nearsite: false, findPhone: false, templates: false },
};

function pin(id, over = {}) {
  return {
    monday_item_id: String(id), name: `Fixture ${id}`, lat: LOSS.lat + 0.01, lng: LOSS.lng + 0.01, group_title: "Fixture group",
    addable: true, bedrooms: 3, bathrooms: 2, monthly_rate: 2000, pet_status: "yes", has_photos: true, available_from: null,
    distance_miles: 0.8, approximate: false, map_status: "green",
    availability: null, availability_checked: null, last_contact: null, link_status: null, other_claims: [], ...over,
  };
}
const pins = [pin(3001), pin(3002, { lat: LOSS.lat - 0.02, lng: LOSS.lng, distance_miles: 1.5 }), pin(3003, { lat: LOSS.lat, lng: LOSS.lng + 0.03, distance_miles: 2.2, map_status: "yellow" })];
const byId = new Map(pins.map((p) => [p.monday_item_id, p]));

function detail(p) {
  return {
    monday_item_id: p.monday_item_id, name: p.name, group_id: "g", group_title: p.group_title, address: `${p.monday_item_id} Fixture Ln`, city: "Tulsa", state: "OK", zipcode: "74133",
    lat: p.lat, lng: p.lng, bedrooms: 3, bathrooms: 2, monthly_rate: p.monthly_rate, pet_status: "yes", property_type: "House", sqft: 1800, furnished: "No", fenced_yard: "Yes",
    next_availability: "2026-11-01", last_contact: null, ntv: null, property_link: null, photo_folder_url: null,
    owner_name: "Demo Owner", owner_phone: "(918) 555-0100", owner_email: "owner@example.com", notes: "Fixture note.",
    security_deposit: 2000, cleaning_fee: 150, admin_fee: 100, application_fee: 50, move_in_fee: 0, pet_rent: 25, pet_deposit: 300, pet_fee: 0,
    other_fee_1: null, other_fee_1_desc: null, other_fee_2: null, other_fee_2_desc: null, move_in_total: 4500,
    landlord_item_id: null, landlord_name: "Demo PM", landlord_phone: null, landlord_contact: null, landlord_type: "PM", landlord_approval: "Approved", landlord_approval_note: null,
    geocode_status: "ok", location_precision: "exact", map_status: p.map_status, map_reason: "none",
    synced_at: "2026-10-22T12:00:00Z", updated_at: "2026-10-22T12:00:00Z", availability: p.availability, availability_checked: p.availability_checked,
    link_status: p.link_status, other_claims: p.other_claims,
  };
}

// Outside homes. Three are Furnished Finder with no coordinates and no street address (as the live data is):
// two fit, one broke "available late". Zillow: one exact pin that fits, one far away that broke "distance".
const oid = (n) => `22222222-2222-4222-8222-2222222222${String(n).padStart(2, "0")}`;
const H = { zExact: oid(1), zClaim: oid(2), zFar: oid(3), ffOk1: oid(4), ffOk2: oid(5), ffLate: oid(6) };
const home = (listingId, over) => ({
  listingId, source: "zillow", url: "https://example.com/listing", title: listingId, addressKnown: true, city: "Tulsa", state: "OK",
  beds: 3, baths: 2, rent: 2400, lat: null, lng: null, precision: null, distanceMiles: null, rank: 1, score: null, fits: true, excludedBy: [],
  isNew: false, inPropertyDb: false, propertyItemId: null, onClaim: false, hasPhone: false, availableFrom: null, pets: null, photo: null, outreach: null, ...over,
});
const HOMES = [
  home(H.zExact, { title: "Zillow Exact Ave", lat: LOSS.lat + 0.01, lng: LOSS.lng + 0.012, precision: "exact", distanceMiles: 1.2, rank: 1, isNew: true }),
  home(H.zClaim, { title: "Zillow Claimable Ct", lat: LOSS.lat - 0.02, lng: LOSS.lng + 0.015, precision: "exact", distanceMiles: 2.4, rank: 2 }),
  home(H.zFar, { title: "Zillow Far Rd", lat: LOSS.lat + 0.2, lng: LOSS.lng, precision: "exact", distanceMiles: 14, rank: 5, fits: false, excludedBy: ["distance"] }),
  home(H.ffOk1, { source: "furnished_finder", title: "Furnished Fit One", rent: 2100, rank: 3, pets: "Pets allowed" }),
  home(H.ffOk2, { source: "furnished_finder", title: "Furnished Fit Two", rent: 2300, rank: 4 }),
  home(H.ffLate, { source: "furnished_finder", title: "Furnished Late One", rent: 2500, rank: 6, fits: false, excludedBy: ["available_late"] }),
];
// Nearest order, outside rows only: the pinned fitting homes by distance, the pinned home that did not fit, then the
// Furnished Finder homes with no pin (fitting by rank, then the one that did not fit).
const EXPECTED_ORDER = [H.zExact, H.zClaim, H.zFar, H.ffOk1, H.ffOk2, H.ffLate];
const FF_IDS = [H.ffOk1, H.ffOk2, H.ffLate];

// ---------- harness ----------
const errors = [];
const failures = [];
const check = (name, ok, extra = "") => {
  (ok ? console.log : (m) => { console.log(m); failures.push(name); })(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
}
const panel = (p) => p.locator('aside[aria-label="Property details"]:visible').first();
const outsideRows = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("button[id^='row-out-']")]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ id: b.id.replace("row-out-", ""), text: b.innerText.replace(/\s+/g, " ").trim(), label: b.getAttribute("aria-label") ?? "" })),
  );
const alertBox = (p) => p.locator('[role="alert"]:visible').filter({ hasText: "Could not load the homes found outside our database." });

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

/** One page with every read mocked. `state.failing` makes the outside read answer 500 while it is set. */
async function open({ failing = false, w = 1440, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const state = { failing, outsideCalls: 0, submitCalls: 0, activeFresh: 0, adds: [], attached: new Set() };
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("nh-theme", "light");
      localStorage.setItem("nh-reporter-name", "Tester");
    } catch {}
  });
  await ctx.route("**/api/health", (r) => r.fulfill({ json: HEALTH }));
  await ctx.route("**/api/claims/active**", (r) => {
    if (new URL(r.request().url()).searchParams.get("fresh") === "1") state.activeFresh++;
    r.fulfill({ json: { claims, count: claims.length } });
  });
  await ctx.route(/\/api\/claim\/100000001$/, (r) => r.fulfill({ json: claim }));
  await ctx.route("**/api/properties?**", (r) => r.fulfill({ json: { pins, coverage: { mappable: pins.length, unmapped: 0 } } }));
  await ctx.route(/\/api\/properties\/\d+$/, (r) => r.fulfill({ json: detail(byId.get(r.request().url().split("/").pop())) }));
  await ctx.route(/\/api\/claim\/100000001\/outside$/, (r) => {
    state.outsideCalls++;
    if (state.failing) return r.fulfill({ status: 500, json: { error: "Database query failed", code: "db_error" } });
    // A home counts as on the claim once its option has been added (the server's own answer, here a fixture).
    const homes = HOMES.map((x) => ({ ...x, onClaim: state.attached.has(x.listingId) }));
    return r.fulfill({
      json: { enabled: true, searchId: "s-1", versionNo: 1, run: { status: "done", found: homes.length, fitting: 4, newHomes: 1, finishedAt: null }, homes },
    });
  });
  await ctx.route(/\/api\/claim\/100000001\/submit-status$/, (r) => {
    state.submitCalls++;
    const options = state.adds.map((a) => ({ subitemId: "8001", propertyId: String(a.propertyId), state: "todo", reason: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null }));
    r.fulfill({ json: { enabled: true, options, counts: { ready: 0, submitted: 0 } } });
  });
  await ctx.route("**/api/claim/add", async (r) => {
    const body = r.request().postDataJSON();
    state.adds.push(body);
    state.attached.add(H.zClaim); // the outside twin of the attached option now reads as on the claim
    await r.fulfill({ json: { ok: true, subitemId: "8001", alreadyAttached: false } });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|google|maps|gstatic|ApiNotActivated|InvalidKey|RefererNotAllowed|BillingNotEnabled|dummy/i.test(m.text())) errors.push(m.text());
  });
  p.on("dialog", (d) => {
    errors.push(`unexpected ${d.type()} dialog: ${d.message()}`);
    void d.dismiss();
  });
  await p.goto(`${BASE}/?claimId=${CLAIM_ID}`, { waitUntil: "networkidle" });
  return { ctx, p, state };
}

// ---- 1. every home the API returns is listed; Furnished Finder ones under "No map location" ----
{
  const s = await open();
  await s.p.locator("button[id^='row-out-']:visible").first().waitFor();
  const rows = await outsideRows(s.p);
  check("list: every outside home the API returned has a row, in nearest order", JSON.stringify(rows.map((r) => r.id)) === JSON.stringify(EXPECTED_ORDER), rows.map((r) => r.text.slice(0, 24)).join(" | "));
  check("list: the Furnished Finder homes are all listed (three, two fitting and one that did not fit)", FF_IDS.every((id) => rows.some((r) => r.id === id)));
  check("list: the divider counts the homes with no map location", await s.p.getByText("No map location (3)", { exact: true }).first().isVisible());
  const late = rows.find((r) => r.id === H.ffLate);
  check("list: a home that did not fit says why", late?.text.includes("Not a fit: available too late"), late?.text);
  check("list: a fitting home says nothing about fit", !rows.find((r) => r.id === H.ffOk1)?.text.includes("Not a fit"));
  const far = rows.find((r) => r.id === H.zFar);
  check("list: a pinned home that did not fit is listed too, with its reason", far?.text.includes("Not a fit: too far from the loss"), far?.text);
  await s.p.screenshot({ path: `${OUT}/list.png` });
  await s.ctx.close();
}

// ---- 2. a failed outside read: message with Retry, last good list kept, Retry recovers ----
{
  const s = await open({ failing: true });
  const shown = await waitUntil(async () => (await alertBox(s.p).count()) > 0);
  check("failed read: a short message shows in the list area", shown);
  const text = shown ? await alertBox(s.p).first().innerText() : "";
  check("failed read: the message has no codes or raw error text", shown && !/HTTP|500|db_error|Database query/.test(text), text.replace(/\s+/g, " "));
  check("failed read: a Retry button is there", shown && (await alertBox(s.p).first().getByRole("button", { name: "Retry" }).isVisible()));
  check("failed read: no outside rows (there was no good list yet)", (await outsideRows(s.p)).length === 0);
  s.state.failing = false;
  await alertBox(s.p).first().getByRole("button", { name: "Retry" }).click();
  const back = await waitUntil(async () => (await outsideRows(s.p)).length === EXPECTED_ORDER.length);
  check("retry: the rows come back and the message goes", back && (await alertBox(s.p).count()) === 0);
  await s.ctx.close();
}

// ---- 3. a failed refresh after an attach keeps the last good list; Retry recovers ----
{
  const s = await open();
  await s.p.locator("button[id^='row-out-']:visible").first().waitFor();
  s.state.failing = true;
  await s.p.locator('[id="row-3001"]:visible').first().click();
  await panel(s.p).getByRole("heading", { name: "Fixture 3001" }).waitFor();
  await panel(s.p).getByRole("button", { name: /Add to claim/ }).click();
  const shown = await waitUntil(async () => (await alertBox(s.p).count()) > 0);
  check("refresh after attach fails: the message shows", shown);
  check("refresh after attach fails: the last good list is kept", (await outsideRows(s.p)).length === EXPECTED_ORDER.length);
  s.state.failing = false;
  await alertBox(s.p).first().getByRole("button", { name: "Retry" }).click();
  const label = await waitUntil(async () => (await outsideRows(s.p)).find((r) => r.id === H.zClaim)?.label.includes("on this claim"));
  check("retry after the failed refresh: the attached home reads as on this claim", label);
  await s.ctx.close();
}

// ---- 4. an attach refreshes the submit status, the outside list and the claims drawer's counts ----
{
  const s = await open();
  await s.p.locator("button[id^='row-out-']:visible").first().waitFor();
  const before = { outside: s.state.outsideCalls, submit: s.state.submitCalls, fresh: s.state.activeFresh };
  check("attach: the claims drawer has not re-read fresh before the attach", before.fresh === 0, `fresh reads ${before.fresh}`);
  await s.p.locator('[id="row-3001"]:visible').first().click();
  await panel(s.p).getByRole("heading", { name: "Fixture 3001" }).waitFor();
  await panel(s.p).getByRole("button", { name: /Add to claim/ }).click();
  const onClaim = await waitUntil(async () => (await outsideRows(s.p)).find((r) => r.id === H.zClaim)?.label.includes("on this claim"));
  check("attach: the outside list is refreshed (the home reads as on this claim)", onClaim);
  check("attach: the submit status is read again", s.state.submitCalls > before.submit, `${before.submit} -> ${s.state.submitCalls}`);
  check("attach: the outside homes are read again", s.state.outsideCalls > before.outside, `${before.outside} -> ${s.state.outsideCalls}`);
  const drawer = await waitUntil(async () => s.state.activeFresh > before.fresh);
  check("attach: the claims drawer re-reads its counts fresh (not from the one-minute cache)", drawer, `fresh reads ${s.state.activeFresh}`);
  await s.p.screenshot({ path: `${OUT}/after-attach.png` });
  await s.ctx.close();
}

await browser.close();
check("no page errors or dialogs (Google Maps key errors aside)", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
