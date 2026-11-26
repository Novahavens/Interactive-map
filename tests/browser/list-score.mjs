// Best match | Nearest, outside homes as list rows, and the score / why / Stretch display, on the dev preview
// page /dev/list-score (fictional fixtures, no API is read; /api/health is mocked in case a child asks).
//
//   MAP_FEATURES=all MONDAY_DRY_RUN=1 npx next dev -p 3102
//   BASE=http://localhost:3102 node tests/browser/list-score.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";
import { HEALTH_ON, HOME } from "../fixtures/map-agent.mjs";

const BASE = process.env.BASE ?? "http://localhost:3102";
const OUT = process.argv[2] ?? "test-results/list-score";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright-core")
  .catch(() => require("playwright"))
  .catch(() => (process.env.PW_CORE ? import(process.env.PW_CORE) : Promise.reject(new Error("playwright isn't installed; set PW_CORE to playwright-core's index.mjs"))));
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CHROME = process.env.CHROME;
const browser = await chromium.launch(CHROME && fs.existsSync(CHROME) ? { executablePath: CHROME } : {});

async function open(name, { w = 1440, h = 1000, theme = "light", touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("nh-theme", t);
    } catch {}
  }, theme);
  await ctx.route("**/api/health", (r) => r.fulfill({ json: HEALTH_ON }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${BASE}/dev/list-score`, { waitUntil: "networkidle" });
  await p.locator('[data-state="live"] ul[aria-label="Results"] li').first().waitFor();
  return { ctx, p };
}
const state = (p, s) => p.locator(`[data-state="${s}"]`);
const rowIds = (p) => state(p, "live").locator('ul[aria-label="Results"] button[id^="row-"]').evaluateAll((els) => els.map((e) => e.id));
const chipsOf = (loc) => loc.locator(".nh-chip").evaluateAll((els) => els.map((e) => e.textContent.trim()));
const out = (id) => `row-out-${id}`;
const ours = (n) => `row-99000001${n}`;

const BEST = [ours("01"), out(HOME.zillowExact), ours("02"), out(HOME.zillowNew), ours("03"), ours("04"), out(HOME.zillowApprox), ours("05"), ours("06"),
  out(HOME.ffArea), out(HOME.ffNoCoords), out(HOME.ffAsked), ours("11"), ours("12"), ours("13")];
const NEAREST = [ours("11"), ours("01"), ours("03"), out(HOME.zillowExact), out(HOME.zillowNew), ours("12"), out(HOME.ffArea), ours("02"), ours("05"),
  out(HOME.zillowApprox), ours("04"), ours("06"), ours("13"), out(HOME.ffNoCoords), out(HOME.ffAsked)];
const TODAY = [ours("11"), ours("01"), ours("03"), ours("12"), ours("02"), ours("05"), ours("04"), ours("06"), ours("13")];

// ---------- desktop, light ----------
{
  const { ctx, p } = await open("desktop");
  const live = state(p, "live");
  const group = live.getByRole("radiogroup", { name: "Sort homes" });
  const best = group.getByRole("radio", { name: "Best match" });
  const nearest = group.getByRole("radio", { name: "Nearest" });

  // --- sort toggle + order ---
  check("toggle is a radiogroup named Sort homes with two radios", (await group.count()) === 1 && (await group.getByRole("radio").count()) === 2);
  check("Best match is the default when scores exist", (await best.getAttribute("aria-checked")) === "true" && (await nearest.getAttribute("aria-checked")) === "false");
  check("count label names the outside homes", (await live.innerText()).includes("9 within 10 mi · 6 outside"));
  let ids = await rowIds(p);
  check("Best match: score first (ours and outside together), unscored outside by rank, the rest, red last", same(ids, BEST), ids.join(" "));
  check("a home that is already one of our pins is not listed twice", !ids.includes(out(HOME.zillowOnClaim)));
  check("a home that does not fit the search is not listed", !ids.includes(out(HOME.stretch)));
  check("no divider in Best match", (await live.getByText(/No map location/).count()) === 0);
  check("Nearest carries today's rule as its title", (await nearest.getAttribute("title")) === "Green first, then nearest");
  await live.screenshot({ path: `${OUT}/desktop-light-best.png` });

  await nearest.click();
  ids = await rowIds(p);
  check("Nearest: green first, then nearest, outside with the neutral homes, no-pin homes last", same(ids, NEAREST), ids.join(" "));
  check("Nearest: our homes keep today's order among themselves", same(ids.filter((i) => !i.startsWith("row-out-")), TODAY));
  check("Nearest is now checked", (await nearest.getAttribute("aria-checked")) === "true" && (await best.getAttribute("aria-checked")) === "false");
  const divider = live.getByText("No map location (2)");
  check("divider 'No map location (2)' above the homes without a pin", (await divider.count()) === 1);
  check(
    "…and it sits right before the first of them",
    await live.locator("ul > li").evaluateAll((lis, id) => { const i = lis.findIndex((li) => /No map location/.test(li.textContent)); return i > 0 && lis[i + 1]?.querySelector("button")?.id === id; }, out(HOME.ffNoCoords)),
  );
  await live.locator(`[id="${out(HOME.ffAsked)}"]`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${OUT}/desktop-light-nearest.png` });

  // keyboard: arrows move between the two options
  await nearest.focus();
  await p.keyboard.press("ArrowLeft");
  check("arrow key moves to Best match and picks it", (await best.getAttribute("aria-checked")) === "true" && same(await rowIds(p), BEST));
  check("focus followed the arrow", await best.evaluate((e) => e === document.activeElement));
  await p.keyboard.press("ArrowRight");
  check("arrow right goes back to Nearest", (await nearest.getAttribute("aria-checked")) === "true");
  await best.click();

  // no scores for our homes: outside homes still carry the search's own, so Best match stays
  await live.locator('[data-test="scores-on"]').uncheck();
  check("no matcher scores: our rows carry no Match chip", !(await chipsOf(live.locator(`[id="${ours("01")}"]`))).some((c) => c.startsWith("Match")));
  check("no matcher scores: outside rows keep the search's own score, Best match still offered", (await chipsOf(live.locator(`[id="${out(HOME.zillowExact)}"]`)))[0] === "Match 91 · Strong" && !(await best.isDisabled()));
  // nothing scored at all: falls back to Nearest, Best match disabled
  await live.locator('[data-test="outside-on"]').uncheck();
  check("no scores: Best match is disabled and Nearest is shown as chosen", (await best.isDisabled()) && (await nearest.getAttribute("aria-checked")) === "true");
  check("no scores: the list says why", (await live.locator("[data-sort-hint]").innerText()).includes("No match scores for this claim yet. Showing nearest first."));
  check("no scores: list is in Nearest order", (await live.locator("ul").getAttribute("data-mode")) === "nearest");
  ids = await rowIds(p);
  check("no scores, no outside homes: exactly today's list", same(ids, TODAY), ids.join(" "));
  check("…and no chip, divider or outside count that today's list does not have", !(await live.innerText()).match(/Match \d|No map location|outside$/m) && (await live.innerText()).includes("9 within 10 mi"));
  await live.locator('[data-test="scores-on"]').check();
  await live.locator('[data-test="outside-on"]').check();
  check("scores back: the remembered choice (Best match) applies again", (await best.getAttribute("aria-checked")) === "true" && same(await rowIds(p), BEST));

  // --- rows in the live list ---
  const zExact = live.locator(`[id="${out(HOME.zillowExact)}"]`);
  check("outside row is a button with aria-pressed=false", (await zExact.evaluate((e) => e.tagName)) === "BUTTON" && (await zExact.getAttribute("aria-pressed")) === "false");
  check("outside row's accessible name", (await zExact.getAttribute("aria-label")) === "4100 Sample Ave, outside listing from Zillow, $2,350, match 91", await zExact.getAttribute("aria-label"));
  check("chips: score, then source", same(await chipsOf(zExact), ["Match 91 · Strong", "Zillow"]), (await chipsOf(zExact)).join(" | "));
  check("the why line under the chips of a top outside row", (await zExact.innerText()).includes("Right size, pets ok, inside the FRV"));
  check("facts and rent", /3 bd · 2 ba · pets ok/.test(await zExact.innerText()) && (await zExact.innerText()).includes("$2,350") && (await zExact.innerText()).includes("0.9 mi"));
  await zExact.click();
  check("click selects: aria-pressed and the listing id go to onSelect", (await zExact.getAttribute("aria-pressed")) === "true" && (await live.locator('[data-test="selected"]').innerText()) === HOME.zillowExact);
  const our1 = live.locator(`[id="${ours("01")}"]`);
  await our1.click();
  check("selecting one of ours deselects the outside row", (await zExact.getAttribute("aria-pressed")) === "false" && (await our1.getAttribute("aria-pressed")) === "true");
  await zExact.hover();
  check("hover on a pinned outside row reports it (row gets the hover look)", await zExact.evaluate((e) => e.classList.contains("nh-row--hover")));
  const listOnly = live.locator(`[id="${out(HOME.ffNoCoords)}"]`);
  await listOnly.scrollIntoViewIfNeeded();
  await listOnly.hover();
  check("hover on a list-only row does not touch the map hover", (await live.locator(".nh-row--hover").count()) === 0);
  check("list-only row: title says it has no map location", (await listOnly.getAttribute("title")) === "This listing has no map location");
  const zNew = live.locator(`[id="${out(HOME.zillowNew)}"]`);
  check("New + Stretch chips in spec order", same(await chipsOf(zNew), ["Match 86 · Strong", "Zillow", "New", "Stretch +$100"]), (await chipsOf(zNew)).join(" | "));
  check("our scored row: score chip first, state chips after", (await chipsOf(our1))[0] === "Match 96 · Strong" && (await chipsOf(our1)).includes("Available now"));
  check("our price stretch: Stretch +$250 last", (await chipsOf(live.locator(`[id="${ours("05")}"]`))).at(-1) === "Stretch +$250");
  check("our far stretch: plain Stretch, weak score", same((await chipsOf(live.locator(`[id="${ours("06")}"]`))).filter((c) => /Match|Stretch/.test(c)), ["Match 44 · Weak", "Stretch"]));
  // keyboard on a row
  await zNew.focus();
  await p.keyboard.press("Enter");
  check("Enter on a focused outside row selects it", (await zNew.getAttribute("aria-pressed")) === "true");
  check("same row geometry as ResultRow (left edge of the name, min height 44)", await live.evaluate((el, [a, b]) => {
    const name = (id) => document.getElementById(id).querySelector(".font-medium").getBoundingClientRect().left;
    return Math.abs(name(a) - name(b)) < 0.6 && document.getElementById(a).getBoundingClientRect().height >= 44;
  }, [out(HOME.zillowExact), ours("01")]));

  // --- SortToggle states ---
  const hintOf = async (s) => ((await state(p, s).locator("[data-sort-hint]").count()) ? (await state(p, s).locator("[data-sort-hint]").innerText()).trim() : "");
  const radio = (s, n) => state(p, s).getByRole("radio", { name: n });
  check("state best: no hint line", (await hintOf("sort-best")) === "" && (await radio("sort-best", "Best match").getAttribute("aria-checked")) === "true");
  await radio("sort-best", "Nearest").click();
  check("state best: onChange fires with nearest", (await radio("sort-best", "Nearest").getAttribute("aria-checked")) === "true");
  await radio("sort-best", "Nearest").click();
  check("pressing the chosen option again keeps it chosen", (await radio("sort-best", "Nearest").getAttribute("aria-checked")) === "true");
  await radio("sort-best", "Best match").click();
  check("state loading: 'Scoring homes for this claim…', choice stays", (await hintOf("sort-loading")) === "Scoring homes for this claim…" && (await radio("sort-loading", "Best match").getAttribute("aria-checked")) === "true" && !(await radio("sort-loading", "Best match").isDisabled()));
  check("state no claim: Best match disabled with the hint", (await hintOf("sort-no-claim")) === "Pick a claim to sort by best match." && (await radio("sort-no-claim", "Best match").isDisabled()) && (await radio("sort-no-claim", "Nearest").getAttribute("aria-checked")) === "true");
  check("state no claim: the group is described by the hint", await state(p, "sort-no-claim").getByRole("radiogroup").evaluate((g) => document.getElementById(g.getAttribute("aria-describedby"))?.textContent.includes("Pick a claim")));
  check("state no scores: falls back to Nearest", (await radio("sort-no-scores", "Nearest").getAttribute("aria-checked")) === "true" && (await radio("sort-no-scores", "Best match").isDisabled()));
  check("state error: copy + Try again", (await hintOf("sort-error")).replace(/\s+/g, " ") === "Couldn't score these homes. Showing nearest first. Try again");
  await state(p, "sort-error").getByRole("button", { name: "Try again" }).click();
  check("state error: Try again calls onRetry", (await state(p, "sort-error").locator('[data-test="retries"]').innerText()).includes("1×"));
  check("state bare: no count label, toggle still there", (await state(p, "sort-bare").getByRole("radio").count()) === 2 && !(await state(p, "sort-bare").innerText()).includes("within"));
  check("toggle is the radius picker's height with a mouse (h-7, root font 14px)", (await radio("sort-best", "Nearest").evaluate((e) => e.getBoundingClientRect().height)) === 24.5);

  // --- OutsideRow states ---
  const row = (s) => state(p, s).locator("button[id^='row-out-']");
  check("exact: solid source letter Z, hidden from screen readers", (await row("out-exact").locator("[aria-hidden]").first().innerText()) === "Z");
  check("on this claim: chip + matcher's score", same(await chipsOf(row("out-on-claim")), ["Match 96 · Strong", "Zillow", "On this claim"]), (await chipsOf(row("out-on-claim"))).join(" | "));
  check("on this claim: in the accessible name", (await row("out-on-claim").getAttribute("aria-label")).endsWith(", on this claim"));
  check("approximate pin: ≈ distance, still an address", /≈ 4 mi/.test(await row("out-approx").innerText()) && (await row("out-approx").innerText()).startsWith("Z\n2300 Fixture Blvd"), JSON.stringify(await row("out-approx").innerText()));
  check("area only: ≈ name, F letter, 'furnished', chip ≈ Area only", (await row("out-area").innerText()).includes("≈ Cozy 3BR near Midtown") && /furnished/.test(await row("out-area").innerText()) && same(await chipsOf(row("out-area")), ["Furnished Finder", "≈ Area only"]), (await chipsOf(row("out-area"))).join(" | "));
  check("area only: accessible name says approximate location", (await row("out-area").getAttribute("aria-label")) === "Cozy 3BR near Midtown, outside listing from Furnished Finder, $2,700, approximate location");
  check("list only: 'no pin', chip List only, dashed letter", (await row("out-list-only").innerText()).includes("no pin") && same(await chipsOf(row("out-list-only")), ["Furnished Finder", "List only"]) && (await row("out-list-only").locator("[aria-hidden]").first().evaluate((e) => getComputedStyle(e).borderTopStyle)) === "dashed");
  check("list only: accessible name says no map location", (await row("out-list-only").getAttribute("aria-label")).endsWith(", no map location"));
  check("selected: aria-pressed + the selected look", (await row("out-selected").getAttribute("aria-pressed")) === "true" && (await row("out-selected").evaluate((e) => e.classList.contains("bg-surface-muted"))));
  check("hovered from the map: nh-row--hover", await row("out-hovered").evaluate((e) => e.classList.contains("nh-row--hover")));
  check("no rent / no beds: 'no rent' and dashes, no score chip", (await row("out-bare").innerText()).includes("no rent") && (await row("out-bare").innerText()).includes("— bd · — ba") && same(await chipsOf(row("out-bare")), ["Furnished Finder", "List only"]));
  check("source chip has the outlined ink look", await row("out-exact").locator('[data-chip="source"]').evaluate((e) => { const s = getComputedStyle(e); return s.borderTopColor !== "rgba(0, 0, 0, 0)" && s.color === getComputedStyle(document.body).color; }));
  await row("out-exact").focus();
  check("a focus ring shows on keyboard focus", await p.evaluate(() => { document.activeElement.blur(); return true; }));

  // --- ResultRow ---
  const rrow = (s) => state(p, s).locator("button[id^='row-']");
  check("ResultRow without score: unchanged chips", same(await chipsOf(rrow("row-plain")), ["Available now"]), (await chipsOf(rrow("row-plain"))).join(" | "));
  check("ResultRow with score: leading score chip", same(await chipsOf(rrow("row-score")), ["Match 96 · Strong", "Available now"]));
  check("ResultRow stretch: Stretch +$250 after the state chips", same(await chipsOf(rrow("row-stretch")), ["Match 61 · Fair", "Last contact Nov 20", "Stretch +$250"]), (await chipsOf(rrow("row-stretch"))).join(" | "));
  check("ResultRow far: Match 44 · Weak + Stretch", same(await chipsOf(rrow("row-far")), ["Match 44 · Weak", "Stretch"]));
  check("score chip tones: strong ok, fair info, weak muted", (await rrow("row-score").locator(".nh-chip--ok", { hasText: "Match" }).count()) === 1 && (await rrow("row-stretch").locator(".nh-chip--info", { hasText: "Match" }).count()) === 1 && (await rrow("row-far").locator(".nh-chip--muted", { hasText: "Match" }).count()) === 1);

  // --- MatchScore ---
  const strong = state(p, "score-strong");
  const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
  check("score card: 96 / 100 and 'Strong match'", /96 \/ 100/.test(await txt(strong)) && (await txt(strong)).includes("Strong match"), await txt(strong));
  check("score card: bar is an image named 'Match score 96 out of 100'", (await strong.getByRole("img", { name: "Match score 96 out of 100" }).count()) === 1);
  check("score card: bar fill is 96% wide", await strong.getByRole("img").evaluate((e) => Math.abs(e.firstElementChild.getBoundingClientRect().width / e.clientWidth - 0.96) < 0.02));
  check("score card: Why line", (await txt(strong)).includes("Why: Margin $1,150/mo · 1.5 mi · 3 bd / 2 ba · Available"));
  check("score card: no Stretch when it is not one", !(await txt(strong)).includes("Stretch"));
  const stretch = state(p, "score-stretch");
  check("stretch by price: 61, Fair match, Stretch +$250 and the amount in words", /61 \/ 100/.test(await txt(stretch)) && (await txt(stretch)).includes("Fair match") && (await txt(stretch)).includes("Stretch +$250") && (await txt(stretch)).includes("$250 a month above the FRV. Ask before you offer it."), await txt(stretch));
  const weak = state(p, "score-weak");
  check("stretch by distance: Weak match, plain Stretch, no dollar amount invented", (await txt(weak)).includes("Weak match") && /Stretch(?! \+)/.test(await txt(weak)) && !(await txt(weak)).includes("above the FRV"), await txt(weak));
  check("no why: the card has no Why line", !(await txt(state(p, "score-no-why"))).includes("Why:") && (await state(p, "score-no-why").locator("[data-match-score]").count()) === 1);
  check("loading: one skeleton with a status name", (await state(p, "score-loading").getByRole("status", { name: "Scoring this home…" }).count()) === 1);
  check("no score: renders nothing", (await state(p, "score-none").locator(":scope > *").count()) === 1);

  await p.setViewportSize({ width: 1440, height: 1700 }); // the app shell does not scroll the document, so a tall window shows every state
  await p.screenshot({ path: `${OUT}/desktop-light.png` });
  await ctx.close();
}

// ---------- desktop, dark ----------
{
  const { ctx, p } = await open("dark", { theme: "dark" });
  check("dark theme applied", (await p.locator("html").getAttribute("data-theme")) === "dark");
  const letter = state(p, "out-exact").locator("button [aria-hidden]").first();
  check("dark: the source letter is ink on surface (readable both ways)", await letter.evaluate((e) => { const s = getComputedStyle(e); return s.backgroundColor !== s.color && s.backgroundColor === getComputedStyle(document.body).color; }));
  await p.setViewportSize({ width: 1440, height: 1700 }); // the app shell does not scroll the document, so a tall window shows every state
  await p.screenshot({ path: `${OUT}/desktop-dark.png` });
  await state(p, "live").screenshot({ path: `${OUT}/desktop-dark-best.png` });
  await ctx.close();
}

// ---------- 360 px phone, touch ----------
{
  const { ctx, p } = await open("phone", { w: 360, h: 780, touch: true });
  check("360px: no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const live = state(p, "live");
  const nearest = live.getByRole("radio", { name: "Nearest" });
  check("touch: toggle options are 44px tall", (await nearest.evaluate((e) => e.getBoundingClientRect().height)) === 44);
  check("touch: rows are at least 44px tall", await live.locator("button[id^='row-']").evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 44)));
  check("360px: nothing in a row is cut off sideways", await live.locator("button[id^='row-']").evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1)));
  await nearest.tap();
  check("touch: tapping Nearest re-sorts", same(await rowIds(p), NEAREST));
  await live.screenshot({ path: `${OUT}/phone-360-nearest.png` });
  await live.getByRole("radio", { name: "Best match" }).tap();
  await live.screenshot({ path: `${OUT}/phone-360-best.png` });
  await p.setViewportSize({ width: 360, height: 7200 }); // the app shell does not scroll the document, so a tall window shows every state
  await p.screenshot({ path: `${OUT}/phone-360.png` });
  await ctx.close();
}

// ---------- 360 px, dark ----------
{
  const { ctx, p } = await open("phone-dark", { w: 360, h: 780, theme: "dark", touch: true });
  await state(p, "live").screenshot({ path: `${OUT}/phone-360-dark.png` });
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
