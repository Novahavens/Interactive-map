// "Owner said" on the property panel (what an owner said on a call, from Quo's AI summary) and Update Monday,
// which opens the Edit form filled in from that call.
//
// Everything the app reads is mocked with fictional data (properties, claim, health, the owner-said and edit
// routes), so it runs against any build and writes nothing. Google Maps itself is real. The clock is fixed at
// 2026-10-28 and the browser runs on Central time (the team's).
//
//   BASE=http://localhost:3032 node tests/browser/owner-said.mjs [screenshot-dir]
//
// playwright-core is resolved from node_modules, then from PW_CORE (a path to its index.mjs). With SHOTS=1 the
// two README screenshots are written to docs/screenshots as well.
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3032";
const OUT = process.argv[2] ?? "test-results/owner-said";
const DOCS = process.env.SHOTS === "1" ? "docs/screenshots" : null;
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const { chromium } = await import("playwright-core").catch(() =>
  process.env.PW_CORE ? import(process.env.PW_CORE) : Promise.reject(new Error("playwright-core isn't installed; set PW_CORE to its index.mjs")),
);
fs.mkdirSync(OUT, { recursive: true });

// ---------- fixtures (fictional) ----------
const NOW = new Date("2026-10-28T15:00:00Z");
const TZ = "America/Chicago";
const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-2001", loss: LOSS, needs, attached: [], attachedPins: [], brief: { accountManager: "Melissa C." } };
const claims = [
  { id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." },
];

let seq = 0;
function pin(id, over = {}) {
  const i = seq++;
  return {
    monday_item_id: String(id), name: `Fixture ${id}`, lat: LOSS.lat + (Math.floor(i / 3) - 1) * 0.06, lng: LOSS.lng + ((i % 3) - 1) * 0.06, group_title: "Fixture group",
    addable: true, bedrooms: 3, bathrooms: 2, monthly_rate: 2000, pet_status: "yes", has_photos: true, available_from: null,
    distance_miles: 1 + i * 0.3, approximate: false, map_status: "yellow",
    availability: null, availability_checked: null, last_contact: null, link_status: null, other_claims: [], ...over,
  };
}
// 5001: three calls, facts that differ, a shared number. 5002: every fact already in Monday. 5003: applied.
// 5004: the route fails. 5005: no calls. 5006: switched off. 5007: no phone at all. 5008: the other chips.
const pins = [
  pin(5001, { pet_status: "N/D" }),
  pin(5002, { monthly_rate: 2100 }),
  pin(5003),
  pin(5004),
  pin(5005),
  pin(5006),
  pin(5007),
  pin(5008, { pet_status: "yes" }),
];

function makeDetail(p) {
  return {
    monday_item_id: p.monday_item_id, name: p.name, group_id: "g", group_title: p.group_title, address: `${p.monday_item_id} Fixture Ln`, city: "Tulsa", state: "OK", zipcode: "74133",
    lat: p.lat, lng: p.lng, bedrooms: p.bedrooms, bathrooms: p.bathrooms, monthly_rate: p.monthly_rate, pet_status: p.pet_status, property_type: "House", sqft: 1800, furnished: "No", fenced_yard: "Yes",
    next_availability: p.available_from, last_contact: null, ntv: null, property_link: `https://example.com/listing/${p.monday_item_id}`, photo_folder_url: null,
    owner_name: "Demo Owner", owner_phone: p.monday_item_id === "5007" ? null : "(918) 555-0100", owner_email: null,
    notes: "Two-car garage.", security_deposit: 2000, cleaning_fee: 150, admin_fee: 100, application_fee: 50, move_in_fee: null, pet_rent: 25, pet_deposit: 300, pet_fee: null,
    other_fee_1: null, other_fee_1_desc: null, other_fee_2: null, other_fee_2_desc: null, move_in_total: 4600,
    landlord_item_id: null, landlord_name: null, landlord_phone: null, landlord_contact: null, landlord_type: null, landlord_approval: null, landlord_approval_note: null,
    geocode_status: "ok", location_precision: "exact", map_status: p.map_status, map_reason: "none",
    availability: p.availability, availability_checked: p.availability_checked, link_status: null, other_claims: [],
    synced_at: "2026-10-22T12:00:00Z", updated_at: "2026-10-22T12:00:00Z",
  };
}

const LONG =
  "The owner confirmed the house will be free from November 1 and said she can hold it for a family displaced by a kitchen fire if the paperwork reaches her by Friday.";
const RENT = "Rent is $2,400 a month with a $500 deposit.";
const PETS = "Pets are welcome, with $35 a month pet rent.";
const FURN = "It comes fully furnished.";
const call = (o) => ({ by: null, durationSec: null, propertyCount: 1, summary: [], nextSteps: [], facts: [], applied: null, ...o });
const SAID = {
  5001: {
    enabled: true,
    calls: [
      call({
        callId: "ACdemo5001c", at: "2026-10-27T20:00:00Z", by: "Will", durationSec: 190, propertyCount: 2,
        summary: [LONG, RENT, PETS, FURN],
        nextSteps: ["Send the lease packet to the owner", "Confirm the move-in date with the adjuster"],
        facts: [
          { key: "next_availability", value: "2026-11-01", evidence: LONG },
          { key: "monthly_rate", value: 2400, evidence: RENT },
          { key: "security_deposit", value: 500, evidence: RENT },
          { key: "pet_status", value: "Yes", evidence: PETS },
          { key: "pet_rent", value: 35, evidence: PETS },
          { key: "furnished", value: "Yes", evidence: FURN },
        ],
      }),
      call({
        callId: "ACdemo5001b", at: "2026-10-22T15:30:00Z", by: "Virginia", durationSec: 75,
        summary: ["Owner said the tenants move out at the end of October. She expects to ask about $2,500 a month."],
        facts: [{ key: "monthly_rate", value: 2500, evidence: "She expects to ask about $2,500 a month." }],
      }),
      call({ callId: "ACdemo5001a", at: "2026-10-15T14:00:00Z", durationSec: 40, summary: ["Left the owner the team's details and asked for a call back."] }),
    ],
  },
  5002: {
    enabled: true,
    calls: [
      call({
        callId: "ACdemo5002a", at: "2026-10-26T16:00:00Z", by: "Will", durationSec: 120,
        summary: ["Rent stays at $2,100 a month.", "Pets are fine."],
        facts: [
          { key: "monthly_rate", value: 2100, evidence: "Rent stays at $2,100 a month." },
          { key: "pet_status", value: "Yes", evidence: "Pets are fine." },
        ],
      }),
    ],
  },
  5003: {
    enabled: true,
    calls: [
      call({
        callId: "ACdemo5003a", at: "2026-10-27T17:00:00Z", by: "Will", durationSec: 200,
        summary: ["Rent goes up to $2,600 a month."],
        facts: [{ key: "monthly_rate", value: 2600, evidence: "Rent goes up to $2,600 a month." }],
        applied: { by: "Fazal", at: "2026-10-28T14:00:00Z", fields: ["monthly_rate"] },
      }),
    ],
  },
  5005: { enabled: true, calls: [] },
  5006: { enabled: false, calls: SAID_OFF() },
  5008: {
    enabled: true,
    calls: [
      call({
        callId: "ACdemo5008a", at: "2026-10-20T16:00:00Z",
        summary: ["It's available now, unfurnished.", "No pets, but a $300 pet deposit and a $150 pet fee apply to service animals' cleaning."],
        facts: [
          { key: "next_availability", value: "2026-10-20", evidence: "It's available now, unfurnished." },
          { key: "pet_status", value: "No", evidence: "No pets." },
          { key: "pet_deposit", value: 300, evidence: "$300 pet deposit" },
          { key: "pet_fee", value: 150, evidence: "$150 pet fee" },
          { key: "furnished", value: "No", evidence: "It's available now, unfurnished." },
        ],
      }),
    ],
  },
};
// A switched-off route can still carry rows; the card must not show them.
function SAID_OFF() {
  return [call({ callId: "ACdemo5006a", at: "2026-10-27T17:00:00Z", summary: ["Should never show."], facts: [{ key: "monthly_rate", value: 9999, evidence: "x" }] })];
}

// ---------- harness ----------
const errors = [];
const failures = [];
let passes = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (ok) passes++;
  else failures.push(name);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

async function open(browser, { w = 1440, h = 900, theme = "light", touch = false, editing = true, quo = true, reporter = "Pat Tester" } = {}) {
  const ctx = await browser.newContext({
    timezoneId: TZ,
    ...(touch ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h }, deviceScaleFactor: 2 }),
  });
  const details = new Map(pins.map((p) => [p.monday_item_id, makeDetail(p)]));
  const said = structuredClone(SAID);
  const state = { details, said, saidGets: {}, saidDelay: 0, posts: [] };
  await ctx.addInitScript(
    ({ t, r }) => {
      try {
        localStorage.setItem("nh-theme", t);
        localStorage.setItem("nh-reporter-name", r);
      } catch {}
    },
    { t: theme, r: reporter },
  );
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: false, quo, editing } }));
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims, count: 1 } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: claim }));
  await ctx.route("**/api/properties?**", (r) => r.fulfill({ json: { pins, coverage: { mappable: 90, unmapped: 10 } } }));
  await ctx.route(/\/api\/properties\/\d+$/, (r) => r.fulfill({ json: details.get(r.request().url().split("/").pop()) }));
  await ctx.route(/\/api\/properties\/\d+\/contact$/, (r) => r.fulfill({ json: { enabled: true, numbers: [], digest: null } }));
  await ctx.route(/\/api\/properties\/\d+\/owner-said$/, async (r) => {
    const id = r.request().url().split("/").slice(-2)[0];
    state.saidGets[id] = (state.saidGets[id] ?? 0) + 1;
    if (state.saidDelay) await new Promise((res) => setTimeout(res, state.saidDelay));
    if (id === "5004") return r.fulfill({ status: 502, json: { error: "Could not load call summaries", code: "db_error" } });
    return r.fulfill({ json: said[id] ?? { enabled: true, calls: [] } });
  });
  // The edit route: applies the changes; a save naming a call marks that call applied, as the server does.
  await ctx.route(/\/api\/properties\/\d+\/edit$/, async (r) => {
    const id = r.request().url().split("/").slice(-2)[0];
    const body = r.request().postDataJSON();
    state.posts.push(body);
    const next = { ...details.get(id), ...body.changes };
    details.set(id, next);
    const c = body.source && said[id]?.calls.find((x) => x.callId === body.source.callId);
    if (c) c.applied = { by: body.editor, at: NOW.toISOString(), fields: Object.keys(body.changes) };
    return r.fulfill({ json: { ok: true, detail: next, noted: true, mirrored: true, unconfirmed: [], alreadySaved: false } });
  });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(m.text());
    if (/hydrat/i.test(m.text())) errors.push(`hydration: ${m.text()}`);
  });
  await p.goto(`${BASE}/?claimId=${CLAIM_ID}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  const phone = w < 1024;
  if (phone) {
    await p.getByRole("button", { name: /within/ }).first().click();
    await p.locator('ul[aria-label="Results"]:visible').first().waitFor();
  }
  return { ctx, p, state, phone };
}
const panel = (p) => p.locator('aside[aria-label="Property details"]:visible').first();
const row = (p, id) => p.locator(`[id="row-${id}"]:visible`).first();
async function selectRow(s, id) {
  if (s.phone && !(await s.p.locator('ul[aria-label="Results"]:visible').count())) {
    await s.p.getByRole("button", { name: /within/ }).first().click();
    await s.p.locator('ul[aria-label="Results"]:visible').first().waitFor();
  }
  await row(s.p, id).scrollIntoViewIfNeeded();
  await row(s.p, id).click();
  await panel(s.p).getByRole("heading", { name: `Fixture ${id}` }).waitFor();
  await panel(s.p).getByText("Contacts", { exact: true }).waitFor();
}
async function closePanel(s) {
  await panel(s.p).getByRole("button", { name: "Close panel" }).click();
  await s.p.waitForTimeout(150);
}
const card = (p) => panel(p).getByRole("group", { name: "Owner said" });
const updateBtn = (p) => card(p).getByRole("button", { name: "Update Monday" });
// every copy of the button in the page, the hidden panel mount included
const anyUpdate = (p) => p.locator("button", { hasText: "Update Monday" });
const chipTexts = (loc) => loc.locator("> ul[aria-label='Facts from the call'] > li").allInnerTexts();
const form = (p) => panel(p).getByRole("form", { name: "Edit listing details" });
const field = (p, label) => form(p).getByLabel(label, { exact: true });

// WCAG contrast from computed colours.
function parseColor(s) {
  let m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  m = /color\(srgb ([^)]+)\)/.exec(s);
  if (m) {
    const [r, g, b, a = "1"] = m[1].split(/[\s/]+/).filter(Boolean);
    return [Number(r) * 255, Number(g) * 255, Number(b) * 255, Number(a)];
  }
  return null;
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
function lum([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Lowest text contrast inside the card: every text-bearing element against its own background (or the card's). */
async function cardContrast(p) {
  const pairs = await card(p).evaluate((root) => {
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const b = getComputedStyle(e).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b;
      }
      return "rgb(255, 255, 255)";
    };
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      if (el.offsetParent === null) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) out.push({ fg: getComputedStyle(el).color, bg: bgOf(el), t: el.textContent.trim().slice(0, 30) });
    }
    return out;
  });
  let min = { ratio: 99 };
  for (const x of pairs) {
    const bg = parseColor(x.bg);
    const ratio = contrast(over(parseColor(x.fg), bg), bg);
    if (ratio < min.ratio) min = { ratio, ...x };
  }
  return min;
}
async function noOverflow(p) {
  return p.evaluate(() => {
    const aside = [...document.querySelectorAll('aside[aria-label="Property details"]')].find((e) => e.offsetParent !== null);
    const body = aside?.querySelector(".nh-scroll");
    const group = aside?.querySelector('[role="group"][aria-labelledby]');
    const gb = group?.getBoundingClientRect();
    const outside = group ? [...group.querySelectorAll("*")].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > gb.right + 1).length : -1;
    return {
      page: document.documentElement.scrollWidth <= window.innerWidth,
      body: body ? body.scrollWidth <= body.clientWidth : false,
      inCard: outside === 0,
      card: gb ? gb.right <= aside.getBoundingClientRect().right + 1 : false,
    };
  });
}

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

// ===================================================================================================
// 1. The card, desktop light: meta, text, More, chips, the shared-number hint, earlier calls
// ===================================================================================================
{
  const s = await open(browser);
  const { p, state } = s;
  await selectRow(s, "5001");
  await card(p).waitFor();
  const C = card(p);

  const contacts = panel(p).locator("section", { has: p.getByRole("heading", { name: "Contacts" }) });
  check("place: inside Contacts, right after the Quo contact history", await contacts.evaluate((sec) => {
    const digest = sec.querySelector("details");
    const group = sec.querySelector('[role="group"][aria-labelledby]');
    return !!digest && !!group && digest.nextElementSibling === group;
  }));
  // (innerText follows the heading's uppercase styling)
  const header = await text(C.locator("> div").first());
  check("meta: 'Owner said' and 'Oct 27 · Will's call · 3 min'", header === "OWNER SAID Oct 27 · Will's call · 3 min", header);
  const shown = await text(C.locator("> div").nth(1).locator("> p").first());
  check("text: the first two summary sentences", shown === `${LONG} ${RENT}`, shown);
  const more = C.getByRole("button", { name: "More" });
  check("More: a real button, collapsed (aria-expanded=false)", (await more.getAttribute("aria-expanded")) === "false");
  check("More: the rest is hidden until opened", !(await C.getByText(PETS).isVisible()) && !(await C.getByText("Next steps").isVisible()));
  const controls = await more.getAttribute("aria-controls");
  check("More: aria-controls names the hidden part, which exists while collapsed", !!controls && (await p.locator(`[id="${controls}"]`).count()) === 1);
  await more.click();
  check("More: aria-expanded=true once opened", (await more.getAttribute("aria-expanded")) === "true");
  const rest = await text(p.locator(`[id="${controls}"]`));
  check("More: the rest of the summary, then 'Next steps' as a list", rest === `${PETS} ${FURN} Next steps Send the lease packet to the owner Confirm the move-in date with the adjuster`, rest);
  check("More: next steps are list items", (await p.locator(`[id="${controls}"] li`).count()) === 2);
  await more.click();
  check("More: closes again", (await more.getAttribute("aria-expanded")) === "false" && !(await C.getByText(PETS).isVisible()));

  const chips = await chipTexts(C);
  const want = ["Available Nov 1", "$2,400/mo", "Deposit $500", "Pets OK", "Pet rent $35/mo", "Furnished"];
  check("chips: short facts in order", JSON.stringify(chips) === JSON.stringify(want), chips.join(" | "));
  const titles = await C.locator("> ul[aria-label='Facts from the call'] > li").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  check("chips: each has its evidence sentence as title", JSON.stringify(titles) === JSON.stringify([LONG, RENT, RENT, PETS, PETS, FURN]), titles.join(" | "));
  check("hint: 'This number is on 2 properties. Check the call was about this one.'", (await C.getByText("This number is on 2 properties. Check the call was about this one.", { exact: true }).count()) === 1);

  // Update Monday: a real button with a focus ring
  check("button: Update Monday shows (facts differ, editing on, no form open, not applied)", await updateBtn(p).isVisible());
  check("button: a <button type=button>", (await updateBtn(p).evaluate((e) => `${e.tagName}:${e.type}`)) === "BUTTON:button");
  await more.focus();
  await p.keyboard.press("Tab");
  const ring = await updateBtn(p).evaluate((e) => ({ focused: e === document.activeElement, style: getComputedStyle(e).outlineStyle, width: getComputedStyle(e).outlineWidth }));
  check("button: Tab reaches it and it shows a 2px focus ring", ring.focused && ring.style === "solid" && ring.width === "2px", JSON.stringify(ring));
  const ub = await updateBtn(p).boundingBox();
  const eb = await panel(p).getByRole("button", { name: "Edit", exact: true }).boundingBox();
  check("button: as tall as the panel's Edit button with a mouse", Math.abs(ub.height - eb.height) < 0.5, `${ub.height}/${eb.height}`);

  // earlier calls
  const earlier = C.getByRole("button", { name: "2 earlier calls" });
  check("earlier: '2 earlier calls' disclosure, collapsed", (await earlier.getAttribute("aria-expanded")) === "false");
  const list = p.locator(`[id="${await earlier.getAttribute("aria-controls")}"]`);
  check("earlier: hidden until opened", (await list.count()) === 1 && !(await list.isVisible()));
  await earlier.click();
  check("earlier: aria-expanded=true and shown", (await earlier.getAttribute("aria-expanded")) === "true" && (await list.isVisible()));
  const items = list.locator("> li");
  check("earlier: two compact entries", (await items.count()) === 2);
  const e1 = await text(items.nth(0));
  check("earlier: meta, first sentence only, chips", e1 === "Oct 22 · Virginia's call · 1 min Owner said the tenants move out at the end of October. $2,500/mo", e1);
  const e2 = await text(items.nth(1));
  check("earlier: 'call' alone with no teammate, seconds for a short call, no chips when none", e2 === "Oct 15 · call · 40 s Left the owner the team's details and asked for a call back.", e2);
  check("earlier: no button on an earlier call", (await list.getByRole("button").count()) === 0);
  check("one request per property, shared by both panel mounts", state.saidGets["5001"] === 1, JSON.stringify(state.saidGets));
  await earlier.click();

  const fit = await noOverflow(p);
  check("desktop: no horizontal overflow", fit.page && fit.body && fit.inCard && fit.card, JSON.stringify(fit));
  const cr = await cardContrast(p);
  check(`light: every text in the card is AA (lowest ${cr.ratio.toFixed(2)})`, cr.ratio >= 4.5, JSON.stringify(cr));

  await C.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/card-desktop-light.png`, clip: await panel(p).boundingBox() });
  // the README shot: the card alone with a little room around it, like quo-digest.png
  const cb = await C.boundingBox();
  if (DOCS) await p.screenshot({ path: `${DOCS}/owner-said.png`, clip: { x: cb.x - 12, y: cb.y - 12, width: cb.width + 24, height: cb.height + 24 } });

  // reopening within the minute asks nothing again
  await closePanel(s);
  await selectRow(s, "5001");
  await card(p).waitFor();
  check("reopen: the card shows again without another request", state.saidGets["5001"] === 1, String(state.saidGets["5001"]));

  // ---------------------------------------------------------------------------------------------
  // Hidden while any edit form is open (plain Edit)
  // ---------------------------------------------------------------------------------------------
  await panel(p).getByRole("button", { name: "Edit", exact: true }).click();
  await form(p).waitFor();
  check("plain Edit open: no Update Monday anywhere in the page (both mounts)", (await anyUpdate(p).count()) === 0);
  check("plain Edit: no 'Filled in from' notice and no call sentences", (await form(p).getByText(/Filled in from/).count()) === 0 && (await form(p).getByText(/From the call/).count()) === 0);
  await form(p).getByRole("button", { name: "Cancel" }).click();
  await form(p).waitFor({ state: "detached" });
  await card(p).waitFor();
  check("form closed: the card is back at once, with its button", (await updateBtn(p).isVisible()) && state.saidGets["5001"] === 1);

  // ---------------------------------------------------------------------------------------------
  // Update Monday: the prefilled form
  // ---------------------------------------------------------------------------------------------
  // A stored draft from earlier typing; the call's values must win and the draft go.
  await p.evaluate(() => sessionStorage.setItem("nh-edit-draft:5001", JSON.stringify({ name: "Old Name", raw: { sqft: "2222" }, base: { sqft: 1800 } })));
  await updateBtn(p).click();
  await form(p).waitFor();
  const F = form(p);
  check("prefill: 'Filled in from Will's call on Oct 27. Check each value, then save.' at the top", (await text(F.getByRole("status").first())) === "Filled in from Will's call on Oct 27. Check each value, then save.");
  check("prefill: no 'Restored' and no 'older version' notice", (await F.getByText("Restored your unsaved changes.").count()) === 0 && (await F.getByText(/older version/).count()) === 0);
  check("prefill: the stored draft is ignored (square feet as Monday has it, your own name)", (await field(p, "Square feet").inputValue()) === "1800" && (await F.getByLabel("Your name").inputValue()) === "Pat Tester");
  const vals = {
    next: await field(p, "Next availability").inputValue(),
    rent: await field(p, "Monthly rent").inputValue(),
    dep: await field(p, "Security deposit").inputValue(),
    petRent: await field(p, "Monthly pet rent").inputValue(),
    pets: await F.getByRole("radiogroup", { name: "Pets allowed" }).locator('[aria-checked="true"]').innerText(),
    furn: await F.getByRole("radiogroup", { name: "Furnished" }).locator('[aria-checked="true"]').innerText(),
  };
  check("prefill: the call's values are in the fields", JSON.stringify(vals) === JSON.stringify({ next: "2026-11-01", rent: "2400", dep: "500", petRent: "35", pets: "Yes", furn: "Yes" }), JSON.stringify(vals));
  check("prefill: they count as changes (Save 6 changes) with 'was' lines", (await text(F.getByRole("button", { name: /^Save/ }))) === "Save 6 changes" && (await F.getByText("was $2,000").count()) === 2);
  const rentFrom = F.getByText(`From the call: “${RENT}”`, { exact: true });
  check("evidence: 'From the call: “…”' under the field", (await rentFrom.count()) === 2);
  const rentId = await field(p, "Monthly rent").getAttribute("aria-describedby");
  check("evidence: the field's aria-describedby includes it", rentId.split(" ").some((id) => id.endsWith("-from")), rentId);
  const longFrom = F.locator('p[id$="-from"]').first();
  const lt = await longFrom.innerText();
  check("evidence: a long sentence is cut to about 140 characters, full text in title", lt.length <= 140 + "From the call: “”".length && lt.endsWith("…”") && (await longFrom.getAttribute("title")) === LONG, `${lt.length}: ${lt}`);
  check("evidence: only the prefilled fields carry one", (await F.locator('p[id$="-from"]').count()) === 6);
  const look = (e) => ({ c: getComputedStyle(e).color, size: getComputedStyle(e).fontSize });
  const muted = await rentFrom.first().evaluate(look);
  const was = await F.locator('p[id$="-was"]').first().evaluate(look);
  check("evidence: small muted text, like the 'was' line", JSON.stringify(muted) === JSON.stringify(was) && muted.c === "rgb(102, 102, 102)", `${JSON.stringify(muted)} vs ${JSON.stringify(was)}`);
  check("form open: no Update Monday anywhere in the page", (await anyUpdate(p).count()) === 0);
  const fb = await panel(p).boundingBox();
  await p.screenshot({ path: `${OUT}/form-desktop-light.png`, clip: fb });
  if (DOCS) await p.screenshot({ path: `${DOCS}/owner-said-form.png`, clip: fb });
  await p.waitForTimeout(200);
  const stored = JSON.parse((await p.evaluate(() => sessionStorage.getItem("nh-edit-draft:5001"))) ?? "null");
  check("storage: the old draft was replaced by the call's values", stored && stored.raw.sqft === undefined && stored.raw.monthly_rate === "2400" && stored.name === "Pat Tester", JSON.stringify(stored));
  await field(p, "Square feet").fill("2100");
  await p.waitForTimeout(200);
  const stored2 = JSON.parse((await p.evaluate(() => sessionStorage.getItem("nh-edit-draft:5001"))) ?? "null");
  check("storage: later typing is still saved for the tab", stored2?.raw.sqft === "2100" && stored2?.raw.monthly_rate === "2400", JSON.stringify(stored2));

  // the discard prompt still guards a prefilled form
  await F.getByRole("button", { name: "Cancel" }).click();
  check("discard: Cancel asks 'Discard 7 changes?'", (await F.getByText("Discard 7 changes?").count()) === 1);
  await F.getByRole("button", { name: "Keep editing" }).click();

  // the draft, notice and sentences cross to the phone sheet and back
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(500);
  check("resize to 390: the sheet's form keeps the notice, the values and the sentences", (await form(p).getByText(/^Filled in from Will's call on Oct 27/).count()) === 1 && (await field(p, "Monthly rent").inputValue()) === "2400" && (await form(p).locator('p[id$="-from"]').count()) === 6);
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(500);
  await field(p, "Square feet").fill("1800");

  // Save posts the source, then the card says it was applied, without a reload
  const gets = state.saidGets["5001"];
  await form(p).getByRole("button", { name: /^Save/ }).click();
  await form(p).waitFor({ state: "detached" });
  const body = state.posts.at(-1);
  check(
    "save: the POST names the call (source) with the call's values and where they started",
    JSON.stringify(body) ===
      JSON.stringify({
        editor: "Pat Tester",
        changes: { next_availability: "2026-11-01", pet_status: "Yes", furnished: "Yes", monthly_rate: 2400, security_deposit: 500, pet_rent: 35 },
        base: { next_availability: null, pet_status: "N/D", furnished: "No", monthly_rate: 2000, security_deposit: 2000, pet_rent: 25 },
        source: { kind: "quo_call", callId: "ACdemo5001c" },
      }),
    JSON.stringify(body),
  );
  await card(p).getByText(/^Applied to Monday/).waitFor({ timeout: 5000 }).catch(() => undefined);
  check("after save: 'Applied to Monday by Pat Tester · Oct 28' without a reload", (await card(p).getByText("Applied to Monday by Pat Tester · Oct 28", { exact: true }).count()) === 1);
  check("after save: no Update Monday anywhere", (await anyUpdate(p).count()) === 0);
  check("after save: one more request, shared by both mounts", state.saidGets["5001"] === gets + 1, `${gets} -> ${state.saidGets["5001"]}`);
  const hidden = await p.locator('aside[aria-label="Property details"]').evaluateAll((els) => els.filter((e) => e.offsetParent === null).map((e) => e.textContent ?? ""));
  check("after save: the other panel mount shows it applied too", hidden.length === 1 && hidden[0].includes("Applied to Monday by Pat Tester · Oct 28"));
  check("after save: 'Saved to Monday.'", (await panel(p).getByText("Saved to Monday.", { exact: true }).count()) === 1);
  await card(p).scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/card-applied.png`, clip: await panel(p).boundingBox() });

  // ---------------------------------------------------------------------------------------------
  // Already in Monday; applied by someone else; the other chips
  // ---------------------------------------------------------------------------------------------
  await selectRow(s, "5002");
  await card(p).waitFor();
  check("all match: 'Monday already has these.' and no button", (await card(p).getByText("Monday already has these.", { exact: true }).count()) === 1 && (await updateBtn(p).count()) === 0);
  check("one call: no earlier-calls disclosure, no More with two sentences and no next steps", (await card(p).getByRole("button").count()) === 0);
  check("propertyCount 1: no shared-number hint", (await card(p).getByText(/This number is on/).count()) === 0);

  await selectRow(s, "5003");
  await card(p).waitFor();
  check("applied: 'Applied to Monday by Fazal · Oct 28' in place of the button", (await card(p).getByText("Applied to Monday by Fazal · Oct 28", { exact: true }).count()) === 1 && (await updateBtn(p).count()) === 0);
  check("applied: no 'already has these' either", (await card(p).getByText("Monday already has these.").count()) === 0);

  await selectRow(s, "5008");
  await card(p).waitFor();
  check("meta: no teammate and no length: 'Oct 20 · call'", (await text(card(p).locator("> div").first())) === "OWNER SAID Oct 20 · call");
  const chips8 = await chipTexts(card(p));
  check("chips: 'Available now' on the call's own day, No pets, Pet deposit, Pet fee, Unfurnished", JSON.stringify(chips8) === JSON.stringify(["Available now", "No pets", "Pet deposit $300", "Pet fee $150", "Unfurnished"]), chips8.join(" | "));
  check("button: shows when some facts differ", await updateBtn(p).isVisible());

  // ---------------------------------------------------------------------------------------------
  // Nothing at all: route error, no calls, switched off, no phone; and nothing while loading
  // ---------------------------------------------------------------------------------------------
  for (const [id, why] of [["5004", "the route fails (502)"], ["5005", "no calls"], ["5006", "enabled:false"]]) {
    await selectRow(s, id);
    await p.waitForTimeout(500);
    check(`nothing [${why}]: no card, no message`, (await p.getByText("Owner said", { exact: true }).count()) === 0 && (await panel(p).getByText(/could(n.t| not) load call/i).count()) === 0 && state.saidGets[id] === 1);
    check(`nothing [${why}]: the rest of Contacts is intact`, (await panel(p).getByText("Demo Owner").count()) === 1 && (await panel(p).getByRole("link", { name: /Call .* with Quo/ }).count()) === 1);
  }
  await selectRow(s, "5007");
  await p.waitForTimeout(500);
  check("no phone: no card and the route is never asked", (await p.getByText("Owner said", { exact: true }).count()) === 0 && !state.saidGets["5007"]);

  // loading: nothing (no skeleton, no spinner) until the answer, then the card
  await s.ctx.close();
}
{
  const s = await open(browser);
  const { p, state } = s;
  state.saidDelay = 1500;
  await selectRow(s, "5001");
  await p.waitForTimeout(300);
  const contacts = panel(p).locator("section", { has: p.getByRole("heading", { name: "Contacts" }) });
  const before = await contacts.boundingBox();
  check("loading: nothing rendered while waiting (no card, skeleton or spinner)", (await card(p).count()) === 0 && (await contacts.locator(".nh-skeleton, .animate-spin").count()) === 0);
  await card(p).waitFor();
  const after = await contacts.boundingBox();
  check("loading: the card only adds below; nothing above it moves", Math.abs(before.y - after.y) < 0.5 && after.height > before.height, `${before.y}/${after.y}`);
  await s.ctx.close();
}

// ===================================================================================================
// 2. Editing switched off: the card, no button
// ===================================================================================================
{
  const s = await open(browser, { editing: false });
  const { p } = s;
  await selectRow(s, "5001");
  await card(p).waitFor();
  await p.waitForTimeout(300);
  check("editing off: the card shows, with no Update Monday", (await chipTexts(card(p))).length === 6 && (await anyUpdate(p).count()) === 0);
  check("editing off: no Edit button either", (await panel(p).getByRole("button", { name: "Edit", exact: true }).count()) === 0);
  await s.ctx.close();
}

// ===================================================================================================
// 3. Phone (390px sheet), dark: fits, touch targets, the prefilled form
// ===================================================================================================
{
  const s = await open(browser, { w: 390, h: 844, theme: "dark", touch: true });
  const { p } = s;
  await selectRow(s, "5001");
  await card(p).waitFor();
  await card(p).getByRole("button", { name: "More" }).tap();
  await card(p).getByRole("button", { name: "2 earlier calls" }).tap();
  const fit = await noOverflow(p);
  check("phone: no horizontal overflow with More and earlier calls open", fit.page && fit.body && fit.inCard && fit.card, JSON.stringify(fit));
  const small = await card(p).locator("button").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => `${e.textContent}:${e.getBoundingClientRect().height}`));
  check("phone: every button in the card is a 44px touch target", small.length === 0, small.join(" "));
  const bg = await card(p).evaluate((e) => getComputedStyle(e).backgroundColor);
  check("dark: the card takes the dark surface (var(--surface-muted))", bg === "rgb(20, 20, 20)", bg);
  const cr = await cardContrast(p);
  check(`dark: every text in the card is AA (lowest ${cr.ratio.toFixed(2)})`, cr.ratio >= 4.5, JSON.stringify(cr));
  await card(p).scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/card-phone-dark.png` });

  await updateBtn(p).tap();
  await form(p).waitFor();
  check("phone: Update Monday opens the form in the sheet with the notice", (await form(p).getByText(/^Filled in from Will's call on Oct 27/).count()) === 1);
  const fw = await panel(p).evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  const ev = await form(p).locator('p[id$="-from"]').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().right <= window.innerWidth));
  check("phone: the prefilled form has no sideways scroll; the sentences wrap inside", fw.sw <= fw.cw && ev, JSON.stringify(fw));
  const evColor = await form(p).locator('p[id$="-from"]').first().evaluate((e) => getComputedStyle(e).color);
  check("dark: the sentences are muted in the dark theme", evColor === "rgb(161, 161, 161)", evColor);
  await p.screenshot({ path: `${OUT}/form-phone-dark.png` });
  await s.ctx.close();
}

// ===================================================================================================
// 4. Desktop dark
// ===================================================================================================
{
  const s = await open(browser, { theme: "dark" });
  const { p } = s;
  await selectRow(s, "5001");
  await card(p).waitFor();
  const bg = await card(p).evaluate((e) => getComputedStyle(e).backgroundColor);
  const chip = await card(p).locator("li.nh-digest").first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, c: getComputedStyle(e).color }));
  check("desktop dark: dark card and chips", bg === "rgb(20, 20, 20)" && chip.bg === "rgb(10, 10, 10)" && chip.c === "rgb(77, 163, 255)", `${bg} ${JSON.stringify(chip)}`);
  const cr = await cardContrast(p);
  check(`desktop dark: every text in the card is AA (lowest ${cr.ratio.toFixed(2)})`, cr.ratio >= 4.5, JSON.stringify(cr));
  const fit = await noOverflow(p);
  check("desktop dark: no horizontal overflow", fit.page && fit.body && fit.inCard && fit.card, JSON.stringify(fit));
  await card(p).scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/card-desktop-dark.png`, clip: await panel(p).boundingBox() });
  await s.ctx.close();
}

await browser.close();
check("no page errors, console errors or hydration warnings", errors.length === 0, errors.slice(0, 5).join(" | "));
console.log(failures.length ? `\n${passes} passed, ${failures.length} FAILED` : `\nALL PASSED (${passes})`);
process.exit(failures.length ? 1 : 0);
