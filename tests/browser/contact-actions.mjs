// The Call and Text buttons on the owner card: tel: on a laptop (Quo click-to-call), openphone:// on a
// phone, the desktop Text button copying the number and trying Quo's scheme, the "didn't open" hints,
// and copy-on-tap of the number. Real /api/properties*; claims, health and the Quo digest are mocked,
// so it runs without a Quo key and writes nothing.
//
//   BASE=http://localhost:3012 node tests/browser/contact-actions.mjs [screenshot-dir]
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3012";
const OUT = process.argv[2] ?? "test-results/contact-actions";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PW_CORE = process.env.PW_CORE ?? "/tmp/claude-0/-home-user-Interactive-map/519172db-2710-58fd-844f-0ffa565c5e27/scratchpad/pw/node_modules/playwright-core/index.mjs";
const { chromium } = await import("playwright-core").catch(() => import(PW_CORE));
fs.mkdirSync(OUT, { recursive: true });

const LOSS = { lat: 36.0865, lng: -95.8593, address: "100 Demo Street, Tulsa, OK 74133, USA" };
const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-11-02" };
const CLAIM_ID = "100000001";
const claim = { id: CLAIM_ID, name: "Demo Family — Test #DEMO-2001", loss: LOSS, needs, attached: [], attachedPins: [], brief: { accountManager: "Melissa C." } };
const claims = [{ id: CLAIM_ID, name: claim.name, lossAddress: LOSS.address, lat: LOSS.lat, lng: LOSS.lng, needs, createdAt: "2026-10-19T15:00:00Z", status: "Working on it", attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: "Melissa C." }];
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};

// A real property near the loss with an owner phone: the detail is read for real, then its phone and
// names are overridden so the test is deterministic and no real number appears in screenshots.
const pins = (await (await fetch(`${BASE}/api/properties?lat=${LOSS.lat}&lng=${LOSS.lng}&miles=10`)).json()).pins;
let target = null;
for (const p of pins.filter((x) => x.map_status !== "red").slice(0, 40)) {
  const d = await (await fetch(`${BASE}/api/properties/${p.monday_item_id}`)).json();
  if (d.owner_phone) { target = d; break; }
}
check("precondition: a nearby, addable property with an owner phone", !!target, target?.monday_item_id);
const detail = { ...target, address: "12 Elm St, Tulsa, OK 74133, USA", owner_name: "Jane Doe", owner_phone: "(918) 555-0100 / 918-555-0199", landlord_name: "Acme Properties LLC", landlord_phone: "+1 (405) 555-0123" };
const E1 = "+19185550100";
const E2 = "+19185550199";
const E3 = "+14055550123";

const browser = await chromium.launch({ executablePath: CHROME });

async function open(name, { w = 1440, h = 900, theme = "light", mobile = false, reporter = "" } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    permissions: ["clipboard-read", "clipboard-write"],
    ...(mobile ? { userAgent: IPHONE_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(
    ({ t, r }) => {
      try {
        localStorage.setItem("nh-theme", t);
        if (r) localStorage.setItem("nh-reporter-name", r);
      } catch {}
    },
    { t: theme, r: reporter },
  );
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims, count: 1 } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: claim }));
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: true, quo: false } }));
  await ctx.route(new RegExp(`/api/properties/${target.monday_item_id}$`), (r) => r.fulfill({ json: detail }));
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
  const contacts = panel.locator("section", { hasText: "Contacts" }).first();
  await contacts.getByText("Jane Doe").waitFor();
  await contacts.scrollIntoViewIfNeeded();
  return { ctx, p, panel, contacts };
}
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

// ---------- desktop ----------
{
  const { ctx, p, contacts } = await open("desktop", { reporter: "Will" });
  const calls = contacts.locator('[data-quo="call"]');
  const texts = contacts.locator('[data-quo="text"]');
  check("one Call and one Text per number: two owner numbers + one landlord", (await calls.count()) === 3 && (await texts.count()) === 3);
  check("both numbers in the owner cell are shown, formatted", (await text(contacts)).includes("(918) 555-0100") && (await text(contacts)).includes("(918) 555-0199"));
  check("desktop Call is a tel: link (Quo click-to-call)", (await calls.nth(0).getAttribute("href")) === `tel:${E1}` && (await calls.nth(2).getAttribute("href")) === `tel:${E3}`);
  check(
    "desktop Text links to openphone://message with the number and the draft from the remembered name",
    (await texts.nth(0).getAttribute("href")) === `openphone://message?number=%2B19185550100&selectedAsFallback=true&text=${encodeURIComponent("Hi Jane, it's Will from Nova Havens about 12 Elm St. ")}`,
    await texts.nth(0).getAttribute("href"),
  );
  // Headless Chromium freezes input after any custom-scheme navigation, so the links are stopped from
  // navigating; the click handlers (copy, hints) still run.
  await contacts.locator("[data-quo]").evaluateAll((as) => as.forEach((a) => a.addEventListener("click", (e) => e.preventDefault())));
  check("buttons name the number for screen readers", (await calls.nth(0).getAttribute("aria-label")) === "Call (918) 555-0100 with Quo");
  await contacts.screenshot({ path: `${OUT}/desktop-light.png` });

  // Text: copies the number, says so, then falls back when nothing takes focus (headless: nothing ever does).
  await texts.nth(0).click();
  await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check("desktop Text put the number on the clipboard", clip === E1, clip);
  check("says what it did", (await text(contacts)).includes("Opening Quo · number copied"));
  await p.waitForTimeout(1800);
  const after = await text(contacts);
  check("when Quo doesn't take focus: a hint with a link to Quo on the web", after.includes("Quo didn't open") && after.includes("open Quo"));
  check("hint link goes to my.quo.com", (await contacts.locator('a[href="https://my.quo.com"]').count()) === 1);
  await contacts.screenshot({ path: `${OUT}/desktop-text-fallback.png` });
  // Call on desktop: the hint only when nothing takes focus within the grace period.
  await p.waitForTimeout(9200); // the Text hint has gone by itself
  check("hints clear themselves", !(await text(contacts)).includes("Quo didn't"));
  await calls.nth(0).click();
  await p.waitForTimeout(400);
  const during = await text(contacts);
  await p.waitForTimeout(1500);
  const callHint = await text(contacts);
  check("no hint while Quo still has time to answer the call", !during.includes("Quo didn't open"), during.slice(0, 120));
  check("when Quo doesn't take the call: a hint linking to the click-to-call setup", callHint.includes("Quo didn't open?") && callHint.includes("default calling app"));
  check("call hint links to Quo's click-to-call article", (await contacts.locator('a[href="https://support.quo.com/core-concepts/calling/click-to-call"]').count()) === 1);

  // Tap the number: copied.
  await contacts.getByTitle("Copy number").nth(1).click();
  await p.waitForTimeout(100);
  check("tapping the number copies it", (await p.evaluate(() => navigator.clipboard.readText())) === E2);
  check("…and says Copied", (await contacts.getByText("Copied", { exact: true }).count()) === 1);
  await p.waitForTimeout(1700);
  check("…then the tick goes away", (await contacts.getByText("Copied", { exact: true }).count()) === 0);

  // Keyboard: the buttons are reachable and 44px tall targets on touch, 32px here.
  const h = await calls.nth(0).evaluate((e) => e.getBoundingClientRect().height);
  check("buttons are 28px tall with a mouse (root font 14px)", h === 28, String(h));
  await ctx.close();
}

// ---------- phone (iPhone UA): plain openphone:// links, no draft name when none is remembered ----------
{
  const { ctx, p, contacts } = await open("phone", { w: 390, h: 844, theme: "dark", mobile: true });
  const calls = contacts.locator('[data-quo="call"]');
  const texts = contacts.locator('[data-quo="text"]');
  check("phone Call opens Quo's dialer", (await calls.nth(0).getAttribute("href")) === `openphone://dial?number=%2B19185550100`);
  check("phone Text is a link", (await texts.nth(0).evaluate((e) => e.tagName)) === "A");
  check(
    "phone Text opens Quo's composer with the draft (no sender name remembered)",
    (await texts.nth(0).getAttribute("href")) === `openphone://message?number=%2B19185550100&selectedAsFallback=true&text=${encodeURIComponent("Hi Jane, this is Nova Havens about 12 Elm St. ")}`,
    await texts.nth(0).getAttribute("href"),
  );
  check(
    "landlord draft keeps a company name whole",
    (await texts.nth(2).getAttribute("href")) === `openphone://message?number=%2B14055550123&selectedAsFallback=true&text=${encodeURIComponent("Hi Acme Properties LLC, this is Nova Havens about 12 Elm St. ")}`,
  );
  const h = await calls.nth(0).evaluate((e) => e.getBoundingClientRect().height);
  check("touch targets are 44px tall and at least 44px wide", h === 44 && (await calls.nth(0).evaluate((e) => e.getBoundingClientRect().width)) >= 44, String(h));
  check("tapping the number is a 44px target too", (await contacts.getByTitle("Copy number").first().evaluate((e) => e.getBoundingClientRect().height)) === 44);
  check("no hint shown before any tap", !(await text(contacts)).includes("Quo didn't"));
  await contacts.screenshot({ path: `${OUT}/phone-dark.png` });
  await p.screenshot({ path: `${OUT}/phone-dark-full.png` });
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
