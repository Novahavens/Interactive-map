// Browser checks against the REAL /api/properties* (database mirror). Only the Monday-backed endpoints are
// mocked (/api/claims/active, /api/claim/*, flag-link POST), so it needs a server with working Supabase
// credentials and writes nothing.
//
//   BASE=http://localhost:3012 node tests/browser/real-data.mjs [screenshot-dir]
//
// playwright-core is resolved from node_modules, then from PW_CORE (a path to its index.mjs).
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3012";
const OUT = process.argv[2] ?? "test-results/real-data";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PW_CORE = process.env.PW_CORE ?? "/tmp/claude-0/-home-user-Interactive-map/519172db-2710-58fd-844f-0ffa565c5e27/scratchpad/pw/node_modules/playwright-core/index.mjs";
const { chromium } = await import("playwright-core").catch(() => import(PW_CORE));
fs.mkdirSync(OUT, { recursive: true });

const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const brief = {
  status: "Working on it", group: "New Housing Request", receivedOn: "2026-10-19", moveIn: "2026-11-02", leaseMonths: 3,
  frv: 3000, adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, petDescription: "One small dog", utilityCap: 250,
  specialRequests: "Needs a ground-floor bedroom.\nPrefers a fenced yard.", accountManager: "Melissa C.", searcher: "Demo Searcher", coordinator: "Demo Coordinator", company: "Alacrity",
};
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-2001", loss: LOSS, needs, attached: [], attachedPins: [], brief };
const claims = [{ id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." }];

// ---------- harness ----------
const errors = [];
const failures = [];
const check = (name, ok, extra = "") => {
  (ok ? console.log : (m) => { console.log(m); failures.push(name); })(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// The real pins, fetched once the same way the page does, to compare against what the UI shows.
const apiUrl = `${BASE}/api/properties?lat=${LOSS.lat}&lng=${LOSS.lng}&miles=10`;
const api = await (await fetch(apiUrl)).json();
const pins = api.pins;
check("precondition: real API returns pins", pins.length > 0, `${pins.length} pins`);
const foreign = (p) => p.other_claims.some((c) => c.claimId !== CLAIM_ID);
const withClaims = pins.find((p) => foreign(p) && p.map_status !== "red") ?? pins.find(foreign);
const bad = pins.find((p) => p.link_status === "BAD LINK");
const good = pins.find((p) => p.link_status === "Good link" && p.map_status !== "red");
check("precondition: real data has a pin with other_claims, a BAD LINK and a Good link", !!withClaims && !!bad && !!good, `${withClaims?.monday_item_id} ${bad?.monday_item_id} ${good?.monday_item_id}`);

async function open(browser, { w, h, theme = "light" }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const state = { flag: { calls: 0, body: null } };
  await ctx.addInitScript((t) => { try { localStorage.setItem("nh-theme", t); localStorage.setItem("nh-reporter-name", "QA"); } catch {} }, theme);
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims, count: claims.length } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: claim }));
  await ctx.route(/\/api\/properties\/\d+\/flag-link$/, async (r) => {
    state.flag.calls++;
    state.flag.body = r.request().postDataJSON();
    await r.fulfill({ json: { ok: true, alreadyFlagged: false, dryRun: true } });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`[${w}x${h}] ${m.text()}`); });
  p.on("dialog", (d) => { errors.push(`unexpected ${d.type()} dialog: ${d.message()}`); void d.dismiss(); });
  await p.goto(`${BASE}/?claimId=${CLAIM_ID}`, { waitUntil: "networkidle" });
  await p.locator("button[id^='row-']:visible, button:has-text('within')").first().waitFor();
  await p.waitForTimeout(4500);
  return { ctx, p, state, phone: w < 1024 };
}
// The filter pills and colour key live in a closed "Filters" drawer; open it before touching them.
async function openFilters(root) {
  const d = root.locator("details", { has: root.locator("summary", { hasText: /^\s*Filters/ }) }).first();
  if (!(await d.evaluate((e) => e.open))) await d.locator("summary").click();
  return d;
}
const results = (p) => p.locator('ul[aria-label="Results"]:visible').first();
const panel = (p) => p.locator('aside[aria-label="Property details"]:visible').first();
const row = (p, id) => p.locator(`[id="row-${id}"]:visible`).first();
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
async function openList(s) {
  if (s.phone && !(await results(s.p).count())) {
    await s.p.getByRole("button", { name: /within/ }).first().click();
    await results(s.p).waitFor();
  }
}
async function selectRow(s, id) {
  await openList(s);
  await row(s.p, id).scrollIntoViewIfNeeded();
  await row(s.p, id).click();
  await panel(s.p).waitFor();
  await panel(s.p).getByRole("heading").first().waitFor();
}
const pageMetrics = (p) => p.evaluate(() => { const se = document.scrollingElement; return { innerHeight, innerWidth, scrollHeight: se.scrollHeight, scrollWidth: se.scrollWidth, scrollY: se.scrollTop }; });
const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

// Every row: one dot; chips do not overlap the price/distance block, the name, the sub line, each other, or leave the row.
async function rowGeometry(p) {
  return p.evaluate(() => {
    const out = { rows: 0, dots: [], overlaps: [], escapes: [] };
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const hit = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    for (const r of document.querySelectorAll("button[id^='row-']")) {
      if (r.offsetParent === null) continue;
      out.rows++;
      const id = r.dataset.pinRow;
      const dots = r.querySelectorAll(".nh-dot").length;
      if (dots !== 1) out.dots.push(`${id}:${dots}`);
      const rb = box(r);
      const chips = [...r.querySelectorAll(".nh-chip")].map(box);
      const others = [
        ["price", r.querySelector(".font-mono.font-semibold")],
        ["distance", r.querySelector(".text-xs.text-muted")],
        ["name", r.querySelector(".truncate.font-medium")],
        ["sub", r.querySelector(".truncate.text-\\[13px\\]")],
      ].filter(([, e]) => e);
      chips.forEach((c, i) => {
        if (c.x < rb.x - 0.5 || c.x + c.width > rb.x + rb.width + 0.5 || c.y < rb.y - 0.5 || c.y + c.height > rb.y + rb.height + 0.5) out.escapes.push(id);
        for (const [n, e] of others) if (hit(c, box(e))) out.overlaps.push(`${id}: chip#${i} x ${n}`);
        chips.slice(i + 1).forEach((d, j) => { if (hit(c, d)) out.overlaps.push(`${id}: chip#${i} x chip#${i + 1 + j}`); });
      });
    }
    return out;
  });
}
async function wheelMoves(p, loc) {
  const b = await loc.boundingBox();
  if (!b || b.height < 1) return { moved: false, before: 0, after: 0 };
  const before = await loc.evaluate((e) => e.scrollTop);
  await p.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 60));
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(250);
  const after = await loc.evaluate((e) => e.scrollTop);
  return { moved: after > before, before, after };
}
// Anything fixed/absolute sitting in the bottom-left corner that overlaps a row's text (the Next.js "N" dev badge, a map control...).
async function cornerCover(p) {
  return p.evaluate(() => {
    const hits = [];
    const rows = [...document.querySelectorAll("button[id^='row-']")].filter((r) => r.offsetParent !== null);
    const list = document.querySelector('ul[aria-label="Results"]');
    const lb = list?.getBoundingClientRect();
    for (let x = 4; x < 90; x += 12) {
      for (let y = innerHeight - 90; y < innerHeight - 2; y += 12) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        const inRow = el.closest("button[id^='row-']");
        if (inRow) continue;
        const r = rows.find((rw) => { const b = rw.getBoundingClientRect(); return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height; });
        if (r) hits.push(`${r.dataset.pinRow} covered at ${x},${y} by <${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") || el.id || el.className || "").toString().slice(0, 40)}>`);
      }
    }
    return { hits, listBottom: lb ? Math.round(lb.bottom) : null, innerHeight };
  });
}

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

// ===================================================================================================
// Desktop 1440x860, light
// ===================================================================================================
{
  const s = await open(browser, { w: 1440, h: 860 });
  const { p } = s;
  await openList(s);

  const g = await rowGeometry(p);
  check("rows: every list row has exactly one dot", g.rows > 0 && g.dots.length === 0, `${g.rows} rows ${g.dots.slice(0, 5)}`);
  check("rows: list row count equals real pin count", g.rows === pins.length, `${g.rows} vs ${pins.length}`);
  check("rows: chips never overlap price/distance/name/sub or each other, and stay inside the row", g.overlaps.length === 0 && g.escapes.length === 0, `${g.overlaps.slice(0, 4)} ${g.escapes.slice(0, 4)}`);

  // legend counts == API
  const expect = { green: 0, yellow: 0, red: 0 };
  for (const x of pins) expect[x.map_status]++;
  await openFilters(p);
  const legendTxt = await text(p.locator('[aria-label="Dot colours"]'));
  const got = {};
  for (const [k, label] of [["green", "Used before"], ["yellow", "Neutral"], ["red", "Do not use"]]) {
    const b = p.locator('[aria-label="Dot colours"] button', { hasText: label });
    got[k] = Number((await text(b)).replace(/[^\d]/g, "").replace(/^$/, "-1"));
  }
  check("legend: counts match the API (green/yellow/red)", got.green === expect.green && got.yellow === expect.yellow && got.red === expect.red, `ui ${JSON.stringify(got)} api ${JSON.stringify(expect)}`);
  check("legend: 'N within 10 mi' equals pin count", (await text(p.locator("body"))).includes(`${pins.length} within`), `${pins.length}`);
  check("legend: On this claim + grouped entries present", legendTxt.includes("On this claim") && legendTxt.includes("Nearby grouped"), legendTxt);

  // chip text per real availability value (colour is not the only carrier)
  const AV = { "Available Now": "Available now", "Available Soon": "Available soon", "Available (Unverified)": "Unverified", Unavailable: "Unavailable", "Listing Removed": "Listing removed" };
  const bad1 = [];
  for (const x of pins) {
    const t = await text(row(p, x.monday_item_id));
    const want = AV[x.availability];
    if (want && !t.includes(want)) bad1.push(`${x.monday_item_id} missing '${want}'`);
    if (x.link_status === "BAD LINK" && !t.includes("Bad link")) bad1.push(`${x.monday_item_id} missing Bad link`);
    const oc = x.other_claims.filter((c) => c.claimId !== CLAIM_ID);
    if (oc.length && !/On claim|On \d+ claims/.test(t)) bad1.push(`${x.monday_item_id} missing On claim`);
    if (!oc.length && /On claim|On \d+ claims/.test(t)) bad1.push(`${x.monday_item_id} spurious On claim`);
  }
  check("rows: availability / Bad link / On claim chips match the real data for every pin", bad1.length === 0, bad1.slice(0, 5).join(" | "));
  await p.screenshot({ path: `${OUT}/real-desktop-light.png` });

  // property with other_claims: chip, panel block, Add-anyway warning
  const oc = withClaims.other_claims.find((c) => c.claimId !== CLAIM_ID);
  await selectRow(s, withClaims.monday_item_id);
  const rt = await text(row(p, withClaims.monday_item_id));
  check("other_claims property: row shows the 'On claim' chip", rt.includes("On claim") || /On \d+ claims/.test(rt), rt);
  const pt = await text(panel(p));
  check("other_claims property: panel (real detail endpoint) lists the other claim", pt.includes(oc.claimName) && pt.includes(oc.status), `${oc.claimName} / ${oc.status}`);
  await p.screenshot({ path: `${OUT}/real-other-claims-panel.png` });
  if (withClaims.map_status !== "red") {
    await panel(p).getByRole("button", { name: /Add to claim/ }).click();
    const warn = panel(p).getByRole("alert").filter({ hasText: "Already an option on" });
    await warn.waitFor({ timeout: 5000 }).catch(() => {});
    const wt = (await warn.count()) ? await text(warn) : "";
    check("other_claims property: Add shows 'Already an option on ... Add anyway?'", wt.includes("Already an option on") && wt.includes("Add anyway"), wt);
    await p.screenshot({ path: `${OUT}/real-add-warning.png` });
    await panel(p).getByRole("button", { name: "Cancel" }).click().catch(() => {});
  } else check("other_claims property: Add warning (skipped: pin is red)", true);

  // BAD LINK property
  await selectRow(s, bad.monday_item_id);
  const bl = panel(p).getByRole("link", { name: "Listing" });
  const blOk = (await bl.count()) ? (await bl.evaluate((e) => getComputedStyle(e).textDecorationLine)).includes("line-through") : false;
  check("BAD LINK property: struck link", blOk, bad.monday_item_id);
  check("BAD LINK property: Bad link badge and no Report button", (await text(panel(p))).includes("Bad link") && (await panel(p).getByRole("button", { name: "Report bad link" }).count()) === 0);
  await p.screenshot({ path: `${OUT}/real-bad-link-panel.png` });

  // good link property
  await selectRow(s, good.monday_item_id);
  const rb = panel(p).getByRole("button", { name: "Report bad link" });
  await rb.scrollIntoViewIfNeeded();
  check("Good link property: Report bad link button present", (await rb.count()) === 1);
  await rb.click();
  const form = panel(p).getByRole("form", { name: "Report bad link" });
  check("Good link property: form opens with name prefilled", (await form.count()) === 1 && (await form.getByLabel("Your name").inputValue()) === "QA");
  await form.getByLabel(/What's wrong/).fill("QA run");
  await form.getByRole("button", { name: "Send" }).click();
  await panel(p).getByText("Reported. Thanks.").waitFor({ timeout: 5000 }).catch(() => {});
  check("Good link property: POST sent, UI flipped to flagged", s.state.flag.calls === 1 && s.state.flag.body?.note === "QA run" && (await panel(p).getByRole("button", { name: "Report bad link" }).count()) === 0 && (await text(row(p, good.monday_item_id))).includes("Bad link"), JSON.stringify(s.state.flag.body));
  await p.screenshot({ path: `${OUT}/real-reported.png` });

  // keyboard focus acts as hover; accessible names
  await panel(p).getByRole("button", { name: "Close panel" }).click().catch(() => {});
  // A pin inside a cluster has no highlight by design, so use one the map draws on its own.
  const pinLabel = await p.locator(".nh-pin").first().getAttribute("aria-label");
  const first = pins.find((x) => pinLabel.startsWith(`${x.name},`)).monday_item_id;
  await p.keyboard.press("Tab"); // a keyboard interaction first, so :focus-visible applies to the programmatic focus
  await row(p, first).focus();
  await p.waitForTimeout(300);
  check("a11y: keyboard focus on a row highlights its pin", (await p.locator(".nh-pin--hover").count()) === 1);
  await p.locator("body").evaluate(() => document.activeElement && document.activeElement.blur());
  const unnamed = await p.evaluate(() => {
    const name = (e) => (e.getAttribute("aria-label") || (e.getAttribute("aria-labelledby") && document.getElementById(e.getAttribute("aria-labelledby"))?.textContent) || e.textContent || e.getAttribute("title") || (e.labels && e.labels[0]?.textContent) || "").trim();
    return [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")]
      .filter((e) => e.offsetParent !== null && !e.closest(".gm-style") && !e.closest(".nh-pin"))
      .filter((e) => !name(e)).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}`);
  });
  check("a11y: every visible button/link/input has an accessible name (outside the Google map)", unnamed.length === 0, unnamed.slice(0, 5).join(" | "));
  const unnamedPins = await p.evaluate(() => [...document.querySelectorAll(".nh-pin")].filter((e) => !e.getAttribute("aria-label")).length);
  check("a11y: every map pin has an aria-label", unnamedPins === 0, String(unnamedPins));
  const chipNoText = await p.evaluate(() => [...document.querySelectorAll(".nh-chip")].filter((e) => !e.textContent.trim()).length);
  check("a11y: every chip carries a text label (colour is not the only signal)", chipNoText === 0);
  const dotNoLabel = await p.evaluate(() => [...document.querySelectorAll("button[id^='row-'] .nh-dot")].filter((e) => !e.getAttribute("aria-label")).length);
  check("a11y: status dots have a name and a distinct shape class", dotNoLabel === 0 && (await p.evaluate(() => new Set([...document.querySelectorAll(".nh-dot")].map((e) => [...e.classList].find((c) => c.startsWith("nh-dot--")))).size)) >= 2);

  const cc = await cornerCover(p);
  check("bottom-left corner: nothing covers a list row's text at 1440x860", cc.hits.length === 0, cc.hits.slice(0, 3).join(" | "));
  await s.ctx.close();
}

// ===================================================================================================
// 1366x650 with the brief open: results list scrolls
// ===================================================================================================
{
  const s = await open(browser, { w: 1366, h: 650 });
  const { p } = s;
  await p.locator("summary:visible", { hasText: "Claim information" }).first().click();
  await p.waitForTimeout(200);
  const ul = results(p);
  const m = await ul.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  const w = await wheelMoves(p, ul);
  const pm = await pageMetrics(p);
  check("1366x650, brief open: results list scrolls", m.sh > m.ch && m.ch >= 150 && w.moved, `list ${m.ch}/${m.sh}, wheel ${w.before}->${w.after}`);
  check("1366x650, brief open: page does not scroll", pm.scrollHeight <= pm.innerHeight && pm.scrollWidth <= pm.innerWidth && pm.scrollY === 0, JSON.stringify(pm));
  const g = await rowGeometry(p);
  check("1366x650: chips do not overlap, one dot per row", g.overlaps.length === 0 && g.dots.length === 0 && g.escapes.length === 0, `${g.overlaps.slice(0, 3)}`);
  await p.screenshot({ path: `${OUT}/real-1366x650-brief-open.png` });
  await s.ctx.close();
}

// ===================================================================================================
// Phone 390x844 (light) and dark
// ===================================================================================================
for (const theme of ["light", "dark"]) {
  const s = await open(browser, { w: 390, h: 844, theme });
  const { p } = s;
  const pm = await pageMetrics(p);
  check(`phone ${theme}: no sideways scroll`, pm.scrollWidth <= pm.innerWidth, JSON.stringify(pm));
  await openList(s);
  const g = await rowGeometry(p);
  check(`phone ${theme}: one dot per row, chips do not overlap`, g.rows > 0 && g.dots.length === 0 && g.overlaps.length === 0 && g.escapes.length === 0, `${g.rows} rows ${g.overlaps.slice(0, 3)} ${g.escapes.slice(0, 3)}`);
  const sheet = await p.locator("div.rounded-t-xl").first().evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  check(`phone ${theme}: results sheet has no sideways scroll`, sheet.sw <= sheet.cw, JSON.stringify(sheet));
  if (theme === "dark") check("dark: theme applied", (await p.locator("html").getAttribute("data-theme")) === "dark");
  const cc = await cornerCover(p);
  check(`phone ${theme}: nothing covers a list row's text in the bottom-left corner`, cc.hits.length === 0, cc.hits.slice(0, 3).join(" | "));
  await p.screenshot({ path: `${OUT}/real-phone-${theme}-list.png` });
  await selectRow(s, withClaims.monday_item_id);
  const pm2 = await pageMetrics(p);
  check(`phone ${theme}: no sideways scroll with the panel open`, pm2.scrollWidth <= pm2.innerWidth, JSON.stringify(pm2));
  await p.screenshot({ path: `${OUT}/real-phone-${theme}-panel.png` });
  await s.ctx.close();
}
{
  const s = await open(browser, { w: 1440, h: 860, theme: "dark" });
  await selectRow(s, withClaims.monday_item_id);
  await s.p.screenshot({ path: `${OUT}/real-desktop-dark.png` });
  await s.ctx.close();
}

await browser.close();
check("no console errors, page errors or dialogs", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
