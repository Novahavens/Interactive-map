// The Quo contact digest on the owner card, in every state. Real /api/properties*; the claim endpoints and
// /api/properties/:id/contact are mocked, so it runs without a Quo key and writes nothing.
//
//   BASE=http://localhost:3012 node tests/browser/contact-digest.mjs [screenshot-dir]
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3012";
const OUT = process.argv[2] ?? "test-results/contact-digest";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PW_CORE = process.env.PW_CORE ?? "/tmp/claude-0/-home-user-Interactive-map/519172db-2710-58fd-844f-0ffa565c5e27/scratchpad/pw/node_modules/playwright-core/index.mjs";
const { chromium } = await import("playwright-core").catch(() => import(PW_CORE));
fs.mkdirSync(OUT, { recursive: true });

const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-2001", loss: LOSS, needs, attached: [], attachedPins: [], brief: { accountManager: "Melissa C." } };
const claims = [{ id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." }];

const numbers = [{ label: "Owner", phone: "+19185550100" }];
const digest = (o = {}, truncated = false) => ({
  calls: { total: 3, outgoing: 3, incoming: 0, missed: 1, last: { at: "2026-10-24T16:00:00Z", direction: "outgoing", by: "William", answered: true, durationSec: 190 }, truncated },
  texts: { sent: 4, received: 1, last: { at: "2026-10-25T09:00:00Z", direction: "incoming", by: null, preview: "Yes, it's free from Nov 1" }, truncated },
  lastContactAt: "2026-10-25T09:00:00Z",
  ...o,
});
const zero = digest({ calls: { total: 0, outgoing: 0, incoming: 0, missed: 0, last: null, truncated: false }, texts: { sent: 0, received: 0, last: null, truncated: false }, lastContactAt: null });

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};

// A real property near the loss that has an owner phone, so the card renders the digest slot.
const pins = (await (await fetch(`${BASE}/api/properties?lat=${LOSS.lat}&lng=${LOSS.lng}&miles=10`)).json()).pins;
let target = null;
for (const p of pins.filter((x) => x.map_status !== "red").slice(0, 40)) {
  const d = await (await fetch(`${BASE}/api/properties/${p.monday_item_id}`)).json();
  if (d.owner_phone && !d.landlord_phone) { target = d; break; }
}
check("precondition: a nearby, addable property with an owner phone", !!target, target?.monday_item_id);

const browser = await chromium.launch({ executablePath: CHROME });

async function scenario(name, contact, { w = 1440, h = 900, theme = "light", delay = 0, quo = true, open = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("nh-theme", t); } catch {} }, theme);
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims, count: 1 } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: claim }));
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: true, quo } }));
  let contactCalls = 0;
  await ctx.route(/\/api\/properties\/\d+\/contact$/, async (r) => {
    contactCalls++;
    if (delay) await new Promise((res) => setTimeout(res, delay));
    await r.fulfill(contact);
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|502/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${BASE}/?claimId=${CLAIM_ID}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(3500);
  if (w < 1024) {
    await p.getByRole("button", { name: /within/ }).first().click();
    await p.waitForTimeout(500);
  }
  const row = p.locator(`[id="row-${target.monday_item_id}"]:visible`).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const panel = p.locator('aside[aria-label="Property details"]:visible').first();
  await panel.waitFor();
  await panel.getByText("Contacts", { exact: true }).waitFor();
  if (open && quo) await drawer(panel).locator("summary").click();
  return { ctx, p, panel, contactCalls: () => contactCalls };
}
const drawer = (panel) => panel.locator("details", { hasText: "Contact history · Quo" });
const box = drawer;
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

// 0. Closed by default: a heading only, and Quo isn't asked until it's opened
{
  const s = await scenario("closed", { json: { enabled: true, numbers, digest: digest() } }, { open: false });
  await drawer(s.panel).waitFor();
  await s.p.waitForTimeout(800);
  check("drawer: closed by default", !(await drawer(s.panel).evaluate((d) => d.open)));
  check("drawer: nothing asked of Quo while closed", s.contactCalls() === 0);
  check("drawer: the history isn't visible while closed", !(await drawer(s.panel).getByText("Last call").isVisible()));
  const sum = await drawer(s.panel).locator("summary").boundingBox();
  check("drawer: header is a 44px touch target", sum.height >= 44, String(sum.height));
  await drawer(s.panel).scrollIntoViewIfNeeded();
  await s.p.screenshot({ path: `${OUT}/drawer-closed.png` });
  await drawer(s.panel).locator("summary").click();
  await drawer(s.panel).getByText("Last call").waitFor();
  check("drawer: opening it loads the history (one request)", s.contactCalls() === 1);
  await drawer(s.panel).locator("summary").click();
  await drawer(s.panel).locator("summary").click();
  await s.p.waitForTimeout(400);
  check("drawer: closing and reopening doesn't ask Quo again", s.contactCalls() === 1);
  await s.ctx.close();
}
// 1. Full digest
{
  const s = await scenario("full", { json: { enabled: true, numbers, digest: digest() } });
  await box(s.panel).getByText("Last call").waitFor();
  const t = await text(box(s.panel));
  check("digest: last call with date, teammate and length", t.includes("Last call Oct 24 · William · 3 min"), t);
  check("digest: call count with unanswered", t.includes("3 calls · 1 unanswered"));
  check("digest: texts sent and replies", t.includes("4 sent · 1 reply"));
  check("digest: last message preview", t.includes("They texted Oct 25: “Yes, it's free from Nov 1”"));
  check("digest: sits inside the Contacts section", (await s.panel.locator("section", { hasText: "Contacts" }).locator("details", { hasText: "Contact history · Quo" }).count()) === 1);
  check("digest: one request per panel open", s.contactCalls() === 1);
  await box(s.panel).scrollIntoViewIfNeeded();
  await s.p.screenshot({ path: `${OUT}/digest-desktop-light.png` });
  await s.ctx.close();
}
// 2. Loading, then a missed call
{
  const s = await scenario(
    "loading",
    { json: { enabled: true, numbers, digest: digest({ calls: { total: 1, outgoing: 1, incoming: 0, missed: 1, last: { at: "2026-10-22T15:00:00Z", direction: "outgoing", by: "Virginia", answered: false, durationSec: 0 }, truncated: false }, texts: { sent: 0, received: 0, last: null, truncated: false } }) } },
    { delay: 1500 },
  );
  check("loading: shows 'Checking Quo…' while waiting", (await box(s.panel).getByText("Checking Quo…").count()) === 1);
  await box(s.panel).getByText("no answer").waitFor();
  const t = await text(box(s.panel));
  check("missed call: 'Called Oct 22 · Virginia · no answer'", t.includes("Called Oct 22 · Virginia · no answer"), t);
  check("missed call: no text chip when nothing was texted", !t.includes("sent ·"));
  await s.ctx.close();
}
// 2b. They texted first: "2 received", no "0 sent"
{
  const s = await scenario("received", { json: { enabled: true, numbers, digest: digest({ texts: { sent: 0, received: 2, last: { at: "2026-10-25T09:00:00Z", direction: "incoming", by: null, preview: "https://example.com/" + "x".repeat(70) }, truncated: false } }) } });
  await box(s.panel).getByText("received").waitFor();
  const t = await text(box(s.panel));
  check("texts received only: '2 received', no '0 sent'", t.includes("2 received") && !t.includes("0 sent"), t);
  const pre = box(s.panel).locator("p").last();
  const [pb, gb] = [await pre.boundingBox(), await box(s.panel).boundingBox()];
  check("a long unbroken preview wraps inside the card", pb.x + pb.width <= gb.x + gb.width + 1);
  await s.ctx.close();
}
// 2c. Two numbers, one unreadable, the other quiet: say so, don't claim "no history"
{
  const two = [numbers[0], { label: "Landlord / PM", phone: "+19185550200" }];
  const s = await scenario("unread", { json: { enabled: true, numbers: two, digest: { ...zero, unread: 1, calls: { ...zero.calls, truncated: true }, texts: { ...zero.texts, truncated: true } } } });
  await box(s.panel).getByText("Couldn't read").waitFor();
  const t = await text(box(s.panel));
  check("unread number: 'Couldn't read 1 of the 2 numbers'", t.includes("Couldn't read 1 of the 2 numbers from Quo right now."), t);
  check("unread number: no false 'No calls or texts'", !t.includes("No calls or texts"));
  await s.ctx.close();
}
// 3. No history
{
  const s = await scenario("none", { json: { enabled: true, numbers, digest: zero } });
  await box(s.panel).getByText("No calls or texts").waitFor();
  check("no history: says so", (await text(box(s.panel))).includes("No calls or texts in Quo yet."));
  await s.ctx.close();
}
// 4. No Quo key: nothing at all
{
  const s = await scenario("disabled", { json: { enabled: false, numbers: [], digest: null } }, { quo: false });
  await s.p.waitForTimeout(800);
  check("no Quo key: no drawer at all", (await drawer(s.panel).count()) === 0);
  check("no Quo key: Quo never asked", s.contactCalls() === 0);
  await s.ctx.close();
}
// 5. Quo down: a quiet line, the rest of the panel unaffected
{
  const s = await scenario("error", { status: 502, json: { error: "Couldn't reach Quo", code: "quo_error" } });
  await box(s.panel).getByText("Couldn't reach Quo").waitFor();
  check("Quo error: quiet message", true);
  check("Quo error: Add to claim still there", (await s.panel.getByRole("button", { name: /Add to claim/ }).count()) === 1);
  await s.ctx.close();
}
// 6. Truncated counts, phone, dark
{
  const s = await scenario("phone", { json: { enabled: true, numbers, digest: digest({}, true) } }, { w: 390, h: 844, theme: "dark" });
  await box(s.panel).getByText("Last call").waitFor();
  const t = await text(box(s.panel));
  check("truncated: counts read as lower bounds", t.includes("3+ calls") && t.includes("4+ sent"), t);
  const overflow = await s.p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("phone: no sideways scroll", !overflow);
  const chips = await box(s.panel).locator(".nh-digest").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  const panelRight = (await s.panel.boundingBox()).x + (await s.panel.boundingBox()).width;
  check("phone: chips stay inside the panel", chips.every((r) => r <= panelRight + 1));
  await box(s.panel).scrollIntoViewIfNeeded();
  await s.p.screenshot({ path: `${OUT}/digest-phone-dark.png` });
  await s.ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
