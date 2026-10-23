// Browser checks for the live-status build: hover <-> pin, legend, account manager, claim cheat-sheet,
// list/panel chips, bad-link report, other-claims warning, and the scroll behaviour of the left column
// and the panel (desktop sizes, phone, and framed in an iframe the way Monday embeds it).
//
// Everything the app reads is mocked with fictional data (properties, claims, flag-link, add), so it runs
// against any build and writes nothing. Google Maps itself is real (the pins are drawn by it).
//
//   BASE=http://localhost:3022 node tests/browser/live-status.mjs [screenshot-dir]
//
// playwright-core is resolved from node_modules, then from PW_CORE (a path to its index.mjs).
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3022";
const OUT = process.argv[2] ?? "test-results/live-status";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PW_CORE = process.env.PW_CORE ?? "/tmp/claude-0/-home-user-Interactive-map/519172db-2710-58fd-844f-0ffa565c5e27/scratchpad/pw/node_modules/playwright-core/index.mjs";
const { chromium } = await import("playwright-core").catch(() => import(PW_CORE));
fs.mkdirSync(OUT, { recursive: true });

// ---------- fixtures (fictional) ----------
const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const brief = {
  status: "Working on it", group: "New Housing Request", receivedOn: "2026-10-19", moveIn: "2026-11-02", leaseMonths: 3,
  frv: 3000, adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, petDescription: "One small dog, 20 lb",
  utilityCap: 250, specialRequests: "Needs a ground-floor bedroom for a family member who cannot use stairs.\nPrefers a fenced yard.",
  accountManager: "Melissa C.", searcher: "Demo Searcher", coordinator: "Demo Coordinator", company: "Alacrity",
};
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-2001", loss: LOSS, needs, attached: [], attachedPins: [], brief };
const claims = [
  { id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." },
  { id: "100000002", name: "Other Family — #7", lossAddress: "5 Sample Rd, Tulsa, OK", lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-18T15:00:00Z", status: "Working on it", attachedCount: 2, group: "Waiting Adjuster approval", isTest: false, accountManager: null },
];
const OTHER = { subitemId: "9001", claimId: "100000002", claimName: "Other Family — #7", status: "Option Submitted" };
const OTHER2 = { subitemId: "9002", claimId: "100000003", claimName: "Third Family — #9", status: "Awaiting Response" };
const SAME = { subitemId: "9003", claimId: CLAIM_ID, claimName: claim.name, status: "To Do" };

// 5 x 5 grid, 0.07 degrees apart, so the clusterer leaves each pin on its own at the opening zoom.
let seq = 0;
function pin(id, over = {}) {
  const i = seq++;
  const gx = (i % 5) - 2;
  const gy = Math.floor((i % 25) / 5) - 2;
  return {
    monday_item_id: String(id), name: `Fixture ${id}`, lat: LOSS.lat + gy * 0.07, lng: LOSS.lng + gx * 0.07, group_title: "Fixture group",
    addable: true, bedrooms: 3, bathrooms: 2, monthly_rate: 2000 + i * 10, pet_status: "yes", has_photos: true, available_from: null,
    distance_miles: 1 + i * 0.3, approximate: false, map_status: "yellow",
    availability: null, availability_checked: null, last_contact: null, link_status: null, other_claims: [], ...over,
  };
}
const pins = [
  pin(3001, { map_status: "green", availability: "Available Now", availability_checked: "2026-10-22", last_contact: "2026-10-05", link_status: "Good link" }),
  pin(3002, { availability: "Available Soon", other_claims: [OTHER] }),
  pin(3003, { availability: "Available (Unverified)", other_claims: [OTHER, OTHER2], link_status: "BAD LINK" }),
  pin(3004, { availability: "Unavailable" }),
  pin(3005, { availability: "Listing Removed" }),
  pin(3006, { other_claims: [SAME] }),
  pin(3007, { map_status: "red", other_claims: [OTHER] }),
  pin(3008, { availability: "Check Failed" }),
  ...Array.from({ length: 16 }, (_, k) => pin(3100 + k)),
  pin(3099, { distance_miles: 9.6 }), // last in the list order, on the map's far corner
];
// An API that has not shipped the new fields yet: the row must still render, without chips.
const oldShape = { ...pin(3010), lat: LOSS.lat + 0.0005, lng: LOSS.lng }; // sits in the filler pile
for (const k of ["availability", "availability_checked", "last_contact", "link_status", "other_claims"]) delete oldShape[k];
pins.push(oldShape);
// Filler that shares a spot, so it clusters: it only makes the list long.
for (let k = 0; k < 30; k++) pins.push({ ...pin(3200 + k), lat: LOSS.lat + 0.001 * k, lng: LOSS.lng + 0.001 * k, distance_miles: 2 + k * 0.2 });
const byId = new Map(pins.map((p) => [p.monday_item_id, p]));

function detail(p) {
  const d = {
    monday_item_id: p.monday_item_id, name: p.name, group_id: "g", group_title: p.group_title, address: `${p.monday_item_id} Fixture Ln`, city: "Tulsa", state: "OK", zipcode: "74133",
    lat: p.lat, lng: p.lng, bedrooms: 3, bathrooms: 2, monthly_rate: p.monthly_rate, pet_status: "yes", property_type: "House", sqft: 1800, furnished: "No", fenced_yard: "Yes",
    next_availability: "2026-11-01", last_contact: p.last_contact ?? null, ntv: null, property_link: `https://example.com/listing/${p.monday_item_id}`, photo_folder_url: "https://example.com/photos",
    owner_name: "Demo Owner", owner_phone: "(918) 555-0100", owner_email: "owner@example.com",
    notes: "Fixture note. ".repeat(40), security_deposit: 2000, cleaning_fee: 150, admin_fee: 100, application_fee: 50, move_in_fee: 0, pet_rent: 25, pet_deposit: 300, pet_fee: 0,
    other_fee_1: null, other_fee_1_desc: null, other_fee_2: null, other_fee_2_desc: null, move_in_total: 4500,
    landlord_item_id: null, landlord_name: "Demo PM", landlord_phone: null, landlord_contact: null, landlord_type: "PM", landlord_approval: "Approved", landlord_approval_note: null,
    geocode_status: "ok", location_precision: "exact", map_status: p.map_status, map_reason: p.map_status === "green" ? "used_before" : p.map_status === "red" ? "dnu_group" : "none",
    synced_at: "2026-10-22T12:00:00Z", updated_at: "2026-10-22T12:00:00Z",
  };
  // 3002's detail omits the new fields on purpose: the panel must fall back to the list's copy.
  if (p.monday_item_id !== "3002") Object.assign(d, { availability: p.availability, availability_checked: p.availability_checked, link_status: p.link_status, other_claims: p.other_claims });
  return d;
}

// ---------- harness ----------
const errors = [];
const failures = [];
const check = (name, ok, extra = "") => {
  (ok ? console.log : (m) => { console.log(m); failures.push(name); })(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, { w, h, theme = "light", iframe = false, reporter = "Tester" }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const state = { flag: { status: 200, body: null, calls: 0 }, adds: [] };
  await ctx.addInitScript(([t, name]) => {
    try {
      localStorage.setItem("nh-theme", t);
      if (name && !localStorage.getItem("nh-reporter-name")) localStorage.setItem("nh-reporter-name", name);
    } catch {}
  }, [theme, reporter]);
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: false } }));
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims, count: claims.length } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: claim }));
  await ctx.route("**/api/properties?**", (r) => r.fulfill({ json: { pins, coverage: { mappable: 90, unmapped: 10 } } }));
  await ctx.route(/\/api\/properties\/\d+$/, (r) => r.fulfill({ json: detail(byId.get(r.request().url().split("/").pop())) }));
  await ctx.route(/\/api\/properties\/\d+\/flag-link$/, async (r) => {
    state.flag.calls++;
    state.flag.body = r.request().postDataJSON();
    if (state.flag.status === 200) await r.fulfill({ json: { ok: true, alreadyFlagged: false } });
    else await r.fulfill({ status: state.flag.status, json: { error: "Too many reports. Try again in a few minutes." } });
  });
  await ctx.route("**/api/claim/add", async (r) => {
    state.adds.push(r.request().postDataJSON());
    await r.fulfill({ json: { ok: true, subitemId: "8001", alreadyAttached: false } });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(m.text()); });
  p.on("dialog", (d) => { errors.push(`unexpected ${d.type()} dialog: ${d.message()}`); void d.dismiss(); });
  await p.goto(iframe ? `${BASE}/embed-test.html` : `${BASE}/?claimId=${CLAIM_ID}`, { waitUntil: "networkidle" });
  const root = iframe ? p.frameLocator("iframe") : p;
  await root.locator("[data-pin-row]:visible, button:has-text('within')").first().waitFor();
  await p.waitForTimeout(4500); // Google Maps draws the pins
  return { ctx, p, root, state, phone: w < 1024 };
}

const results = (root) => root.locator('ul[aria-label="Results"]:visible').first();
const panel = (root) => root.locator('aside[aria-label="Property details"]:visible').first();

async function openList(s) {
  if (s.phone && !(await results(s.root).count())) {
    await s.root.getByRole("button", { name: /within/ }).first().click();
    await s.root.locator('ul[aria-label="Results"]:visible').first().waitFor();
  }
}
async function selectRow(s, id) {
  await openList(s);
  await s.root.locator(`[data-pin-row="${id}"]:visible`).first().scrollIntoViewIfNeeded();
  await s.root.locator(`[data-pin-row="${id}"]:visible`).first().click();
  await panel(s.root).getByRole("heading", { name: `Fixture ${id}` }).waitFor();
}
async function wheelMoves(p, loc) {
  const box = await loc.boundingBox();
  if (!box || box.height < 1) return { moved: false, before: 0, after: 0 };
  const before = await loc.evaluate((e) => e.scrollTop);
  await p.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 60));
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(250);
  const after = await loc.evaluate((e) => e.scrollTop);
  return { moved: after > before, before, after };
}
const pageMetrics = (root) =>
  root.locator("body").evaluate(() => {
    const se = document.scrollingElement;
    return { innerHeight, innerWidth, scrollHeight: se.scrollHeight, scrollWidth: se.scrollWidth, scrollY: se.scrollTop };
  });

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

// ===================================================================================================
// Desktop, light: chips, legend, account manager, cheat-sheet, hover, panel, warning
// ===================================================================================================
{
  const s = await open(browser, { w: 1440, h: 860 });
  const { p, root } = s;
  const row = (id) => root.locator(`[data-pin-row="${id}"]:visible`).first();
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

  // ---- 5. list chips ----
  const t1 = await text(row(3001));
  check("row: Available now (green) and Last contact 5 Oct", t1.includes("Available now") && t1.includes("Last contact 5 Oct") && !t1.includes("Bad link"), t1);
  check("row: Available now chip is green text", await row(3001).locator(".nh-chip--ok").count() === 1);
  const t2 = await text(row(3002));
  check("row: Available soon (blue) and 'On claim <name> · <status>' amber chip", t2.includes("Available soon") && t2.includes("On claim Other Family — #7 · Option Submitted"), t2);
  check("row: Available soon is blue, claim chip is amber", (await row(3002).locator(".nh-chip--info").count()) === 1 && (await row(3002).locator(".nh-chip--amber").count()) === 1);
  const t3 = await text(row(3003));
  check("row: Unverified, 'On 2 claims' and a red-outline Bad link chip", t3.includes("Unverified") && t3.includes("On 2 claims") && t3.includes("Bad link") && (await row(3003).locator(".nh-chip--bad.nh-chip--outline").count()) === 1, t3);
  check("row: Unavailable is red", (await text(row(3004))).includes("Unavailable") && (await row(3004).locator(".nh-chip--bad").count()) === 1);
  check("row: Listing removed is muted and struck through", (await text(row(3005))).includes("Listing removed") && (await row(3005).locator(".nh-chip--muted.nh-chip--strike").count()) === 1);
  check("row: an option on the current claim only gives no claim chip", !(await text(row(3006))).includes("On claim"));
  check("row: Check Failed gives no chip", (await row(3008).locator(".nh-chip").count()) === 0);
  check("row: a pin without the new fields (older API) renders with no chips", (await row(3010).count()) === 1 && (await row(3010).locator(".nh-chip").count()) === 0);

  // ---- 2. legend ----
  const legend = await text(root.locator('[aria-label="Dot colours"]'));
  check("filter legend: On this claim and 'Nearby grouped · zoom in to split' with a 7", legend.includes("On this claim") && legend.includes("Nearby grouped · zoom in to split") && legend.includes("7"), legend);
  check("filter legend: the three colour chips are still toggle buttons", (await root.locator('[aria-label="Dot colours"] button[aria-pressed]').count()) === 3);
  check("filter legend: the two new entries are not clickable", (await root.locator('[aria-label="Dot colours"] button').count()) === 3);
  const mapLegend = await text(root.locator("div.absolute.bottom-3.left-3").first());
  check("map legend: same two entries", mapLegend.includes("On this claim") && mapLegend.includes("Nearby grouped · zoom in to split"), mapLegend);

  // ---- 3. account manager ----
  await root.getByRole("button", { name: "Active claims" }).click();
  await root.locator('[role="dialog"]').getByText("Melissa C.").waitFor();
  check("claims drawer shows the account manager on the row", (await text(root.locator('[role="dialog"]'))).includes("Melissa C."));
  await p.screenshot({ path: `${OUT}/drawer-account-manager.png` });
  await p.keyboard.press("Escape");

  // ---- 4. cheat-sheet ----
  const glance = await text(root.locator('[aria-label="Claim at a glance"]'));
  check("cheat-sheet strip is always visible and complete", glance === "2 adults · 1 child · 1 pet · 3 bd / 2 ba · move-in 2 Nov", glance);
  const det = root.locator("details", { hasText: "Claim information" }).first();
  check("Claim information stays collapsed by default", (await det.evaluate((e) => e.open)) === false);
  const bl = await det.evaluate((e) => getComputedStyle(e).borderLeftWidth);
  const fw = await det.locator("summary").evaluate((e) => Number(getComputedStyle(e).fontWeight));
  check("Claim information has an accent left border and a bold label", bl === "3px" && fw >= 600, `${bl} / ${fw}`);
  await p.screenshot({ path: `${OUT}/desktop-light.png` });

  // ---- 1. hover: list -> pin ----
  const pinEl = (id) => root.locator(`.nh-pin[aria-label^="Fixture ${id},"]`).first();
  const hovered = () => root.locator(".nh-pin--hover").count();
  await row(3001).hover();
  await p.waitForTimeout(250);
  check("hover a list row: exactly that pin gets the hover ring", (await hovered()) === 1 && (await pinEl(3001).evaluate((e) => e.classList.contains("nh-pin--hover"))));
  const scale = await pinEl(3001).evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a);
  check("hovered pin is scaled up 1.25", Math.abs(scale - 1.25) < 0.02, String(scale));
  await p.screenshot({ path: `${OUT}/hover-list-to-pin.png` });
  await p.mouse.move(700, 5);
  await p.waitForTimeout(250);
  check("leaving the row clears the pin highlight", (await hovered()) === 0);
  await row(3002).focus();
  await p.waitForTimeout(250);
  check("focusing a row by keyboard behaves like hover", (await pinEl(3002).evaluate((e) => e.classList.contains("nh-pin--hover"))));
  await root.locator("body").evaluate(() => document.activeElement && document.activeElement.blur());

  // ---- 1. hover: pin -> row, with scroll ----
  const ul = results(root);
  await ul.evaluate((e) => (e.scrollTop = 0));
  const rowBox0 = await row(3099).boundingBox();
  const ulBox = await ul.boundingBox();
  check("precondition: the 3099 row starts below the fold", !rowBox0 || rowBox0.y > ulBox.y + ulBox.height);
  await pinEl(3099).hover();
  await p.waitForTimeout(400);
  const rowBox1 = await row(3099).boundingBox();
  check("hover a pin on the map: its row is highlighted and scrolled into view",
    (await row(3099).evaluate((e) => e.classList.contains("nh-row--hover"))) && !!rowBox1 && rowBox1.y >= ulBox.y - 1 && rowBox1.y + rowBox1.height <= ulBox.y + ulBox.height + 1,
    JSON.stringify(rowBox1));
  await p.screenshot({ path: `${OUT}/hover-pin-to-list.png` });
  check("page did not scroll from that", (await pageMetrics(root)).scrollY === 0);

  // ---- 1. hover: off-screen pin -> panTo, no zoom ----
  const a = await pinEl(3004).boundingBox();
  const b = await pinEl(3005).boundingBox();
  const gap0 = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : -1;
  await p.mouse.move(900, 400);
  await p.mouse.down();
  await p.mouse.move(900, 400 - 700, { steps: 12 });
  await p.mouse.move(900 - 600, 400 - 700, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(600);
  const off = await pinEl(3001).boundingBox();
  const mapBox = await root.locator('[aria-label="Property map"]').boundingBox();
  const offscreen = !off || off.y + off.height < mapBox.y || off.y > mapBox.y + mapBox.height || off.x + off.width < mapBox.x || off.x > mapBox.x + mapBox.width;
  check("precondition: after dragging the map the pin is off screen", offscreen, JSON.stringify(off));
  await row(3001).hover();
  await p.waitForTimeout(1500);
  const on = await pinEl(3001).boundingBox();
  const inView = !!on && on.x >= mapBox.x && on.x + on.width <= mapBox.x + mapBox.width && on.y >= mapBox.y && on.y + on.height <= mapBox.y + mapBox.height;
  check("hover a row whose pin is off screen: the map pans to it", inView, JSON.stringify(on));
  const a2 = await pinEl(3004).boundingBox();
  const b2 = await pinEl(3005).boundingBox();
  const gap1 = a2 && b2 ? Math.hypot(a2.x - b2.x, a2.y - b2.y) : -2;
  check("panning did not change the zoom", gap0 > 0 && Math.abs(gap1 - gap0) < 2, `${gap0.toFixed(1)} -> ${gap1.toFixed(1)}`);
  await p.mouse.move(700, 5);

  // ---- 6. panel chips, other claims, bad link ----
  await selectRow(s, 3002);
  const pt = await text(panel(root));
  check("panel header: availability + other-claim chips (detail lacked the fields: list copy used)", pt.includes("Available soon") && pt.includes("On claim Other Family — #7 · Option Submitted"), pt.slice(0, 160));
  check("panel: Other claims block lists claimName · status", (await panel(root).locator("section", { hasText: "Other claims" }).innerText()).replace(/\s+/g, " ").includes("Other Family — #7 Option Submitted"));
  await p.screenshot({ path: `${OUT}/panel-other-claims.png` });

  // ---- 7. add warning ----
  const addBtn = () => panel(root).getByRole("button", { name: /Add to claim/ });
  await addBtn().click();
  const warn = panel(root).getByRole("alert").filter({ hasText: "Already an option on" });
  await warn.waitFor();
  check("add warning: names the claim and its status", (await text(warn)).includes("Already an option on Other Family — #7 (Option Submitted). Add anyway?"), await text(warn));
  check("add warning: nothing sent yet, Cancel has focus", s.state.adds.length === 0 && (await panel(root).getByRole("button", { name: "Cancel" }).evaluate((e) => e === document.activeElement)));
  await p.screenshot({ path: `${OUT}/add-warning.png` });
  await panel(root).getByRole("button", { name: "Cancel" }).click();
  check("add warning: Cancel closes it and sends nothing", (await warn.count()) === 0 && s.state.adds.length === 0);
  await addBtn().click();
  await panel(root).getByRole("button", { name: "Add anyway" }).click();
  await panel(root).getByText("On this claim").first().waitFor();
  check("add warning: Add anyway adds as today", s.state.adds.length === 1 && s.state.adds[0].propertyId === "3002" && s.state.adds[0].claimId === CLAIM_ID, JSON.stringify(s.state.adds));

  await selectRow(s, 3006);
  await addBtn().click();
  await panel(root).getByText("On this claim").first().waitFor();
  check("no warning when the only other option is on this same claim", s.state.adds.length === 2 && s.state.adds[1].propertyId === "3006");

  await selectRow(s, 3007);
  check("red property with other claims stays blocked", await panel(root).getByRole("button", { name: /DO NOT USE/ }).isDisabled());

  // Account manager in the panel footer
  await selectRow(s, 3001);
  check("panel footer: 'Adding to <claim> · <account manager>'", (await text(panel(root))).includes(`Adding to: ${claim.name} · Melissa C.`));

  // bad link already set: struck listing, badge, no Report button
  await selectRow(s, 3003);
  const listing = panel(root).getByRole("link", { name: "Listing" });
  check("BAD LINK property: listing struck through with a Bad link badge", (await listing.evaluate((e) => getComputedStyle(e).textDecorationLine)).includes("line-through") && (await text(panel(root).locator("section", { hasText: "Notes & links" }))).includes("Bad link"));
  check("BAD LINK property: no Report button", (await panel(root).getByRole("button", { name: "Report bad link" }).count()) === 0);

  // ---- 6. report bad link ----
  await selectRow(s, 3001);
  const report = panel(root).getByRole("button", { name: "Report bad link" });
  await report.scrollIntoViewIfNeeded();
  await report.click();
  const form = panel(root).getByRole("form", { name: "Report bad link" });
  check("report form: name prefilled from nh-reporter-name", (await form.getByLabel("Your name").inputValue()) === "Tester");
  await p.keyboard.press("Escape");
  check("report form: Escape cancels", (await form.count()) === 0 && (await report.evaluate((e) => e === document.activeElement)));
  await report.click();
  await form.getByLabel("Your name").fill("Lou");
  await form.getByLabel(/What's wrong/).fill("Listing 404s");
  s.state.flag.status = 429;
  await form.getByRole("button", { name: "Send" }).click();
  await form.getByRole("alert").waitFor();
  check("report form: an error shows inline (no alert dialog) and the form stays open", (await text(form.getByRole("alert"))).includes("Too many reports") && (await form.count()) === 1);
  s.state.flag.status = 200;
  await form.getByRole("button", { name: "Send" }).click();
  await panel(root).getByText("Reported. Thanks.").waitFor();
  check("report form: POST carried reportedBy and note", JSON.stringify(s.state.flag.body) === JSON.stringify({ reportedBy: "Lou", note: "Listing 404s" }), JSON.stringify(s.state.flag.body));
  check("report form: UI flipped at once (struck listing, badge, no button, thanks)",
    (await panel(root).getByRole("button", { name: "Report bad link" }).count()) === 0 &&
      (await panel(root).getByRole("link", { name: "Listing" }).evaluate((e) => getComputedStyle(e).textDecorationLine)).includes("line-through") &&
      (await text(panel(root))).includes("Bad link"));
  check("report form: the reporter's name was remembered", (await p.evaluate(() => localStorage.getItem("nh-reporter-name"))) === "Lou");
  check("report form: the list row got the Bad link chip", (await text(row(3001))).includes("Bad link"));
  await p.screenshot({ path: `${OUT}/panel-reported.png` });

  check("no unexpected dialogs or page errors so far", errors.length === 0, errors.slice(0, 3).join(" | "));
  await s.ctx.close();
}

// ===================================================================================================
// Scroll (Lou): results list scrolls, nothing overflows, the page never scrolls, panel scrolls
// ===================================================================================================
const CASES = [
  { w: 1440, h: 860 },
  { w: 1366, h: 650 },
  { w: 1280, h: 600 },
  { w: 390, h: 844 },
  { w: 1280, h: 800, iframe: true }, // embed-test.html frames the app at 100% x 600px
];
for (const c of CASES) {
  for (const brief of [false, true]) {
    const label = `${c.w}x${c.h}${c.iframe ? " in iframe (100% x 600)" : ""}, claim information ${brief ? "open" : "closed"}`;
    const s = await open(browser, c);
    const { p, root } = s;
    await openList(s);
    if (brief) await root.locator("summary:visible", { hasText: "Claim information" }).first().click();
    await p.waitForTimeout(200);
    const ul = results(root);
    const m = await ul.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    const w = await wheelMoves(p, ul);
    const pm = await pageMetrics(root);
    check(`scroll [${label}]: results list is tall enough to use and scrolls`, m.sh > m.ch && m.ch >= 150 && w.moved, `list ${m.ch}/${m.sh}, wheel ${w.before}->${w.after}`);
    check(`scroll [${label}]: page does not scroll or overflow`, pm.scrollHeight <= pm.innerHeight && pm.scrollWidth <= pm.innerWidth && pm.scrollY === 0, JSON.stringify(pm));
    if (brief) {
      const rows = await root.locator("[data-pin-row]:visible").first().boundingBox();
      check(`scroll [${label}]: first result row is on screen`, !!rows && rows.y + rows.height <= pm.innerHeight, JSON.stringify(rows));
      await p.screenshot({ path: `${OUT}/scroll-${c.w}x${c.h}${c.iframe ? "-iframe" : ""}-brief-open.png` });
    }
    // property panel
    await selectRow(s, 3003);
    const body = panel(root).locator(".nh-scroll").first();
    const bm = await body.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    const bw = await wheelMoves(p, body);
    const foot = await panel(root).getByRole("button", { name: /Add to claim/ }).boundingBox();
    const pm2 = await pageMetrics(root);
    check(`scroll [${label}]: panel body scrolls and the footer stays on screen`, bm.sh > bm.ch && bw.moved && !!foot && foot.y + foot.height <= pm2.innerHeight, `body ${bm.ch}/${bm.sh}, wheel ${bw.before}->${bw.after}, footer ${JSON.stringify(foot)}`);
    check(`scroll [${label}]: still no page scroll with the panel open`, pm2.scrollHeight <= pm2.innerHeight && pm2.scrollWidth <= pm2.innerWidth && pm2.scrollY === 0, JSON.stringify(pm2));
    if (brief && c.w === 390) await p.screenshot({ path: `${OUT}/phone-panel.png` });
    await s.ctx.close();
  }
}

// ===================================================================================================
// Phone, dark
// ===================================================================================================
{
  const s = await open(browser, { w: 390, h: 844, theme: "dark" });
  const { p, root } = s;
  const pm = await pageMetrics(root);
  check("phone: no sideways scrolling", pm.scrollWidth <= pm.innerWidth, JSON.stringify(pm));
  await openList(s);
  const sheetW = await root.locator("div.rounded-t-xl").first().evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  check("phone: results sheet has no sideways scroll", sheetW.sw <= sheetW.cw, JSON.stringify(sheetW));
  const okInk = await root.locator(".nh-chip--ok").first().evaluate((e) => getComputedStyle(e).color);
  const amberBg = await root.locator(".nh-chip--amber").first().evaluate((e) => getComputedStyle(e).backgroundColor);
  check("dark: chips use the dark tokens", okInk === "rgb(23, 201, 100)" && amberBg === "rgb(42, 31, 6)", `${okInk} / ${amberBg}`);
  check("dark: theme is dark", (await root.locator("html").getAttribute("data-theme")) === "dark");
  await p.screenshot({ path: `${OUT}/phone-dark-list.png` });
  await selectRow(s, 3003);
  await p.screenshot({ path: `${OUT}/phone-dark-panel.png` });
  const pm2 = await pageMetrics(root);
  check("phone: no sideways scrolling with the panel open", pm2.scrollWidth <= pm2.innerWidth, JSON.stringify(pm2));
  await s.ctx.close();
}
{
  const s = await open(browser, { w: 1440, h: 860, theme: "dark" });
  await selectRow(s, 3002);
  await s.p.screenshot({ path: `${OUT}/desktop-dark.png` });
  await s.root.locator(`.nh-pin[aria-label^="Fixture 3004,"]`).first().hover();
  await s.p.waitForTimeout(300);
  await s.p.screenshot({ path: `${OUT}/desktop-dark-hover.png` });
  await s.ctx.close();
}

await browser.close();
check("no page errors or dialogs", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
