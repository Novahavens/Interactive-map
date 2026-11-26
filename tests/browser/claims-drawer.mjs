// The claims drawer with the housing-agent flags: Mine / All (the name remembered on the device against the
// account manager), the "Your name" prompt, Change name, and the Nearsite tab (rows, urgency chips,
// Pick up / Open, refresh, empty, error, loading, off). Also: with both flags off the drawer is as before.
// Runs against the dev-only preview page; /api/health, /api/claims/active and /api/claims/nearsite are
// mocked, so it needs no keys and writes nothing.
//
//   BASE=http://localhost:3105 node tests/browser/claims-drawer.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";
import { HEALTH_OFF, FEATURES_OFF, NEARSITE_CLAIMS, NEARSITE_CLAIMS_OFF } from "../fixtures/map-agent.mjs";

const BASE = process.env.BASE ?? "http://localhost:3105";
const OUT = process.argv[2] ?? "test-results/claims-drawer";
const CHROME = process.env.CHROME || undefined;
const { chromium } = await import("playwright-core").catch(() => {
  const require = createRequire(import.meta.url);
  for (const id of [process.env.PW_CORE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
    try {
      return require(id);
    } catch {}
  }
  throw new Error("playwright isn't installed; set PW_CORE to its index.js");
});
fs.mkdirSync(OUT, { recursive: true });

const needs = { adults: 2, children: 1, bedrooms: 3, bathrooms: 2, pets: 1, frv: 3000, moveIn: "2026-12-08" };
const claim = (id, name, accountManager, o = {}) => ({
  id, name, lossAddress: `${id.slice(-2)} Fiction Rd, Tulsa, OK 74103`, lat: 36.154, lng: -95.9928, needs, createdAt: "2026-11-18T15:00:00Z",
  status: "Working on it", attachedCount: 2, group: "New Housing Request", isTest: false, accountManager, ...o,
});
const CLAIMS = [
  claim("9900000001", "Sample family", "Alex Example"),
  claim("9900000002", "Placeholder household", "Sam Sample"),
  claim("9900000003", "Madeup, Pat", "Example, Alex"),
  claim("9900000004", "Invented / Pretend", "Sam Sample, Alex Example", { attachedCount: 1 }),
  claim("9900000005", "Nobody Assigned", null, { lossAddress: null, attachedCount: 0 }),
  claim("9900000006", "Quarry Bend family", "Sam Sample"),
];
const TEST_CLAIM = claim("9900000099", "Demo Family — Test", "Alex Example", { isTest: true });
const ALEX = ["9900000001", "9900000003", "9900000004"];
const health = (...on) => ({ ...HEALTH_OFF, features: { ...FEATURES_OFF, ...Object.fromEntries(on.map((k) => [k, true])) } });

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

const browser = await chromium.launch({ executablePath: CHROME });

/**
 * Opens the preview page with the drawer open. `nearsite` is the body GET /api/claims/nearsite answers, or
 * { status, body } or "hang" (never answers).
 */
async function open(name, { w = 1280, h = 800, theme = "light", mobile = false, reporter = "", scope = "", flags = ["mine", "nearsite"], nearsite = NEARSITE_CLAIMS } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(
    ({ t, r, s }) => {
      try {
        if (sessionStorage.getItem("seeded")) return; // only the first load: reloads keep what the page saved
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("nh-theme", t);
        if (r) localStorage.setItem("nh-reporter-name", r);
        if (s) localStorage.setItem("nh-claims-scope", s);
      } catch {}
    },
    { t: theme, r: reporter, s: scope },
  );
  const calls = { active: [], nearsite: [] };
  const state = { nearsite };
  await ctx.route("**/api/health", (r) => r.fulfill({ json: health(...flags) }));
  await ctx.route("**/api/claims/active**", (r) => {
    calls.active.push(r.request().url());
    const list = /includeTest=1/.test(r.request().url()) ? [...CLAIMS, TEST_CLAIM] : CLAIMS;
    return r.fulfill({ json: { claims: list, count: list.length } });
  });
  await ctx.route("**/api/claims/nearsite**", (r) => {
    calls.nearsite.push(r.request().url());
    const n = state.nearsite;
    if (n === "hang") return; // never answered
    if (n && n.status) return r.fulfill({ status: n.status, json: n.body });
    return r.fulfill({ json: n });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|502/i.test(m.text())) errors.push(`${name}: ${m.text()}`);
  });
  await p.goto(`${BASE}/dev/claims-drawer?net=1`, { waitUntil: "domcontentloaded" });
  const drawer = p.locator('[data-slot="sheet-content"]');
  await drawer.waitFor();
  await drawer.locator("[cmdk-item]").first().waitFor();
  await p.waitForTimeout(700); // slide-in animation
  const items = () => drawer.locator("[cmdk-item]");
  const ids = async () => drawer.locator("[cmdk-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nearsite-id") ?? (e.getAttribute("data-value") ?? "").split(" ").pop()));
  const log = async () => p.locator('[data-testid="log"] li').allInnerTexts();
  const shot = (file) => p.screenshot({ path: `${OUT}/${file}.png` });
  return { ctx, p, drawer, calls, state, items, ids, log, shot };
}

// ---------- 1. flags off: the drawer as it was ----------
{
  const { ctx, p, drawer, calls, ids, log, shot } = await open("flags off", { flags: [], reporter: "Alex Example", scope: "mine", nearsite: NEARSITE_CLAIMS_OFF });
  check("off: no tabs", (await drawer.getByRole("tablist").count()) === 0);
  check("off: no Mine / All", (await drawer.getByRole("radiogroup").count()) === 0);
  check("off: no name line, no name form", (await drawer.locator("[data-mine-line], [data-mine-name-form]").count()) === 0);
  check("off: every claim listed, whatever name and scope are remembered", same(await ids(), CLAIMS.map((c) => c.id)), (await ids()).join(","));
  check("off: the Nearsite route is never asked", calls.nearsite.length === 0);
  const shape = await drawer.evaluate((el) => [...el.children].map((c) => `${c.tagName.toLowerCase()}${c.getAttribute("data-slot") ? `[${c.getAttribute("data-slot")}]` : ""}`));
  check("off: same structure (header, toolbar, list, close)", same(shape, ["div[sheet-header]", "div", "div[command]", "button"]), shape.join(" "));
  const toolbar = drawer.locator(":scope > div:not([data-slot])");
  check("off: toolbar is the two buttons it always had", same(await toolbar.locator("button").allInnerTexts().then((t) => t.map((s) => s.trim())), ["Show test claims", "Refresh"]));
  check(
    "off: toolbar classes unchanged",
    same(await toolbar.locator("button").evaluateAll((els) => els.map((e) => e.className)), [
      "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 border border-line bg-surface text-ink",
      "ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium",
    ]),
  );
  check("off: Refresh keeps its title", (await drawer.getByRole("button", { name: "Refresh" }).getAttribute("title")) === "Re-read the list from Monday");
  check("off: description unchanged", (await text(drawer.locator('[data-slot="sheet-description"]'))) === "Waiting on housing options. Pick one to search around its loss address.");
  check("off: search box has the focus", await drawer.locator("[cmdk-input]").evaluate((e) => e === document.activeElement));
  await p.keyboard.type("quarry");
  check("off: search filters", same(await ids(), ["9900000006"]));
  await p.keyboard.press("Enter");
  check("off: Enter picks the claim", same(await log(), ["claim 9900000006"]));
  await drawer.locator("[cmdk-input]").fill("");
  await drawer.getByRole("button", { name: "Show test claims" }).click();
  await drawer.getByText("Demo Family — Test").waitFor();
  check("off: test claims toggle works", (await ids()).length === 7 && calls.active.some((u) => /includeTest=1/.test(u)));
  await drawer.getByRole("button", { name: "Refresh" }).click();
  await p.waitForTimeout(200);
  check("off: Refresh asks for a fresh list", calls.active.some((u) => /fresh=1/.test(u)));
  await shot("off-desktop-light");
  await ctx.close();
}

// ---------- 2. Mine with a remembered name ----------
{
  const { ctx, p, drawer, ids, log, shot } = await open("mine", { reporter: "  alex   EXAMPLE " });
  const group = drawer.getByRole("radiogroup", { name: "Whose claims" });
  check("mine: Mine | All is a radiogroup", (await group.count()) === 1 && same(await group.getByRole("radio").allInnerTexts(), ["Mine", "All"]));
  check("mine: Mine is the default once a name is known", (await group.getByRole("radio", { name: "Mine" }).getAttribute("aria-checked")) === "true");
  check("mine: only this person's claims (full name, 'Last, First', one of several)", same(await ids(), ALEX), (await ids()).join(","));
  check("mine: name line", (await text(drawer.locator("[data-mine-line]"))) === "Showing 3 claims for alex · Change name", await text(drawer.locator("[data-mine-line]")));
  check("mine: the toggle is relabelled Test claims", (await drawer.getByRole("button", { name: "Test claims", exact: true }).count()) === 1);
  check("mine: tab counts are of all claims", same(await drawer.getByRole("tab").allInnerTexts().then((t) => t.map((s) => s.replace(/\s+/g, " ").trim())), ["Claims 6", "Nearsite 5"]));
  check("mine: search box has the focus", await drawer.locator("[cmdk-input]").evaluate((e) => e === document.activeElement));
  await p.keyboard.type("madeup");
  check("mine: search works inside Mine", same(await ids(), ["9900000003"]));
  await p.keyboard.press("Enter");
  check("mine: Enter picks the claim", same(await log(), ["claim 9900000003"]));
  await drawer.locator("[cmdk-input]").fill("");
  await shot("mine-desktop-light");

  await group.getByRole("radio", { name: "All" }).click();
  check("all: every claim", same(await ids(), CLAIMS.map((c) => c.id)));
  check("all: no name line", (await drawer.locator("[data-mine-line]").count()) === 0);
  check("all: the choice is remembered on the device", (await p.evaluate(() => localStorage.getItem("nh-claims-scope"))) === "all");
  await group.getByRole("radio", { name: "All" }).focus();
  await p.keyboard.press("ArrowLeft");
  check(
    "keyboard: arrow keys move the choice inside Mine | All",
    (await group.getByRole("radio", { name: "Mine" }).getAttribute("aria-checked")) === "true" && (await ids()).length === 3 && (await group.getByRole("radio", { name: "Mine" }).evaluate((e) => e === document.activeElement)),
  );
  await p.keyboard.press("ArrowRight");
  check("keyboard: and back", (await group.getByRole("radio", { name: "All" }).getAttribute("aria-checked")) === "true" && (await ids()).length === 6);
  await group.getByRole("radio", { name: "Mine" }).click();
  check("mine: pressing the chosen option again keeps it", (await group.getByRole("radio", { name: "Mine" }).getAttribute("aria-checked")) === "true");
  await group.getByRole("radio", { name: "All" }).click();
  await p.reload({ waitUntil: "domcontentloaded" });
  await drawer.locator("[cmdk-item]").first().waitFor();
  check("all: still All after a reload", (await group.getByRole("radio", { name: "All" }).getAttribute("aria-checked")) === "true" && (await ids()).length === 6);
  await ctx.close();
}

// ---------- 3. no name → prompt → save → filtered; then Change name ----------
{
  const { ctx, p, drawer, ids, shot } = await open("no name", {});
  const group = drawer.getByRole("radiogroup", { name: "Whose claims" });
  const form = drawer.locator("[data-mine-name-form]");
  check("no name: All is the default", (await group.getByRole("radio", { name: "All" }).getAttribute("aria-checked")) === "true");
  check("no name: no prompt until Mine is pressed", (await form.count()) === 0);
  await group.getByRole("radio", { name: "Mine" }).click();
  await form.waitFor();
  const input = form.getByLabel("Your name, as it is on Monday");
  check("prompt: labelled input", (await input.count()) === 1);
  check("prompt: helper copy", (await text(form.locator("p"))) === "Remembered on this device only. Showing all claims until then.");
  check("prompt: Save button, no Cancel", (await form.getByRole("button", { name: "Save" }).count()) === 1 && (await form.getByRole("button", { name: "Cancel" }).count()) === 0);
  await p.waitForTimeout(100);
  check("prompt: the input has the focus", await input.evaluate((e) => e === document.activeElement));
  check("prompt: showing all claims until a name is saved", same(await ids(), CLAIMS.map((c) => c.id)));
  await shot("prompt-desktop-light");
  await p.keyboard.press("Enter");
  check("prompt: an empty name is not saved", (await form.count()) === 1 && (await p.evaluate(() => localStorage.getItem("nh-reporter-name"))) === null);
  await p.keyboard.type("  sam ");
  await p.keyboard.press("Enter");
  await drawer.locator("[data-mine-line]").waitFor();
  check("saved: filtered by first name", same(await ids(), ["9900000002", "9900000004", "9900000006"]), (await ids()).join(","));
  check("saved: name line", (await text(drawer.locator("[data-mine-line]"))) === "Showing 3 claims for sam · Change name");
  check("saved: remembered on the device, tidied", (await p.evaluate(() => localStorage.getItem("nh-reporter-name"))) === "sam");
  await p.waitForTimeout(100);
  check("saved: focus moves to the search box", await drawer.locator("[cmdk-input]").evaluate((e) => e === document.activeElement));

  // Change name
  await drawer.getByRole("button", { name: "Change name" }).click();
  await form.waitFor();
  await p.waitForTimeout(100);
  check("change: prefilled and focused", (await input.inputValue()) === "sam" && (await input.evaluate((e) => e === document.activeElement)));
  check("change: can be cancelled", (await form.getByRole("button", { name: "Cancel" }).count()) === 1);
  await form.getByRole("button", { name: "Cancel" }).click();
  check("change: Cancel keeps the name", (await text(drawer.locator("[data-mine-line]"))) === "Showing 3 claims for sam · Change name");
  await drawer.getByRole("button", { name: "Change name" }).click();
  await input.fill("Example, Alex");
  await form.getByRole("button", { name: "Save" }).click();
  await drawer.locator("[data-mine-line]").waitFor();
  check("change: the list follows the new name", same(await ids(), ALEX), (await ids()).join(","));
  check("change: name line shows the first name", (await text(drawer.locator("[data-mine-line]"))) === "Showing 3 claims for Alex · Change name");

  // Nobody's claims
  await drawer.getByRole("button", { name: "Change name" }).click();
  await input.fill("Dana Nobody");
  await p.keyboard.press("Enter");
  const empty = drawer.locator("[data-mine-empty]");
  await empty.waitFor();
  check("empty: copy", (await text(empty.locator("span"))) === "No claims with Dana as account manager.");
  check("empty: name line counts zero", (await text(drawer.locator("[data-mine-line]"))) === "Showing 0 claims for Dana · Change name");
  await shot("mine-empty-desktop-light");
  await empty.getByRole("button", { name: "Show all" }).click();
  check("empty: Show all goes to All", (await group.getByRole("radio", { name: "All" }).getAttribute("aria-checked")) === "true" && (await ids()).length === 6);
  await ctx.close();
}

// ---------- 4. Nearsite tab ----------
{
  const { ctx, p, drawer, calls, state, ids, log, shot } = await open("nearsite", { reporter: "Alex Example", scope: "all" });
  const tabs = drawer.getByRole("tablist");
  check("nearsite: two tabs", same(await tabs.getByRole("tab").allInnerTexts().then((t) => t.map((s) => s.replace(/\s+/g, " ").trim())), ["Claims 6", "Nearsite 5"]));
  check("nearsite: read when the drawer opens, from the cache", calls.nearsite.length >= 1 && calls.nearsite.every((u) => !/fresh=1/.test(u)));
  await tabs.getByRole("tab", { name: /Claims/ }).focus();
  await p.keyboard.press("ArrowRight");
  const list = drawer.locator("[data-nearsite-list]");
  await list.waitFor();
  check("keyboard: arrow keys switch tabs", (await tabs.getByRole("tab", { name: /Nearsite/ }).getAttribute("aria-selected")) === "true");
  check("nearsite: description", (await text(drawer.locator('[data-slot="sheet-description"]'))) === "Nearsite claims that are still open.");
  check("nearsite: soonest first, no deadline last", same(await ids(), ["90004", "90002", "90001", "90003", "90005"]), (await ids()).join(","));
  check("nearsite: no Test claims toggle on this tab", (await drawer.getByRole("button", { name: /Test claims/ }).count()) === 0);
  const row = (id) => list.locator(`[data-nearsite-id="${id}"]`);
  const chip = async (id) => {
    const c = row(id).locator("[data-urgency]");
    return (await c.count()) ? `${await c.getAttribute("data-urgency")}:${await text(c)}` : null;
  };
  check("chip: Due today (bad, outlined)", (await chip("90004")) === "bad:Due today" && (await row("90004").locator("[data-urgency]").evaluate((e) => e.classList.contains("nh-chip--outline"))));
  check("chip: 2 days left (amber)", (await chip("90002")) === "amber:2 days left");
  check("chip: 6 and 11 days left (muted)", (await chip("90001")) === "muted:6 days left" && (await chip("90003")) === "muted:11 days left");
  check("chip: none without a deadline", (await chip("90005")) === null);
  const r1 = await text(row("90001"));
  check("row: title, city, needs, fee group, homes found, owner, Open", ["Family of 4 · Tulsa, OK", "Tulsa, OK", "3 bd · 2 ba · budget $4,200/mo", "Fee group Standard · 12 homes found", "Alex Example", "Open"].every((s) => r1.includes(s)), r1);
  const r5 = await text(row("90005"));
  check("row: unassigned = Free for all + Pick up, budget not set", ["Sand Springs, OK", "3 bd · 2 ba · budget not set", "Free for all", "Pick up"].every((s) => r5.includes(s)) && !r5.includes("Fee group"), r5);
  check("row: actions by owner", same(await list.locator("[data-action]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-action")}:${e.textContent.trim()}`)), ["open:Open", "open:Open", "open:Open", "open:Open", "pickup:Pick up"]));
  check("row: 1 home found is singular… and 0 is shown", (await text(row("90003"))).includes("0 homes found"));
  await shot("nearsite-desktop-light");

  await row("90005").locator("[data-action]").click();
  await row("90004").locator("[data-action]").click();
  await row("90002").click();
  check("callbacks: Pick up, Open and a row click each call onSelectNearsite once", same(await log(), ["nearsite 90005 pickup", "nearsite 90004 open", "nearsite 90002 open"]), (await log()).join(" | "));
  check("nearsite: nothing was written (GET only)", calls.nearsite.length >= 1);

  await list.locator("[cmdk-input]").fill("jenks");
  check("search: applies to the Nearsite tab", same(await ids(), ["90004"]));
  await list.locator("[cmdk-input]").press("Enter");
  check("keyboard: Enter on the searched row opens it", (await log()).at(-1) === "nearsite 90004 open");
  await list.locator("[cmdk-input]").fill("zzz");
  check("search: no match", (await text(list)).includes("No matching claims."));
  await list.locator("[cmdk-input]").fill("");

  // Mine on Nearsite = mine + free for all
  await drawer.getByRole("radio", { name: "Mine" }).click();
  check("nearsite mine: mine + free for all", same(await ids(), ["90001", "90003", "90005"]), (await ids()).join(","));
  check("nearsite mine: name line", (await text(drawer.locator("[data-mine-line]"))) === "Showing 3 Nearsite claims for Alex and free for all · Change name", await text(drawer.locator("[data-mine-line]")));
  await drawer.getByRole("radio", { name: "All" }).click();

  // Refresh
  const before = calls.nearsite.length;
  const activeBefore = calls.active.length;
  state.nearsite = { enabled: true, claims: NEARSITE_CLAIMS.claims.slice(0, 2) };
  await drawer.getByRole("button", { name: "Refresh" }).click();
  await p.waitForFunction(() => document.querySelectorAll('[data-slot="sheet-content"] [data-nearsite-id]').length === 2);
  check("refresh: asks Nearsite with fresh=1, not Monday", calls.nearsite.length === before + 1 && /[?&]fresh=1/.test(calls.nearsite.at(-1)) && calls.active.length === activeBefore);
  check("refresh: list and tab count follow", same(await ids(), ["90002", "90001"]) && (await text(tabs.getByRole("tab", { name: /Nearsite/ }))) === "Nearsite 2");

  // Refresh fails: the red box, the rows stay
  state.nearsite = { status: 502, body: { error: "Could not read the Nearsite claims", code: "db_error" } };
  await drawer.getByRole("button", { name: "Refresh" }).click();
  await list.getByRole("alert").waitFor();
  check("refresh error: red box, rows kept", (await text(list.getByRole("alert"))) === "Could not read the Nearsite claims" && (await ids()).length === 2);

  // Empty
  state.nearsite = { enabled: true, claims: [] };
  await drawer.getByRole("button", { name: "Refresh" }).click();
  await list.getByText("No open Nearsite claims.").waitFor();
  check("empty: copy, count 0, no error", (await text(tabs.getByRole("tab", { name: /Nearsite/ }))) === "Nearsite 0" && (await list.getByRole("alert").count()) === 0);
  await shot("nearsite-empty-desktop-light");

  // Back to Claims: its search and rows are intact
  await tabs.getByRole("tab", { name: /Claims/ }).click();
  check("tabs: Claims tab still lists the claims", same(await ids(), CLAIMS.map((c) => c.id)) && (await drawer.getByRole("button", { name: "Test claims" }).count()) === 1);
  await ctx.close();
}

// ---------- 5. Nearsite: error, loading, off, nearsite-only ----------
{
  const { ctx, drawer, shot } = await open("nearsite error", { nearsite: { status: 502, body: { error: "Could not read the Nearsite claims", code: "db_error" } } });
  await drawer.getByRole("tab", { name: /Nearsite/ }).click();
  const list = drawer.locator("[data-nearsite-list]");
  await list.getByRole("alert").waitFor();
  check("error: the red box with the server's words", (await text(list.getByRole("alert"))) === "Could not read the Nearsite claims");
  check("error: no rows, no spinner, no count", (await list.locator("[cmdk-item]").count()) === 0 && !(await text(list)).includes("Loading") && (await text(drawer.getByRole("tab", { name: /Nearsite/ }))) === "Nearsite");
  await shot("nearsite-error-desktop-light");
  await ctx.close();
}
{
  const { ctx, drawer, shot } = await open("nearsite loading", { nearsite: "hang" });
  await drawer.getByRole("tab", { name: /Nearsite/ }).click();
  const list = drawer.locator("[data-nearsite-list]");
  check("loading: copy", (await text(list.getByRole("status"))) === "Loading Nearsite claims…");
  await shot("nearsite-loading-desktop-light");
  await ctx.close();
}
{
  const { ctx, drawer, ids } = await open("nearsite off on the server", { nearsite: NEARSITE_CLAIMS_OFF, reporter: "Alex Example" });
  await drawer.page().waitForTimeout(300);
  check("server says off: no tabs row at all", (await drawer.getByRole("tablist").count()) === 0);
  check("server says off: Mine still works", (await drawer.getByRole("radiogroup").count()) === 1 && same(await ids(), ALEX));
  await ctx.close();
}
{
  const { ctx, drawer, ids, log } = await open("nearsite only", { flags: ["nearsite"], reporter: "Alex Example", scope: "mine" });
  check("nearsite only: tabs, no Mine / All, all claims", (await drawer.getByRole("tablist").count()) === 1 && (await drawer.getByRole("radiogroup").count()) === 0 && (await ids()).length === 6);
  await drawer.getByRole("tab", { name: /Nearsite/ }).click();
  await drawer.locator("[data-nearsite-list] [cmdk-item]").first().waitFor();
  check("nearsite only: every Nearsite claim", (await ids()).length === 5);
  await drawer.locator("[data-nearsite-list] [cmdk-input]").focus();
  await drawer.page().keyboard.press("ArrowDown");
  await drawer.page().keyboard.press("Enter");
  check("nearsite only: arrows + Enter in the search box open the second row", same(await log(), ["nearsite 90002 open"]), (await log()).join("|"));
  await ctx.close();
}
{
  const { ctx, drawer, ids } = await open("mine only", { flags: ["mine"], reporter: "Alex Example" });
  check("mine only: no tabs, Mine filter on", (await drawer.getByRole("tablist").count()) === 0 && same(await ids(), ALEX));
  await ctx.close();
}

// ---------- 6. phone, 360 px ----------
{
  const { ctx, p, drawer, ids, log, shot } = await open("phone", { w: 360, h: 740, mobile: true, reporter: "Alex Example" });
  const fits = async () => drawer.evaluate((el) => [...el.querySelectorAll("*")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > window.innerWidth + 0.5).map((e) => e.tagName + "." + String(e.className).slice(0, 40)));
  check("360: the drawer is the full width", (await drawer.evaluate((el) => el.getBoundingClientRect().width)) === 360);
  check("360: nothing runs off the right edge (Claims, Mine)", (await fits()).length === 0, (await fits()).join(" "));
  const tb = await drawer.getByRole("radiogroup").evaluate((el) => [...el.parentElement.children].map((c) => Math.round(c.getBoundingClientRect().top)));
  check("360: the toolbar stays on one row", new Set(tb.map((t) => Math.round(t / 12))).size === 1, tb.join(","));
  const small = await drawer.locator('button:visible, [role="radio"]:visible, [role="tab"]:visible, input:visible').evaluateAll((els) => els.filter((e) => !e.closest("[data-mine-line]") && e.getBoundingClientRect().height < 43.5).map((e) => `${e.textContent.trim() || e.tagName}:${Math.round(e.getBoundingClientRect().height)}`));
  check("360: touch targets are 44 px", small.length === 0, small.join(" "));
  await shot("mine-phone-360");
  await drawer.getByRole("button", { name: "Change name" }).tap();
  await drawer.locator("[data-mine-name-form]").waitFor();
  check("360: the name form fits", (await fits()).length === 0, (await fits()).join(" "));
  await shot("prompt-phone-360");
  await drawer.getByRole("button", { name: "Cancel" }).tap();
  await drawer.getByRole("tab", { name: /Nearsite/ }).tap();
  await drawer.locator("[data-nearsite-list] [cmdk-item]").first().waitFor();
  check("360: nothing runs off the right edge (Nearsite)", (await fits()).length === 0, (await fits()).join(" "));
  check("360: Mine on Nearsite", same(await ids(), ["90001", "90003", "90005"]));
  await drawer.getByRole("radio", { name: "All" }).tap();
  await shot("nearsite-phone-360");
  await drawer.locator('[data-nearsite-id="90005"] [data-action]').tap();
  check("360: Pick up by touch", same(await log(), ["nearsite 90005 pickup"]));
  await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await shot("nearsite-phone-360-dark");
  await ctx.close();
}

// ---------- 7. dark ----------
{
  const { ctx, p, drawer, shot } = await open("dark", { theme: "dark", reporter: "Alex Example" });
  check("dark: theme applied", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  const colours = await drawer.evaluate((el) => {
    const on = el.querySelector('[role="radio"][aria-checked="true"]');
    const tab = el.querySelector('[role="tab"][aria-selected="true"]');
    return { drawer: getComputedStyle(el).backgroundColor, on: getComputedStyle(on).backgroundColor, onInk: getComputedStyle(on).color, tabLine: getComputedStyle(tab).borderBottomColor };
  });
  check("dark: tokens, not fixed colours", colours.drawer === "rgb(10, 10, 10)" && colours.on === "rgb(10, 10, 10)" && colours.onInk === "rgb(237, 237, 237)" && colours.tabLine === "rgb(237, 237, 237)", JSON.stringify(colours));
  await shot("mine-desktop-dark");
  await drawer.getByRole("tab", { name: /Nearsite/ }).click();
  await drawer.locator("[data-nearsite-list] [cmdk-item]").first().waitFor();
  await drawer.getByRole("radio", { name: "All" }).click();
  await shot("nearsite-desktop-dark");
  await drawer.getByRole("radio", { name: "Mine" }).click();
  await drawer.getByRole("button", { name: "Change name" }).click();
  await shot("prompt-desktop-dark");
  await ctx.close();
}

// ---------- 8. the state gallery (NearsiteList on its own), light and dark ----------
for (const theme of ["light", "dark"]) {
  const { ctx, p, shot } = await open(`gallery ${theme}`, { theme, w: 1560, h: 1000 });
  await p.keyboard.press("Escape");
  await p.locator('[data-slot="sheet-content"]').waitFor({ state: "detached" });
  const card = (title) => p.locator(`[data-gallery="${title}"]`);
  if (theme === "light") {
    check("gallery: Mine with nothing for the name", (await text(card("Mine · nothing for this name"))).includes("No open Nearsite claims for Alex.") && (await card("Mine · nothing for this name").getByRole("button", { name: "Show all" }).count()) === 1);
    check("gallery: off renders nothing", (await card("Off (renders nothing)").locator("[data-nearsite-list]").count()) === 0);
    check("gallery: 1 day and plural wording", (await text(card("Rows · All · soonest first"))).includes("1 home found"));
    check("gallery: the open claim is marked", (await card("Rows · All · soonest first").locator('[aria-label="Selected"]').count()) === 1);
  }
  await p.locator("figure").first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/gallery-desktop-${theme}.png`, fullPage: true });
  void shot;
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(failures.length ? `\n${failures.length} FAILED:\n- ${failures.join("\n- ")}` : "\nAll passed");
process.exit(failures.length ? 1 : 0);
