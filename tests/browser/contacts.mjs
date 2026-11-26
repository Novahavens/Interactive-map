// Contacts extras (pillar F) on the dev preview page /dev/contacts: Find phone in every state with the
// exact requests it makes, the Text templates menu (keyboard and the Quo link of each entry), the outreach
// line, and "flags off = today's ContactActions". Every route is mocked; nothing is written anywhere.
//
//   BASE=http://localhost:3106 node tests/browser/contacts.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";
import { OUTREACH, PHONE } from "../fixtures/map-agent.mjs";

const BASE = process.env.BASE ?? "http://localhost:3106";
const OUT = process.argv[2] ?? "test-results/contacts";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright").catch(() => require(process.env.PW ?? "/opt/node-tools/node_modules/playwright"));
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};

const E164 = "+19185550142";
const NAME = "Marisol Example";
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const dayLabel = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }).format(new Date(iso));
const OLD = daysAgo(3);
const quo = (number, text) => `openphone://message?number=${encodeURIComponent(number)}&selectedAsFallback=true${text ? `&text=${encodeURIComponent(text)}` : ""}`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function open(name, { w = 1440, h = 1000, theme = "light", reporter = "Will", touch = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    timezoneId: "America/Chicago",
    permissions: ["clipboard-read", "clipboard-write"],
    ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
  });
  await ctx.addInitScript(
    ({ t, r }) => {
      try {
        localStorage.setItem("nh-theme", t);
        if (r) localStorage.setItem("nh-reporter-name", r);
      } catch {}
      // Headless Chromium freezes input after a custom-scheme navigation: stop the Quo links from
      // navigating (the click handlers still run) and keep what would have opened.
      window.__opened = [];
      document.addEventListener("click", (e) => {
        const a = e.target instanceof Element ? e.target.closest('a[href^="openphone:"], a[href^="tel:"]') : null;
        if (!a) return;
        window.__opened.push(a.getAttribute("href"));
        e.preventDefault();
      });
    },
    { t: theme, r: reporter },
  );
  const requests = [];
  const posts = {};
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: true, quo: false } }));
  await ctx.route(/\/api\/properties\/(\d+)\/find-phone$/, async (route) => {
    const req = route.request();
    const id = /properties\/(\d+)\//.exec(req.url())[1];
    const method = req.method();
    requests.push({ id, method, path: new URL(req.url()).pathname, body: req.postData(), type: req.headers()["content-type"] ?? null });
    if (method === "GET") {
      const saved = { 9900000402: PHONE.found, 9900000403: PHONE.foundLow, 9900000404: { ...PHONE.notFound, lookedUpAt: OLD }, 9900000405: PHONE.off, 9900000409: { ...PHONE.found, confidence: "medium" } }[id];
      return route.fulfill({ json: saved ?? PHONE.idle });
    }
    posts[id] = (posts[id] ?? 0) + 1;
    if (id === "9900000401") {
      await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill({ json: PHONE.found });
    }
    if (id === "9900000404") return route.fulfill({ json: { ...PHONE.notFound, lookedUpAt: new Date().toISOString() } });
    if (id === "9900000406") return posts[id] === 1 ? route.fulfill({ status: 502, json: { error: "The phone lookup did not answer. Try again later", code: "lookup_error" } }) : route.fulfill({ json: PHONE.found });
    if (id === "9900000407") return route.fulfill({ status: 429, json: PHONE.rateLimited });
    if (id === "9900000408") return route.fulfill({ json: PHONE.off });
    return route.fulfill({ status: 404, json: { error: "Property not found", code: "not_found" } });
  });
  await ctx.route(/\/api\/properties\/(\d+)\/outreach$/, (route) => {
    const id = /properties\/(\d+)\//.exec(route.request().url())[1];
    requests.push({ id, method: route.request().method(), path: new URL(route.request().url()).pathname, body: null, type: null });
    const answer = { 9900000501: OUTREACH.sent, 9900000502: OUTREACH.replied, 9900000503: OUTREACH.none, 9900000504: OUTREACH.off }[id];
    return route.fulfill({ json: answer ?? OUTREACH.none });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`${name}: ${m.text()}`);
  });
  await p.goto(`${BASE}/dev/contacts`, { waitUntil: "networkidle" });
  await p.locator('[data-case="live-idle"] [data-findphone-state="idle"]').waitFor();
  const c = (id) => p.locator(`[data-case="${id}"]`);
  return { ctx, p, c, requests, posts };
}
/** Press a key and give Radix a moment: it moves menu focus on the next tick. */
const key = async (p, k) => {
  await p.keyboard.press(k);
  await p.waitForTimeout(80);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const state = (loc) => loc.locator("[data-findphone-state]").getAttribute("data-findphone-state");
const of = (requests, id, method) => requests.filter((r) => r.id === id && r.method === method);

// ---------- desktop, light: Find phone ----------
{
  const { ctx, p, c, requests } = await open("desktop");
  await p.locator('[data-case="live-found"] [data-findphone-state="found"]').waitFor();

  // On mount: one GET each, no POST, nothing for the flag-off one.
  const gets = requests.filter((r) => r.method === "GET" && r.path.endsWith("/find-phone"));
  // React's dev-only StrictMode mounts twice (the first read is aborted), so "once" is "at most twice" here.
  const perId = Object.values(Object.groupBy(gets, (r) => r.id)).map((g) => g.length);
  check("on mount each Find phone reads GET /api/properties/:id/find-phone", perId.length === 9 && perId.every((n) => n >= 1 && n <= 2) && gets.every((r) => r.path === `/api/properties/${r.id}/find-phone` && r.body === null), JSON.stringify(perId));
  check("nothing is looked up before the button is pressed", requests.every((r) => r.method !== "POST"));
  check("flag off: no request and nothing rendered", !requests.some((r) => r.id === "9900000410") && (await c("live-disabled").locator("[data-findphone-state]").count()) === 0 && (await c("live-disabled").locator("button, a").count()) === 0);

  // Off
  {
    const off = c("live-off");
    const b = off.getByRole("button", { name: "Find phone" });
    check("off: 'No phone number yet' and 'Not set up yet.'", (await text(off)).includes("No phone number yet") && (await text(off)).includes("Not set up yet."), await text(off));
    const why = await b.getAttribute("aria-describedby");
    check("off: button is aria-disabled with the reason in aria-describedby", (await b.getAttribute("aria-disabled")) === "true" && !!why && (await p.locator(`[id="${why}"]`).innerText()) === "Not set up yet.");
    await b.click({ force: true });
    await b.press("Enter");
    await p.waitForTimeout(200);
    check("off: pressing it sends nothing", of(requests, "9900000405", "POST").length === 0 && (await state(off)) === "off");
  }

  // Idle → searching → found
  {
    const idle = c("live-idle");
    check("idle: 'No phone number yet' and a Find phone button", (await text(idle)).includes("No phone number yet") && (await idle.getByRole("button", { name: "Find phone" }).getAttribute("aria-disabled")) === null);
    await idle.getByRole("button", { name: "Find phone" }).focus();
    await key(p, "Enter");
    await idle.locator('[data-findphone-state="searching"]').waitFor();
    const t = await text(idle);
    check("searching: 'Looking for a number…' and 'Takes up to 30 seconds.'", t.includes("Looking for a number…") && t.includes("Takes up to 30 seconds."), t);
    check("searching: the line is a status region", (await idle.locator('[role="status"]', { hasText: "Looking for a number…" }).count()) === 1);
    const busy = idle.getByRole("button", { name: "Find phone" });
    check("searching: button disabled (aria-disabled), still focused", (await busy.getAttribute("aria-disabled")) === "true" && (await busy.evaluate((e) => e === document.activeElement)));
    await busy.click({ force: true });
    await idle.screenshot({ path: `${OUT}/searching.png` });
    await idle.locator('[data-findphone-state="found"]').waitFor();
    const post = of(requests, "9900000401", "POST");
    check("exact request: one POST /api/properties/9900000401/find-phone with { by } = the remembered name", post.length === 1 && post[0].path === "/api/properties/9900000401/find-phone" && post[0].body === JSON.stringify({ by: "Will" }) && /application\/json/.test(post[0].type ?? ""), JSON.stringify(post));
    const f = await text(idle);
    check("found: the number, formatted", f.includes("(918) 555-0142"), f);
    check("found: source and confidence wording (high)", (await idle.locator('[data-findphone="source"]').innerText()) === "Public records · likely right (high)");
    check("found: the usual Call and Text actions", (await idle.locator('[data-quo="call"]').getAttribute("href")) === `tel:${E164}` && (await idle.locator('[data-quo="text"]').getAttribute("href")) === quo(E164, "Hi Marisol, it's Will from Nova Havens about 1418 Juniper Ct. "));
    check("found: Save to listing and Not right", (await idle.getByRole("button", { name: "Save to listing" }).count()) === 1 && (await idle.getByRole("button", { name: "Not right" }).count()) === 1);
    check("found: focus moved to the number (not lost)", await idle.getByTitle("Copy number").evaluate((e) => e === document.activeElement));
    check("found: announced politely", (await idle.locator('[aria-live="polite"].sr-only').innerText()).startsWith("Number found: (918) 555-0142."));

    // Save to listing → onSave(phone)
    await idle.getByRole("button", { name: "Save to listing" }).click();
    check("save: the button waits ('Saving…')", (await idle.locator('[data-findphone="save"]').innerText()).trim() === "Saving…");
    await idle.locator('[data-findphone="save"]', { hasText: "Saved" }).waitFor();
    check("save: onSave got the E.164 number", (await p.locator("[data-saved]").textContent()) === `9900000401:${E164}`, await p.locator("[data-saved]").textContent());
    check("save: nothing else was sent (saving is the Edit route's job)", of(requests, "9900000401", "POST").length === 1);
  }

  // Found on mount (saved lookup), low confidence, Not right, failed save
  {
    const low = c("live-found-low");
    check("found (low): wording says to check first", (await low.locator('[data-findphone="source"]').innerText()) === "Public records · a guess: check before you call (low)");
    await low.getByRole("button", { name: "Save to listing" }).click();
    await low.getByRole("alert").waitFor();
    check("save failed: says so and the button is back", (await low.getByRole("alert").innerText()) === "Couldn't save the number. Try again." && (await low.getByRole("button", { name: "Save to listing" }).getAttribute("aria-disabled")) === null);
    await low.getByRole("button", { name: "Not right" }).click();
    await low.locator('[data-findphone-state="idle"]').waitFor();
    check("Not right: back to 'No phone number yet', nothing sent", (await text(low)).includes("No phone number yet") && of(requests, "9900000403", "POST").length === 0 && (await low.locator("[data-quo]").count()) === 0);
    check("Not right: focus lands on Find phone", await low.getByRole("button", { name: "Find phone" }).evaluate((e) => e === document.activeElement));
    check("medium confidence wording", (await c("live-nosave").locator('[data-findphone="source"]').innerText()) === "Public records · may be right (medium)");
    check("no save handler: no Save to listing button", (await c("live-nosave").getByRole("button", { name: "Save to listing" }).count()) === 0 && (await c("live-nosave").getByRole("button", { name: "Not right" }).count()) === 1);
  }

  // Not found
  {
    const nf = c("live-not-found");
    const t = await text(nf);
    check("not found: copy with the date it was checked", t.includes("No number found.") && t.includes(`Checked ${dayLabel(OLD)}. Try the listing page, or text through the listing site.`), t);
    const again = nf.getByRole("button", { name: "Try again" });
    check("not found (an earlier day): Try again is on", (await again.getAttribute("aria-disabled")) === null);
    await again.click();
    await nf.locator('[data-findphone-state="not_found"]', { hasText: "tomorrow" }).waitFor();
    const post = of(requests, "9900000404", "POST");
    check("Try again: the same POST with { by }", post.length === 1 && post[0].body === JSON.stringify({ by: "Will" }));
    const t2 = await text(nf);
    check("not found today: today's date, and Try again waits until tomorrow", t2.includes(`Checked ${dayLabel(new Date().toISOString())}.`) && t2.includes("You can try again tomorrow.") && (await nf.getByRole("button", { name: "Try again" }).getAttribute("aria-disabled")) === "true", t2);
    await nf.getByRole("button", { name: "Try again" }).click({ force: true });
    await p.waitForTimeout(200);
    check("…and pressing it sends nothing", of(requests, "9900000404", "POST").length === 1);
  }

  // Error, then it works
  {
    const er = c("live-error");
    await er.getByRole("button", { name: "Find phone" }).click();
    await er.locator('[data-findphone-state="error"]').waitFor();
    check("error: exact copy, as an alert", (await er.getByRole("alert").innerText()).replace(/\s+/g, " ") === "Couldn't look that up. Nothing was saved. Try again in a minute.", await er.getByRole("alert").innerText());
    check("error: Find phone is offered again and keeps focus", (await er.getByRole("button", { name: "Find phone" }).getAttribute("aria-disabled")) === null && (await er.getByRole("button", { name: "Find phone" }).evaluate((e) => e === document.activeElement)));
    await er.getByRole("button", { name: "Find phone" }).click();
    await er.locator('[data-findphone-state="found"]').waitFor();
    check("error: trying again works", of(requests, "9900000406", "POST").length === 2 && (await er.getByRole("alert").count()) === 0);
  }

  // 429
  {
    const busy = c("live-busy");
    await busy.getByRole("button", { name: "Find phone" }).click();
    await busy.locator('[data-findphone-state="error"]').waitFor();
    check("429: says there were too many lookups", (await busy.getByRole("alert").innerText()).replace(/\s+/g, " ") === "Too many lookups right now. Nothing was saved. Try again in a few minutes.", await busy.getByRole("alert").innerText());
  }

  // The provider isn't set up: GET says idle, POST says off
  {
    const po = c("live-provider-off");
    await po.getByRole("button", { name: "Find phone" }).click();
    await po.locator('[data-findphone-state="off"]').waitFor();
    check("lookup service not set up: POST answers off → 'Not set up yet.'", (await text(po)).includes("Not set up yet."));
  }

  // No name remembered → by: ""
  await ctx.close();
}
{
  const { ctx, c, requests } = await open("no-name", { reporter: "" });
  await c("live-busy").getByRole("button", { name: "Find phone" }).click();
  await c("live-busy").locator('[data-findphone-state="error"]').waitFor();
  check("no name remembered: POST body is { by: \"\" }", of(requests, "9900000407", "POST")[0]?.body === JSON.stringify({ by: "" }), of(requests, "9900000407", "POST")[0]?.body);
  await ctx.close();
}

// ---------- templates menu, outreach, flags off ----------
const AVAIL = "Hi Marisol, it's Will from Nova Havens about 1418 Juniper Ct. Is it available from Dec 8? We have a family that needs a 3-bedroom home in Tulsa. ";
const ADDR = "Hi Marisol, it's Will from Nova Havens. We have a family interested in your 3-bedroom place in Tulsa. Could you send the street address so we can check the distance for them? ";
const RATE = "Hi Marisol, it's Will from Nova Havens about 1418 Juniper Ct. Can you confirm $3,350 a month for a stay starting Dec 8, and what the deposit is? ";
{
  const { ctx, p, c, requests } = await open("menu");
  const tpl = c("templates");
  const trigger = tpl.locator('[data-quo="text"]');
  check("templates on: Text is a menu button, same data-quo and name", (await trigger.evaluate((e) => e.tagName)) === "BUTTON" && (await trigger.getAttribute("aria-haspopup")) === "menu" && (await trigger.getAttribute("aria-label")) === "Text (918) 555-0142 with Quo" && (await trigger.getAttribute("aria-expanded")) === "false");
  check("templates on: Call is unchanged", (await tpl.locator('[data-quo="call"]').getAttribute("href")) === `tel:${E164}` && (await tpl.locator('[data-quo="call"]').evaluate((e) => e.tagName)) === "A");
  const same = await p.evaluate(() => {
    const call = document.querySelector('[data-case="templates"] [data-quo="call"]').getBoundingClientRect();
    const txt = document.querySelector('[data-case="templates"] [data-quo="text"]').getBoundingClientRect();
    return call.height === txt.height && call.top === txt.top;
  });
  check("Text ▾ lines up with Call", same);

  // Keyboard: Enter opens on the first entry, arrows move, Esc closes and gives focus back.
  await trigger.focus();
  await key(p, "Enter");
  const menu = p.getByRole("menu");
  await menu.waitFor();
  const items = menu.getByRole("menuitem");
  check("Enter opens the menu: four entries, in order", (await items.count()) === 4 && (await trigger.getAttribute("aria-expanded")) === "true", String(await items.count()));
  const labels = await items.evaluateAll((els) => els.map((e) => e.firstElementChild.textContent));
  check("entries: Ask availability / Ask for the address / Confirm the rate / Blank text", JSON.stringify(labels) === JSON.stringify(["Ask availability", "Ask for the address", "Confirm the rate", "Blank text"]), JSON.stringify(labels));
  check("a separator before Blank text", (await menu.getByRole("separator").count()) === 1);
  const focused = () => p.evaluate(() => document.activeElement?.getAttribute("data-quo-template"));
  check("Enter puts focus on the first entry", (await focused()) === "availability", await focused());
  await key(p, "ArrowDown");
  check("ArrowDown → Ask for the address", (await focused()) === "address");
  await key(p, "ArrowDown");
  await key(p, "ArrowDown");
  check("ArrowDown ×2 → Blank text", (await focused()) === "blank");
  await key(p, "ArrowUp");
  check("ArrowUp → Confirm the rate", (await focused()) === "rate");
  await key(p, "Home");
  check("Home → first entry", (await focused()) === "availability");

  const href = (k) => menu.locator(`[data-quo-template="${k}"]`).getAttribute("href");
  check("Quo link: Ask availability", (await href("availability")) === quo(E164, AVAIL), await href("availability"));
  check("Quo link: Ask for the address", (await href("address")) === quo(E164, ADDR), await href("address"));
  check("Quo link: Confirm the rate (names the rent)", (await href("rate")) === quo(E164, RATE), await href("rate"));
  check("Quo link: Blank text has no draft", (await href("blank")) === `openphone://message?number=%2B19185550142&selectedAsFallback=true`, await href("blank"));
  const previews = await items.evaluateAll((els) => els.map((e) => (e.children[1] ? { t: e.children[1].textContent, oneLine: getComputedStyle(e.children[1]).whiteSpace === "nowrap" && getComputedStyle(e.children[1]).textOverflow === "ellipsis" } : null)));
  check("each template shows a one-line preview of its text; Blank has none", previews[0]?.t === AVAIL.trim() && previews[1]?.t === ADDR.trim() && previews[2]?.t === RATE.trim() && previews.slice(0, 3).every((x) => x.oneLine) && previews[3] === null, JSON.stringify(previews));
  await p.screenshot({ path: `${OUT}/desktop-light-menu.png` });

  await key(p, "Escape");
  await menu.waitFor({ state: "detached" });
  check("Esc closes the menu and returns focus to Text", (await trigger.evaluate((e) => e === document.activeElement)) && (await trigger.getAttribute("aria-expanded")) === "false");
  check("Esc opened nothing", (await p.evaluate(() => window.__opened.length)) === 0);

  // Space opens too; choosing with Enter opens Quo the way Text does today: number copied, hints.
  await key(p, "Space");
  await menu.waitFor();
  await key(p, "ArrowDown");
  await key(p, "ArrowDown");
  check("Space opens; arrows reach Confirm the rate", (await focused()) === "rate", await focused());
  await key(p, "Enter");
  await menu.waitFor({ state: "detached" });
  await p.waitForTimeout(150);
  check("Enter on an entry opens its Quo link", JSON.stringify(await p.evaluate(() => window.__opened)) === JSON.stringify([quo(E164, RATE)]), JSON.stringify(await p.evaluate(() => window.__opened)));
  check("…copies the number, like Text does today", (await p.evaluate(() => navigator.clipboard.readText())) === E164);
  check("…and says so", (await text(tpl)).includes("Opening Quo · number copied"), await text(tpl));
  check("…focus is back on Text", await trigger.evaluate((e) => e === document.activeElement));
  await p.waitForTimeout(1800);
  const after = await text(tpl);
  check("…then the same 'Quo didn't open' hint with the link to Quo on the web", after.includes("Quo didn't open") && (await tpl.locator('a[href="https://my.quo.com"]').count()) === 1, after);

  // Mouse: click opens, click an entry.
  await trigger.click();
  await menu.waitFor();
  await menu.locator('[data-quo-template="address"]').click();
  await menu.waitFor({ state: "detached" });
  check("click on an entry opens its Quo link", (await p.evaluate(() => window.__opened[1])) === quo(E164, ADDR));

  // Nothing known but the number: a company, no address, no claim.
  const bare = c("templates-bare");
  check("two numbers: a Text menu per number", (await bare.locator('[data-quo="text"]').count()) === 2 && (await bare.locator('[data-quo="call"]').count()) === 2);
  await bare.locator('[data-quo="text"]').nth(1).click();
  await menu.waitFor();
  check("second number's menu links to the second number, greeting a company plainly; rate asks when no rent is known", (await href("availability")) === quo("+19185550199", "Hi, it's Will from Nova Havens. Is it available? We have a family that needs a home. ") && (await href("rate")) === quo("+19185550199", "Hi, it's Will from Nova Havens. What is the monthly rate, and are utilities included? "), await href("rate"));
  await key(p, "Escape");
  await menu.waitFor({ state: "detached" });

  // Flags off: today's ContactActions.
  const plain = c("plain");
  const link = plain.locator('[data-quo="text"]');
  check("templates off: Text is the plain link with today's draft", (await link.evaluate((e) => e.tagName)) === "A" && (await link.getAttribute("href")) === quo(E164, "Hi Marisol, it's Will from Nova Havens about 1418 Juniper Ct. ") && (await link.getAttribute("aria-haspopup")) === null);
  check("templates off: no chevron, label is just Text", (await link.locator("svg").count()) === 1 && (await link.innerText()).trim() === "Text");
  check(
    "templates off: today's markup (same classes and attributes as before)",
    (await link.evaluate((e) => e.outerHTML.replace(/<svg.*?<\/svg>/s, "<svg/>"))) ===
      `<a href="${quo(E164, "Hi Marisol, it's Will from Nova Havens about 1418 Juniper Ct. ").replace(/&/g, "&amp;")}" class="inline-flex h-8 min-w-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink no-underline hover:bg-surface-muted [@media(pointer:coarse)]:h-[44px]" data-quo="text" aria-label="Text (918) 555-0142 with Quo"><svg/>Text</a>`,
    await link.evaluate((e) => e.outerHTML.replace(/<svg.*?<\/svg>/s, "<svg/>")),
  );
  await link.click();
  await p.waitForTimeout(150);
  check("templates off: Text still copies and hints, no menu", (await p.getByRole("menu").count()) === 0 && (await text(plain)).includes("Opening Quo · number copied"));

  // Outreach line
  const asked = c("live-outreach-asked").locator("p[aria-live]");
  await asked.getByText("Asked").waitFor();
  check("outreach: 'Asked Nov 25 · no reply yet', muted, polite", (await asked.innerText()) === "Asked Nov 25 · no reply yet" && (await asked.getAttribute("aria-live")) === "polite" && (await asked.locator("svg").count()) === 0, await asked.innerText());
  const replied = c("live-outreach-replied").locator("p[aria-live]");
  check("outreach: 'Replied Nov 25' with a check icon (not colour alone)", (await replied.innerText()).trim() === "Replied Nov 25" && (await replied.locator("svg").count()) === 1 && (await replied.getAttribute("data-outreach")) === "replied", await replied.innerText());
  const colours = await p.evaluate(() => [getComputedStyle(document.querySelector('[data-case="live-outreach-asked"] p[aria-live]')).color, getComputedStyle(document.querySelector('[data-case="live-outreach-replied"] p[aria-live]')).color]);
  check("outreach: replied uses the ok ink, asked the muted ink", colours[0] !== colours[1], colours.join(" vs "));
  check("outreach: nothing sent → no line", !(await c("live-outreach-none").locator("p[aria-live]").isVisible()) && (await c("live-outreach-none").locator("p[aria-live]").innerText()) === "");
  check("outreach: route says off → no line", !(await c("live-outreach-off").locator("p[aria-live]").isVisible()));
  check("outreach: flag off → nothing rendered and no request", (await c("live-outreach-disabled").locator("p").count()) === 0 && !requests.some((r) => r.id === "9900000505"));
  const outs = requests.filter((r) => r.path.endsWith("/outreach"));
  check("outreach: GET /api/properties/:id/outreach for each", new Set(outs.map((r) => r.id)).size === 4 && outs.length <= 8 && outs.every((r) => r.method === "GET" && r.path === `/api/properties/${r.id}/outreach`), JSON.stringify(outs.map((r) => r.id)));
  check("outreach given as a prop is worded the same (Nov 24 fixture)", (await c("outreach-asked").locator("p[aria-live]").innerText()) === "Asked Nov 24 · no reply yet" && (await c("outreach-replied").locator("p[aria-live]").innerText()).trim() === "Replied Nov 25");

  await p.screenshot({ path: `${OUT}/desktop-light.png`, fullPage: true });
  await ctx.close();
}

// ---------- desktop dark ----------
{
  const { ctx, p, c } = await open("dark", { theme: "dark" });
  check("dark theme is on", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  await p.locator('[data-case="live-found"] [data-findphone-state="found"]').waitFor();
  await p.screenshot({ path: `${OUT}/desktop-dark.png`, fullPage: true });
  await c("templates").locator('[data-quo="text"]').click();
  const menu = p.getByRole("menu");
  await menu.waitFor();
  await p.waitForTimeout(250);
  const bg = await menu.evaluate((e) => getComputedStyle(e).backgroundColor);
  const pageBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("dark: the menu takes the dark surface", bg !== "rgb(255, 255, 255)", `${bg} on ${pageBg}`);
  await p.screenshot({ path: `${OUT}/desktop-dark-menu.png` });
  await ctx.close();
}

// ---------- 360 px, touch ----------
{
  const { ctx, p, c } = await open("phone", { w: 360, h: 740, touch: true });
  await p.locator('[data-case="live-found"] [data-findphone-state="found"]').waitFor();
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("360 px: no sideways scroll", overflow <= 0, String(overflow));
  const heights = await p.evaluate(() => [...document.querySelectorAll('[data-case^="live-"] button, [data-case="templates"] [data-quo]')].map((e) => Math.round(e.getBoundingClientRect().height)));
  check("360 px touch: every button is a 44 px target", heights.length > 10 && heights.every((h) => h >= 44), JSON.stringify(heights));
  const trigger = c("templates").locator('[data-quo="text"]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.tap();
  const menu = p.getByRole("menu");
  await menu.waitFor();
  await p.waitForTimeout(600); // the open animation scales the menu; measure when it has settled
  const box = await menu.boundingBox();
  check("360 px: the menu fits the screen", !!box && box.x >= 0 && box.x + box.width <= 360, JSON.stringify(box));
  const itemH = await menu.getByRole("menuitem").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check("360 px touch: menu entries are 44 px targets", itemH.every((h) => h >= 44), JSON.stringify(itemH));
  await p.screenshot({ path: `${OUT}/phone-360-menu.png` });
  await menu.locator('[data-quo-template="availability"]').tap();
  await menu.waitFor({ state: "detached" });
  check("360 px: tapping an entry opens its Quo link", (await p.evaluate(() => window.__opened[0])) === quo(E164, AVAIL), await p.evaluate(() => window.__opened[0]));
  // Last: a full-page screenshot switches Playwright's touch emulation off for the rest of the page's life.
  await p.screenshot({ path: `${OUT}/phone-360.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 600));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
