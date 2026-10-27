// The availability pill at the top of the property panel, and Edit details (the listing edit form).
//
// Everything the app reads is mocked with fictional data (properties, claim, health, the edit route), so it
// runs against any build and writes nothing. Google Maps itself is real. The clock is fixed at 2026-10-27.
//
//   BASE=http://localhost:3032 node tests/browser/edit-listing.mjs [screenshot-dir]
//
// playwright-core is resolved from node_modules, then from PW_CORE (a path to its index.mjs).
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3032";
const OUT = process.argv[2] ?? "test-results/edit-listing";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const { chromium } = await import("playwright-core").catch(() =>
  process.env.PW_CORE ? import(process.env.PW_CORE) : Promise.reject(new Error("playwright-core isn't installed; set PW_CORE to its index.mjs")),
);
fs.mkdirSync(OUT, { recursive: true });

// ---------- fixtures (fictional) ----------
const NOW = new Date("2026-10-27T15:00:00");
const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-2001", loss: LOSS, needs, attached: [], attachedPins: [], brief: { accountManager: "Melissa C." } };
const claims = [
  { id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." },
  { id: "100000002", name: "Other Family — #7", lossAddress: "5 Sample Rd, Tulsa, OK", lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-18T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: null },
];

let seq = 0;
function pin(id, over = {}) {
  const i = seq++;
  return {
    monday_item_id: String(id), name: `Fixture ${id}`, lat: LOSS.lat + (Math.floor(i / 3) - 1) * 0.06, lng: LOSS.lng + ((i % 3) - 1) * 0.06, group_title: "Fixture group",
    addable: true, bedrooms: 3, bathrooms: 2, monthly_rate: 2000 + i * 10, pet_status: "yes", has_photos: true, available_from: null,
    distance_miles: 1 + i * 0.3, approximate: false, map_status: "yellow",
    availability: null, availability_checked: null, last_contact: null, link_status: null, other_claims: [], ...over,
  };
}
// Each availability state, and what the pill must say.
const STATES = [
  { id: "4001", pin: { map_status: "green", availability: "Available Soon", available_from: "2026-11-01", availability_checked: "2026-10-22", pet_status: "N/D" }, label: "Available soon", detail: "from Nov 1 · checked Oct 22", tone: "info", row: "Available soon" },
  { id: "4002", pin: { availability: "Available Now", availability_checked: "2026-10-22" }, label: "Available now", detail: "checked Oct 22", tone: "ok", row: "Available now" },
  { id: "4003", pin: { availability: "Available (Unverified)", available_from: "2026-11-15" }, label: "Unverified", detail: "from Nov 15", tone: "muted", row: "Unverified" },
  { id: "4004", pin: { availability: "Unavailable", availability_checked: "2026-10-20", available_from: "2025-03-01" }, label: "Unavailable", detail: "next availability was Mar 1, 2025 · checked Oct 20", tone: "bad", row: "Unavailable" },
  { id: "4005", pin: { availability: "Listing Removed", availability_checked: "2026-10-19" }, label: "Listing removed", detail: "checked Oct 19", tone: "removed", row: "Listing removed" },
  { id: "4006", pin: { availability: "Check Failed", availability_checked: "2026-10-21" }, label: "Availability unknown", detail: "checked Oct 21", tone: "muted", row: null },
  { id: "4007", pin: { availability: "Available Soon", available_from: "2025-03-01", availability_checked: "2026-10-22" }, label: "Available soon", detail: "date passed (Mar 1, 2025) · checked Oct 22", tone: "info", row: "Available soon", stale: true },
  { id: "4008", pin: {}, label: null },
];
const pins = STATES.map((s) => pin(s.id, s.pin));
const byId = new Map(pins.map((p) => [p.monday_item_id, p]));

function makeDetail(p) {
  const d = {
    monday_item_id: p.monday_item_id, name: p.name, group_id: "g", group_title: p.group_title, address: `${p.monday_item_id} Fixture Ln`, city: "Tulsa", state: "OK", zipcode: "74133",
    lat: p.lat, lng: p.lng, bedrooms: p.bedrooms, bathrooms: p.bathrooms, monthly_rate: p.monthly_rate, pet_status: p.pet_status, property_type: "House", sqft: 1800, furnished: "No", fenced_yard: "Yes",
    next_availability: p.available_from, last_contact: null, ntv: null, property_link: `https://example.com/listing/${p.monday_item_id}`, photo_folder_url: null,
    owner_name: "Demo Owner", owner_phone: null, owner_email: null,
    notes: "Two-car garage. Lease terms flexible.", security_deposit: 2000, cleaning_fee: 150, admin_fee: 100, application_fee: 50, move_in_fee: null, pet_rent: 25, pet_deposit: 300, pet_fee: null,
    other_fee_1: null, other_fee_1_desc: null, other_fee_2: null, other_fee_2_desc: null, move_in_total: 4600,
    landlord_item_id: null, landlord_name: null, landlord_phone: null, landlord_contact: null, landlord_type: null, landlord_approval: null, landlord_approval_note: null,
    geocode_status: "ok", location_precision: "exact", map_status: p.map_status, map_reason: p.map_status === "green" ? "used_before" : "none",
    availability: p.availability, availability_checked: p.availability_checked, link_status: null, other_claims: [],
    synced_at: "2026-10-22T12:00:00Z", updated_at: "2026-10-22T12:00:00Z",
  };
  // 4002 has an owner phone, so the Quo digest (ContactDigest) mounts and reads /api/health too.
  if (p.monday_item_id === "4002") Object.assign(d, { owner_phone: "(918) 555-0100", notes: "Line one of the terms.\nLine two: no smoking." });
  return d;
}

// ---------- harness ----------
const errors = [];
const failures = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

async function open(browser, { w = 1440, h = 900, theme = "light", touch = false, editing = true, reporter = "" } = {}) {
  const ctx = await browser.newContext(
    touch ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h }, deviceScaleFactor: 1 },
  );
  const details = new Map(pins.map((p) => [p.monday_item_id, makeDetail(p)]));
  const state = { details, detailDelay: 0, posts: [], replies: [], healthCalls: 0 };
  await ctx.addInitScript(
    ({ t, r }) => {
      try {
        localStorage.setItem("nh-theme", t);
        if (r) localStorage.setItem("nh-reporter-name", r);
        else localStorage.removeItem("nh-reporter-name");
      } catch {}
    },
    { t: theme, r: reporter },
  );
  await ctx.route("**/api/health", (r) => {
    state.healthCalls++;
    return r.fulfill({ json: { ok: true, dryRun: false, quo: false, editing } });
  });
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims, count: 1 } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: { ...claim, id: r.request().url().split("/").pop() } }));
  await ctx.route("**/api/properties?**", (r) => r.fulfill({ json: { pins, coverage: { mappable: 90, unmapped: 10 } } }));
  await ctx.route(/\/api\/properties\/\d+$/, async (r) => {
    if (state.detailDelay) await new Promise((res) => setTimeout(res, state.detailDelay));
    await r.fulfill({ json: details.get(r.request().url().split("/").pop()) });
  });
  // The edit route: answers from state.replies in order (default: 200 with the changes applied).
  await ctx.route(/\/api\/properties\/\d+\/edit$/, async (r) => {
    const id = r.request().url().split("/").slice(-2)[0];
    const body = r.request().postDataJSON();
    state.posts.push(body);
    const reply = state.replies.shift() ?? { status: 200 };
    if (reply.delay) await new Promise((res) => setTimeout(res, reply.delay));
    if (reply.abort) return r.abort("connectionrefused");
    if (reply.status === 200) {
      const next = { ...details.get(id), ...body.changes };
      details.set(id, next);
      return r.fulfill({ json: { ok: true, detail: next, noted: reply.noted ?? true, mirrored: true, ...(reply.dryRun ? { dryRun: true } : {}) } });
    }
    return r.fulfill({ status: reply.status, json: reply.json });
  });
  const p = await ctx.newPage();
  state.dialogs = [];
  p.on("dialog", (d) => {
    state.dialogs.push(d.type());
    void d.dismiss();
  });
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
async function selectRow(s, id, { wait = true } = {}) {
  if (s.phone && !(await s.p.locator('ul[aria-label="Results"]:visible').count())) {
    await s.p.getByRole("button", { name: /within/ }).first().click();
    await s.p.locator('ul[aria-label="Results"]:visible').first().waitFor();
  }
  await row(s.p, id).scrollIntoViewIfNeeded();
  await row(s.p, id).click();
  if (wait) await panel(s.p).getByRole("heading", { name: `Fixture ${id}` }).waitFor();
}
async function closePanel(s) {
  await panel(s.p).getByRole("button", { name: "Close panel" }).click();
  await s.p.waitForTimeout(150);
}
const header = (p) => panel(p).locator("> div").first();
const pillOf = (p) => panel(p).locator('[data-testid="availability-pill"]');

// WCAG contrast from computed colours (rgb(), rgba() and color(srgb …) as color-mix() serialises).
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
function over(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1);
}
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
async function pillContrast(p) {
  const c = await pillOf(p).evaluate((el) => {
    const g = (e, k) => getComputedStyle(e)[k];
    const aside = el.closest("aside");
    return {
      bg: g(el, "backgroundColor"),
      surface: g(aside, "backgroundColor"),
      label: g(el.querySelector(".nh-avail__label"), "color"),
      detail: el.querySelector(".nh-avail__detail") ? g(el.querySelector(".nh-avail__detail"), "color") : null,
    };
  });
  const surface = parseColor(c.surface);
  const bg = over(parseColor(c.bg), surface);
  const label = contrast(over(parseColor(c.label), bg), bg);
  const detail = c.detail ? contrast(over(parseColor(c.detail), bg), bg) : 99;
  return { label, detail, raw: c };
}

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

// ===================================================================================================
// 1. The pill, every state: desktop light, then phone dark
// ===================================================================================================
for (const dev of [
  { name: "desktop-light", w: 1440, h: 900, theme: "light" },
  { name: "phone-dark", w: 390, h: 844, theme: "dark", touch: true },
  { name: "desktop-dark", w: 1440, h: 900, theme: "dark" },
  { name: "phone-light", w: 390, h: 844, theme: "light", touch: true },
]) {
  const s = await open(browser, dev);
  const { p } = s;
  const full = dev.name === "desktop-light" || dev.name === "phone-dark";
  for (const st of STATES) {
    if (!full && !["4001", "4005"].includes(st.id)) continue;
    await selectRow(s, st.id);
    const L = `${dev.name} ${st.id}`;
    if (!st.label) {
      check(`pill [${L}]: no pill when nothing is known about availability`, (await pillOf(p).count()) === 0);
      await closePanel(s);
      continue;
    }
    const pill = pillOf(p);
    const t = await text(pill);
    check(`pill [${L}]: '${st.label}' with '${st.detail}'`, t === `${st.label} ${st.detail}`, t);
    const aria = await pill.getAttribute("aria-label");
    check(`pill [${L}]: aria-label reads the whole thing`, aria === `Availability: ${st.label}, ${st.detail.split(" · ").join(", ")}`, aria);
    check(`pill [${L}]: tone ${st.tone}`, (await pill.getAttribute("class")).includes(`nh-avail--${st.tone}`));
    const order = await pill.evaluate((el) => {
      const col = el.parentElement;
      const h2 = col.querySelector("h2");
      const badge = col.querySelector("span[title]:not([data-testid])");
      const b = el.getBoundingClientRect();
      return { first: col.firstElementChild === el, aboveTitle: b.bottom <= h2.getBoundingClientRect().top, aboveBadge: !badge || b.bottom <= badge.getBoundingClientRect().top };
    });
    check(`pill [${L}]: first row of the header, above the status badge and the name`, order.first && order.aboveTitle && order.aboveBadge, JSON.stringify(order));
    const shadow = await pill.evaluate((el) => getComputedStyle(el).boxShadow);
    if (st.tone === "removed") {
      const strike = await pill.locator(".nh-avail__label").evaluate((el) => getComputedStyle(el).textDecorationLine);
      check(`pill [${L}]: Listing removed is struck through, without glow`, strike.includes("line-through") && shadow === "none", `${strike} / ${shadow}`);
    } else {
      check(`pill [${L}]: raised and glowing (layered shadow)`, shadow !== "none" && shadow.split(/,\s(?=rgba?\(|color\()/).length >= 3, shadow.slice(0, 80));
    }
    if (st.stale) check(`pill [${L}]: a passed date says so`, t.includes("date passed (Mar 1, 2025)"));
    const lines = await pill.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return new Set([...r.getClientRects()].filter((b) => b.width > 1).map((b) => Math.round(b.top))).size;
    });
    const pw = await pill.evaluate((el) => ({ pill: el.getBoundingClientRect().width, header: el.parentElement.clientWidth }));
    check(`pill [${L}]: at most two lines (${lines}), and it has the header's width to itself`, lines >= 1 && lines <= 2 && pw.pill <= pw.header, JSON.stringify(pw));
    const cr = await pillContrast(p);
    check(`pill [${L}]: AA contrast (label ${cr.label.toFixed(2)}, detail ${cr.detail.toFixed(2)})`, cr.label >= 4.5 && cr.detail >= 4.5, JSON.stringify(cr.raw));
    // the header has no availability chip; the list row keeps its chip
    const headerChips = await header(p).locator(".nh-chip").allInnerTexts();
    check(`header [${L}]: no availability chip in the header`, !headerChips.some((c) => /Available|Unverified|Unavailable|Listing removed/.test(c)), headerChips.join("|"));
    check(`property section [${L}]: no duplicate 'Available' row`, (await panel(p).locator("section", { hasText: "Property" }).filter({ hasText: "Sq ft" }).getByText("Available", { exact: true }).count()) === 0);
    if (full || st.id === "4001") {
      const hb = await header(p).boundingBox();
      await p.screenshot({ path: `${OUT}/pill-${dev.name}-${st.id}.png`, clip: { x: hb.x, y: hb.y, width: hb.width, height: Math.min(hb.height + 24, 260) } });
    }
    await closePanel(s);
    if (st.row) {
      if (s.phone && !(await p.locator('ul[aria-label="Results"]:visible').count())) {
        await p.getByRole("button", { name: /within/ }).first().click();
      }
      const rt = await text(row(p, st.id));
      check(`row [${L}]: the list row keeps its '${st.row}' chip`, (await row(p, st.id).locator(".nh-chip", { hasText: st.row }).count()) === 1, rt);
    }
  }
  if (dev.name === "desktop-light" || dev.name === "phone-dark") {
    // the pill shows from the list's copy before the detail loads, and nothing moves when the detail arrives
    s.state.detailDelay = 1500;
    await selectRow(s, "4002", { wait: false });
    await pillOf(p).waitFor();
    const before = await pillOf(p).boundingBox();
    const skeleton = await panel(p).locator(".nh-skeleton").count();
    await panel(p).getByRole("heading", { name: "Fixture 4002" }).waitFor();
    const after = await pillOf(p).boundingBox();
    check(`pill [${dev.name}]: shows before the detail loads (from the pin)`, skeleton > 0 && !!before, String(skeleton));
    check(`pill [${dev.name}]: no layout shift when the detail arrives`, before && after && Math.abs(before.y - after.y) < 0.5 && Math.abs(before.x - after.x) < 0.5 && Math.abs(before.width - after.width) < 0.5 && Math.abs(before.height - after.height) < 0.5, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    const notes = panel(p).locator("section", { hasText: "Notes & links" }).locator("p").first();
    check(`notes [${dev.name}]: multi-line notes keep their line breaks`, (await notes.evaluate((e) => getComputedStyle(e).whiteSpace)) === "pre-line" && (await notes.innerText()).includes("\n"));
    s.state.detailDelay = 0;
    await closePanel(s);
    check(`health [${dev.name}]: one /api/health request for the page (header, both panel mounts, the Quo digest)`, s.state.healthCalls === 1, String(s.state.healthCalls));
  }
  await s.ctx.close();
}

// ===================================================================================================
// 2. Edit hidden when editing is off
// ===================================================================================================
{
  const s = await open(browser, { editing: false });
  await selectRow(s, "4001");
  await s.p.waitForTimeout(400);
  check("edit: no Edit button when /api/health says editing:false", (await panel(s.p).getByRole("button", { name: "Edit" }).count()) === 0);
  await s.ctx.close();
}

// ===================================================================================================
// 3. Edit details, desktop light
// ===================================================================================================
{
  const s = await open(browser, { reporter: "Saved Name" });
  const { p, state } = s;
  await selectRow(s, "4001");
  const P = panel(p);
  const editBtn = P.getByRole("button", { name: "Edit", exact: true });
  await editBtn.waitFor();
  const eb = await editBtn.boundingBox();
  const cb = await P.getByRole("button", { name: "Close panel" }).boundingBox();
  check("edit: Edit button in the header next to Close, the same h-8 height, level with it", Math.abs(eb.height - cb.height) < 0.5 && Math.abs(eb.y - cb.y) < 0.5 && eb.x < cb.x && cb.x - (eb.x + eb.width) < 12, `${eb.height}/${cb.height}`);
  const form = () => P.getByRole("form", { name: "Edit listing details" });
  const field = (label) => form().getByLabel(label, { exact: true });
  const activeId = () => p.evaluate(() => document.activeElement?.id ?? "");
  const focusInForm = () => p.evaluate(() => !!document.activeElement?.closest('form[aria-label="Edit listing details"]'));
  const editFocused = () => p.evaluate(() => document.activeElement?.textContent?.trim() === "Edit");

  // open, cancel without changes
  const hBefore = await header(p).boundingBox();
  await editBtn.click();
  await form().waitFor();
  const hAfter = await header(p).boundingBox();
  check("edit: opening the form doesn't move or resize the header", Math.abs(hBefore.height - hAfter.height) < 0.5 && Math.abs(hBefore.y - hAfter.y) < 0.5, `${hBefore.height} -> ${hAfter.height}`);
  check("edit: the form replaces the body; header and pill stay", (await P.getByText("Cost to place").count()) === 0 && (await pillOf(p).count()) === 1 && (await P.getByRole("heading", { name: "Fixture 4001" }).count()) === 1);
  check("edit: focus moves into the form (first field)", (await focusInForm()) && (await activeId()).endsWith("next_availability"), await activeId());
  const sections = await form().locator("h3").allInnerTexts();
  check("edit: one section per group, in order", sections.map((x) => x.toLowerCase()).join("|") === "availability|basics|rent and fees|listing", sections.join("|"));
  check("edit: all 18 fields are labelled", (await form().locator("input:not([id$='editor']), textarea, [role='radiogroup']").count()) === 18);
  check("edit: your name prefilled from this device", (await form().getByLabel("Your name").inputValue()) === "Saved Name");
  check("edit: a stored value that doesn't validate shows as it is (pets 'N/D')", (await form().getByText("Stored as “N/D”").count()) === 1);
  check("edit: Save disabled with nothing changed", await form().getByRole("button", { name: /^Save/ }).isDisabled());
  await form().getByRole("button", { name: "Cancel" }).click();
  await form().waitFor({ state: "detached" });
  check("edit: Cancel with no changes closes at once", (await P.getByText("Cost to place").count()) === 1);
  check("edit: focus returns to Edit", await editFocused());

  // a change, Escape asks, Keep editing keeps it, Discard drops it
  await editBtn.click();
  await field("Monthly rent").fill("2450");
  check("edit: a changed field shows 'was $2,000'", (await form().getByText("was $2,000").count()) === 1);
  check("edit: Save counts the change", (await text(form().getByRole("button", { name: /^Save/ }))) === "Save 1 change");
  await p.keyboard.press("Escape");
  check("edit: Escape with changes asks 'Discard 1 change?'", (await form().getByText("Discard 1 change?").count()) === 1);
  check("edit: the safe choice (Keep editing) has focus", await form().getByRole("button", { name: "Keep editing" }).evaluate((e) => e === document.activeElement));
  await form().getByRole("button", { name: "Keep editing" }).click();
  check("edit: Keep editing keeps what was typed", (await field("Monthly rent").inputValue()) === "2450");
  await form().getByRole("button", { name: "Cancel" }).click();
  await form().getByRole("button", { name: "Discard" }).click();
  await form().waitFor({ state: "detached" });
  check("edit: Discard closes, focus back on Edit, nothing sent", (await editFocused()) && state.posts.length === 0);
  check("edit: discarded value never reached the panel", (await text(P.locator('[aria-label="Key facts"]'))).includes("$2,000"));

  // validation
  await editBtn.click();
  await field("Bedrooms").fill("3.5");
  await field("Bathrooms").focus();
  const bedErr = form().getByText("Bedrooms must be a whole number");
  check("validate: message under the field on blur", (await bedErr.count()) === 1);
  const inv = await field("Bedrooms").getAttribute("aria-invalid");
  const desc = await field("Bedrooms").getAttribute("aria-describedby");
  const errId = await bedErr.getAttribute("id");
  check("validate: aria-invalid and aria-describedby point at the message", inv === "true" && desc.split(" ").includes(errId), `${inv} ${desc}`);
  check("validate: Save disabled while a field is invalid", await form().getByRole("button", { name: /^Save/ }).isDisabled());
  await field("Bedrooms").fill("4");
  check("validate: fixing it clears the message and enables Save", (await bedErr.count()) === 0 && (await form().getByRole("button", { name: /^Save/ }).isEnabled()));
  await field("Listing link").fill("example.com");
  await field("Listing link").blur();
  check("validate: a link without https:// is refused", (await form().getByText("Listing link must be a full link starting with https://").count()) === 1);
  await field("Listing link").fill("https://example.com/listing/4001");
  await field("Listing link").blur();
  check("validate: back to the stored link is no change", (await form().getByText(/Listing link must/).count()) === 0);
  await form().getByLabel("Your name").fill("   ");
  await form().getByLabel("Your name").blur();
  check("validate: your name is required", (await form().getByRole("button", { name: /^Save/ }).isDisabled()) && (await form().getByText("Enter your name").count()) === 1);
  await form().getByLabel("Your name").fill("  Pat Tester  ");

  // keyboard through the Yes / No / Blank control
  const pets = form().getByRole("radiogroup", { name: "Pets allowed" });
  check("segmented: N/D selects none of Yes / No / Blank", (await pets.locator('[aria-checked="true"]').count()) === 0);
  await field("Square feet").focus();
  await p.keyboard.press("Tab");
  check("segmented: Tab lands on the group", await pets.getByRole("radio", { name: "Yes" }).evaluate((e) => e === document.activeElement));
  await p.keyboard.press("ArrowRight");
  check("segmented: ArrowRight moves to and selects No", (await pets.getByRole("radio", { name: "No" }).getAttribute("aria-checked")) === "true" && (await pets.getByRole("radio", { name: "No" }).evaluate((e) => e === document.activeElement)));
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("ArrowRight");
  check("segmented: arrows wrap round (Blank, then Yes)", (await pets.getByRole("radio", { name: "Yes" }).getAttribute("aria-checked")) === "true");
  await p.keyboard.press("Tab");
  const furnished = form().getByRole("radiogroup", { name: "Furnished" });
  check("segmented: Tab leaves the group for the next one's checked choice", await furnished.getByRole("radio", { name: "No" }).evaluate((e) => e === document.activeElement));
  await p.keyboard.press("Shift+Tab");
  check("segmented: Shift+Tab comes back to the checked choice", await pets.getByRole("radio", { name: "Yes" }).evaluate((e) => e === document.activeElement));

  await field("Monthly rent").fill("$2,450");
  check("money: a typed '$' isn't shown twice (the box already draws one)", (await field("Monthly rent").inputValue()) === "2,450", await field("Monthly rent").inputValue());
  await field("Cleaning fee").fill("");
  const longer = "Two-car garage. Lease terms flexible. Pets on approval.";
  await field("Terms and notes").fill(longer);
  check("longtext: character counter", (await form().getByText(`${longer.length} / 2,000`).count()) === 1);
  await field("Terms and notes").fill("Two-car garage. Lease terms flexible.");
  check("edit: Save says how many fields change", (await text(form().getByRole("button", { name: /^Save/ }))) === "Save 4 changes");
  await form().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/edit-form-desktop.png` });

  // 409 → Use Monday's values
  state.replies.push({ status: 409, json: { error: "Changed in Monday since you opened the form", code: "conflict", fields: ["monthly_rate"], current: { monthly_rate: 2600 } } });
  await form().getByRole("button", { name: /^Save/ }).click();
  const conflict = form().getByRole("alert").filter({ hasText: "Monday since you opened" });
  await conflict.waitFor();
  const ct = await text(conflict);
  check("409: the form stays and lists the field, Monday's value and mine", ct.includes("Monthly rent") && ct.includes("Monday now: $2,600") && ct.includes("You entered: $2,450"), ct);
  check("409: the conflict box has focus", await conflict.evaluate((e) => e === document.activeElement));
  await p.screenshot({ path: `${OUT}/edit-conflict-409.png` });
  await conflict.getByRole("button", { name: "Use Monday's values" }).click();
  check("409 Use Monday's values: the field takes Monday's value and counts as unchanged", (await field("Monthly rent").inputValue()) === "2600" && (await form().getByText("was $2,000").count()) === 0);
  check("409 Use Monday's values: the other edits are kept", (await field("Bedrooms").inputValue()) === "4" && (await text(form().getByRole("button", { name: /^Save/ }))) === "Save 3 changes");

  // 409 → Save mine anyway
  await field("Monthly rent").fill("2450");
  check("after Use Monday's: 'was' now reads Monday's value", (await form().getByText("was $2,600").count()) === 1);
  state.replies.push({ status: 409, json: { error: "Changed in Monday", code: "conflict", fields: ["monthly_rate"], current: { monthly_rate: 2700 } } });
  await form().getByRole("button", { name: /^Save/ }).click();
  await conflict.waitFor();
  state.replies.push({ status: 200 });
  await conflict.getByRole("button", { name: "Save mine anyway" }).click();
  await form().waitFor({ state: "detached" });
  const last = state.posts.at(-1);
  check("409 Save mine anyway: resubmits mine with base = Monday's values", last.changes.monthly_rate === 2450 && last.base.monthly_rate === 2700, JSON.stringify(last));
  const firstPost = state.posts[0];
  check(
    "POST body: changed fields only, normalised, with their starting values and a trimmed name",
    JSON.stringify(firstPost) ===
      JSON.stringify({ editor: "Pat Tester", changes: { bedrooms: 4, pet_status: "Yes", monthly_rate: 2450, cleaning_fee: null }, base: { bedrooms: 3, pet_status: "N/D", monthly_rate: 2000, cleaning_fee: 150 } }),
    JSON.stringify(firstPost),
  );
  check("POST body: the resubmit carries the same edits", JSON.stringify(Object.keys(last.changes)) === JSON.stringify(["bedrooms", "pet_status", "monthly_rate", "cleaning_fee"]) && last.base.bedrooms === 3);

  // success
  const savedLine = P.getByText("Saved to Monday.", { exact: true });
  check("saved: 'Saved to Monday.' at the top of the body", (await savedLine.count()) === 1);
  check("saved: the line sits in an aria-live region", await savedLine.evaluate((e) => !!e.closest("[aria-live]")));
  check("saved: focus back on Edit", await editFocused());
  const kf = await text(P.locator('[aria-label="Key facts"]'));
  check("saved: the panel shows the new values", kf.includes("4") && kf.includes("$2,450") && kf.includes("Yes"), kf);
  const rt = await text(row(p, "4001"));
  check("saved: the list row shows the new beds, rent and pets", rt.includes("4 bd") && rt.includes("$2,450") && rt.includes("pets ok"), rt);
  const hiddenFacts = (p) =>
    p.locator('aside[aria-label="Property details"]').evaluateAll((els) =>
      els.filter((e) => e.offsetParent === null).map((e) => e.querySelector('[aria-label="Key facts"]')?.textContent ?? ""),
    );
  const other = await hiddenFacts(p);
  const shownFacts = await P.locator('[aria-label="Key facts"]').evaluate((e) => e.textContent ?? "");
  check("saved: the other panel mount (phone sheet) shows the same values", other.length === 1 && other[0] === shownFacts && shownFacts.includes("$2,450"), `${other[0]} vs ${shownFacts}`);
  check("saved: your name is remembered on this device", (await p.evaluate(() => localStorage.getItem("nh-reporter-name"))) === "Pat Tester");
  await p.screenshot({ path: `${OUT}/edit-saved-desktop.png` });
  await p.waitForTimeout(6500);
  check("saved: the line goes after about 6 seconds", (await savedLine.count()) === 0);

  // noted:false, then dryRun, then dismiss
  for (const [reply, want] of [
    [{ status: 200, noted: false }, "Saved to Monday. The Monday note couldn't be posted."],
    [{ status: 200, dryRun: true }, "Dry run: nothing was written to Monday."],
  ]) {
    await editBtn.click();
    await field("Square feet").fill(String(1900 + state.posts.length));
    state.replies.push(reply);
    await form().getByRole("button", { name: /^Save/ }).click();
    await form().waitFor({ state: "detached" });
    check(`saved: '${want}'`, (await P.getByText(want, { exact: true }).count()) === 1);
  }
  await P.getByRole("button", { name: "Dismiss" }).click();
  check("saved: the line can be dismissed", (await P.getByText("Dry run: nothing was written to Monday.").count()) === 0);

  // errors keep the edits
  await editBtn.click();
  await field("Pet deposit").fill("450");
  for (const [reply, want] of [
    [{ status: 502, json: { error: "Monday didn't take the change. Try again in a minute.", code: "monday_error" } }, "Monday didn't take the change. Try again in a minute."],
    [{ status: 429, json: { error: "Too many edits right now; try again in a few minutes.", code: "rate_limited" } }, "Too many edits right now; try again in a few minutes."],
    [{ abort: true }, "Couldn't reach the map server. Try again."],
    [{ status: 409, json: { code: "busy", error: "Someone else is saving this property; try again in a moment" } }, "Someone else is saving this property; try again in a moment"],
  ]) {
    state.replies.push(reply);
    await form().getByRole("button", { name: /^Save/ }).click();
    const msg = form().getByRole("alert").filter({ hasText: want });
    await msg.waitFor();
    check(
      `error ${reply.status ?? "network"}${reply.json?.code ? " " + reply.json.code : ""}: footer says '${want}' and the edit is kept`,
      (await field("Pet deposit").inputValue()) === "450" && (await form().getByText("was $300").count()) === 1 && (await form().getByText("since you opened the form").count()) === 0,
    );
  }
  // disabled while saving
  state.replies.push({ status: 200, delay: 1200 });
  await form().getByRole("button", { name: /^Save/ }).click();
  await p.waitForTimeout(250);
  check("saving: the form is disabled and the button says Saving…", (await form().locator("fieldset").getAttribute("disabled")) !== null && (await text(form().getByRole("button", { name: /Saving/ }))) === "Saving…");
  await form().waitFor({ state: "detached" });
  check("saving: then saved", (await P.getByText("Saved to Monday.", { exact: true }).count()) === 1);

  // a later mount of the same property starts from its own fresh read, never the old saved snapshot
  await closePanel(s);
  state.details.set("4001", { ...state.details.get("4001"), monthly_rate: 2600 }); // Monday changed since (the webhook)
  state.detailDelay = 1200;
  await selectRow(s, "4001", { wait: false });
  await p.waitForTimeout(400);
  const early = await text(P);
  check("reopen: nothing from the old saved snapshot shows while the fresh read is in flight", !early.includes("$2,450") && (await P.getByRole("button", { name: "Edit", exact: true }).count()) === 0, early.slice(0, 120));
  await P.getByRole("heading", { name: "Fixture 4001" }).waitFor();
  state.detailDelay = 0;
  check("reopen: the panel shows the fresh read ($2,600)", (await text(P.locator('[aria-label="Key facts"]'))).includes("$2,600"));
  await editBtn.click();
  check("reopen: the form starts from the fresh value", (await field("Monthly rent").inputValue()) === "2600");

  // unsaved edits: every way of closing the form asks first
  await field("Bedrooms").fill("5");
  const ask = form().getByText("Discard 1 change?");
  const keep = () => form().getByRole("button", { name: "Keep editing" });
  const discard = () => form().getByRole("button", { name: "Discard" });
  await P.getByRole("button", { name: "Close panel" }).click();
  check("discard [close]: X asks 'Discard 1 change?' and the panel stays", (await ask.count()) === 1 && (await P.count()) === 1);
  check("discard [close]: Keep editing has focus", await keep().evaluate((e) => e === document.activeElement));
  await p.screenshot({ path: `${OUT}/discard-prompt-desktop.png` });
  await keep().click();
  check("discard [close]: Keep editing cancels the close and keeps the edit", (await P.count()) === 1 && (await field("Bedrooms").inputValue()) === "5");
  await row(p, "4002").click();
  check("discard [other row]: picking another property asks", (await ask.count()) === 1 && (await P.getByRole("heading", { name: "Fixture 4001" }).count()) === 1);
  await keep().click();
  check("discard [other row]: Keep editing stays on this property", (await P.getByRole("heading", { name: "Fixture 4001" }).count()) === 1 && (await field("Bedrooms").inputValue()) === "5");
  await row(p, "4002").click();
  await discard().click();
  await P.getByRole("heading", { name: "Fixture 4002" }).waitFor();
  check("discard [other row]: Discard opens the other property", (await P.getByRole("heading", { name: "Fixture 4002" }).count()) === 1);
  check("discard [other row]: nothing was sent", state.posts.every((b) => b.changes.bedrooms !== 5));

  // switching claims
  await editBtn.click();
  await field("Bedrooms").fill("5");
  await p.getByRole("button", { name: "Active claims" }).click();
  await p.getByRole("option", { name: /Other Family/ }).click();
  await ask.waitFor();
  check("discard [claim]: switching claims asks; the claim stays until answered", new URL(p.url()).searchParams.get("claimId") === CLAIM_ID);
  await keep().click();
  check("discard [claim]: Keep editing keeps the claim and the edit", new URL(p.url()).searchParams.get("claimId") === CLAIM_ID && (await field("Bedrooms").inputValue()) === "5");

  // leaving the page
  await p.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 800));
  check("beforeunload: leaving with unsaved edits asks the browser's question", state.dialogs.includes("beforeunload") && !p.isClosed(), state.dialogs.join(","));

  await p.getByRole("button", { name: "Active claims" }).click();
  await p.getByRole("option", { name: /Other Family/ }).click();
  await ask.waitFor();
  await discard().click();
  await p.waitForTimeout(500);
  check("discard [claim]: Discard switches the claim and closes the panel", new URL(p.url()).searchParams.get("claimId") === "100000002" && (await P.count()) === 0);
  state.dialogs.length = 0;
  await p.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 800));
  check("beforeunload: no question once nothing is unsaved", state.dialogs.length === 0 && p.isClosed(), state.dialogs.join(","));
  await s.ctx.close();
}

// ===================================================================================================
// 4. Edit details on a phone (390px sheet), dark
// ===================================================================================================
{
  const s = await open(browser, { w: 390, h: 844, theme: "dark", touch: true, reporter: "Pat Tester" });
  const { p, state } = s;
  await selectRow(s, "4001");
  const P = panel(p);
  const editBtn = P.getByRole("button", { name: "Edit", exact: true });
  await editBtn.waitFor();
  check("phone: Edit is a 44px touch target", Math.round((await editBtn.boundingBox()).height) >= 44);
  await editBtn.tap();
  const form = P.getByRole("form", { name: "Edit listing details" });
  await form.waitFor();
  const fw = await P.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  check("phone: no sideways scroll in the panel with the form open", fw.sw <= fw.cw, JSON.stringify(fw));
  const small = await form.locator("input, textarea, button").evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height < 43.5 && e.tagName !== "TEXTAREA").map((e) => `${e.tagName}${e.id ? "#" + e.id.split("-").pop() : ""}:${Math.round(e.getBoundingClientRect().height)}`),
  );
  check("phone: every input and button in the form is at least 44px tall", small.length === 0, small.slice(0, 6).join(" "));
  const footer = await form.getByRole("button", { name: /^Save/ }).boundingBox();
  check("phone: the Save footer is on screen", footer && footer.y + footer.height <= 844, JSON.stringify(footer));
  await form.getByLabel("Monthly rent", { exact: true }).fill("2500");
  await form.getByLabel("Bedrooms", { exact: true }).fill("two");
  await form.getByLabel("Bathrooms", { exact: true }).focus();
  await p.screenshot({ path: `${OUT}/edit-form-phone-dark.png` });
  await form.getByLabel("Bedrooms", { exact: true }).fill("4");
  state.replies.push({ status: 200 });
  await form.getByRole("button", { name: /^Save/ }).tap();
  await form.waitFor({ state: "detached" });
  check("phone: saved, the sheet panel shows the new rent", (await text(P.locator('[aria-label="Key facts"]'))).includes("$2,500"));
  const other = await p.locator('aside[aria-label="Property details"]').evaluateAll((els) =>
    els.filter((e) => e.offsetParent === null).map((e) => e.querySelector('[aria-label="Key facts"]')?.textContent ?? ""),
  );
  check("phone: the desktop rail mount agrees", other.length === 1 && other[0].includes("$2,500") && other[0].includes("4"), other[0]);
  await p.screenshot({ path: `${OUT}/edit-saved-phone-dark.png` });

  // tapping the scrim with unsaved edits asks first
  await editBtn.tap();
  await form.getByLabel("Bedrooms", { exact: true }).fill("6");
  await p.mouse.click(5, 420); // the scrim strip beside the sheet
  const ask = form.getByText("Discard 1 change?");
  check("phone discard [scrim]: tapping outside asks, the sheet stays", (await ask.count()) === 1 && (await P.count()) === 1);
  await ask.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/discard-prompt-phone-dark.png` });
  await form.getByRole("button", { name: "Discard" }).tap();
  await p.waitForTimeout(300);
  check("phone discard [scrim]: Discard closes the sheet", (await p.locator('aside[aria-label="Property details"]:visible').count()) === 0);
  await s.ctx.close();
}

await browser.close();
check("no page errors, console errors or hydration warnings", errors.length === 0, errors.slice(0, 5).join(" | "));
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
