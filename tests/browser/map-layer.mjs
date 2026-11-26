// Outside homes on the map: the pin builder in every state, the layer rules (which homes get a pin, hide vs dim,
// stacking) and the "Outside" entry of the key in the rail and over the map. Runs against the dev-only preview
// page, which mounts the same DOM builders MapCanvas hands to Google, so no Maps key or API is needed.
//
//   BASE=http://localhost:3101 node tests/browser/map-layer.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.argv[2] ?? "test-results/map-layer";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright-core")
  .catch(() => import("playwright"))
  .catch(() => import(process.env.PW_CORE ?? "/opt/node-tools/node_modules/playwright/index.mjs"))
  .catch(() => require("/opt/node-tools/node_modules/playwright"));
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function open(name, { w = 1440, h = 900, theme = "light", touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("nh-theme", t);
    } catch {}
  }, theme);
  // The preview makes no API calls; anything that slips through is answered empty rather than reaching a server.
  await ctx.route("**/api/**", (r) => r.fulfill({ json: {} }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`${name}: ${m.text()}`);
  });
  await p.goto(`${BASE}/dev/map-layer`, { waitUntil: "networkidle" });
  await p.locator('[data-testid="pin-exact"] .nh-pin--outside').waitFor();
  await p.waitForTimeout(300);
  return { ctx, p };
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const css = (loc, prop) => loc.evaluate((e, pr) => getComputedStyle(e)[pr], prop);
const box = (loc) => loc.evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
});
const token = (p, name) =>
  p.evaluate((n) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${n})`;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);

/** Every colour painted inside a set of elements that is not a grey (r = g = b) or fully transparent. */
const chromatic = (loc) =>
  loc.evaluateAll((roots) => {
    const out = new Set();
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const s = getComputedStyle(el);
        for (const v of [s.color, s.backgroundColor, s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor]) {
          const m = v.match(/rgba?\(([^)]+)\)/);
          if (!m) { out.add(v); continue; }
          const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
          if (Number(a) === 0) continue;
          if (!(r === g && g === b)) out.add(v);
        }
      }
    }
    return [...out];
  });

async function pinChecks(p, theme) {
  const ink = await token(p, "--ink");
  const focus = await token(p, "--focus");
  const surface = await token(p, "--surface");
  const T = `[${theme}] `;
  const pin = (id) => p.locator(`[data-testid="${id}"] .nh-pin`);
  const chip = (id) => p.locator(`[data-testid="${id}"] .nh-pin__chip`);

  check(T + "exact pin: outside class, a button, no approx / hover / selected / dimmed", (await pin("pin-exact").getAttribute("class")) === "nh-pin nh-pin--outside" && (await pin("pin-exact").getAttribute("role")) === "button");
  check(T + "exact pin label names the source and the match in words", (await pin("pin-exact").getAttribute("aria-label")) === "4100 Sample Ave, $2.4k, outside listing from Zillow, match 91", await pin("pin-exact").getAttribute("aria-label"));
  check(T + "chip reads Z $2.4k", (await text(chip("pin-exact"))) === "Z $2.4k", await text(chip("pin-exact")));
  check(T + "chip: 28 px tall, 1.5 px solid ink outline (this Chromium snaps it to 1 px), surface fill", (await box(chip("pin-exact"))).height === 28 && ["1.5px", "1px"].includes(await css(chip("pin-exact"), "borderTopWidth")) && (await css(chip("pin-exact"), "borderTopStyle")) === "solid" && (await css(chip("pin-exact"), "borderTopColor")) === ink && (await css(chip("pin-exact"), "backgroundColor")) === surface);
  check(T + "caret is ink", (await css(p.locator('[data-testid="pin-exact"] .nh-pin__caret'), "borderTopColor")) === ink);
  const src = p.locator('[data-testid="pin-exact"] .nh-src');
  check(T + "source letter: 16 px ink square, surface-coloured letter, hidden from screen readers", (await box(src)).width === 16 && (await box(src)).height === 16 && (await css(src, "backgroundColor")) === ink && (await css(src, "color")) === surface && (await src.getAttribute("aria-hidden")) === "true");
  check(T + "Furnished Finder pin carries F", (await text(p.locator('[data-testid="pin-exact-f"] .nh-src'))) === "F");
  check(T + "another site falls back to its first letter", (await text(p.locator('[data-testid="pin-other"] .nh-src'))) === "A" && (await pin("pin-other").getAttribute("aria-label")).includes("outside listing from Apartments com"));
  check(T + "no rent: a dash, not $0", (await text(chip("pin-noprice"))) === "Z —");

  check(T + "area only: dashed outline plus the ≈ glyph and the words", (await css(chip("pin-area"), "borderTopStyle")) === "dashed" && (await text(chip("pin-area"))) === "F ≈ $2.7k" && (await pin("pin-area").getAttribute("aria-label")).endsWith(", area only"), await text(chip("pin-area")));
  check(T + "near: ≈ glyph, solid outline, 'approximate location'", (await css(chip("pin-near"), "borderTopStyle")) === "solid" && (await text(chip("pin-near"))) === "Z ≈ $2.5k" && (await pin("pin-near").getAttribute("aria-label")).endsWith(", approximate location"));

  check(T + "hover: the shared lift (scale 1.25) and ink ring", (await css(pin("pin-hover"), "transform")) === "matrix(1.25, 0, 0, 1.25, 0, 0)" && (await css(chip("pin-hover"), "boxShadow")).includes("4px") && (await css(chip("pin-hover"), "borderTopColor")) === ink, await css(pin("pin-hover"), "transform"));
  check(T + "selected: focus outline, focus caret, scale 1.06", (await css(chip("pin-selected"), "borderTopColor")) === focus && (await css(p.locator('[data-testid="pin-selected"] .nh-pin__caret'), "borderTopColor")) === focus && (await css(pin("pin-selected"), "transform")) === "matrix(1.06, 0, 0, 1.06, 0, 0)");
  check(T + "selected + area keeps the dashes", (await css(chip("pin-selected-area"), "borderTopStyle")) === "dashed" && (await css(chip("pin-selected-area"), "borderTopColor")) === focus);
  check(T + "dimmed: the shared 0.18 opacity", (await css(pin("pin-dimmed"), "opacity")) === "0.18");

  // No fourth status colour: outside pins paint greys only (ink, surface, muted); the one exception is the
  // existing focus ring on a selected pin. The status dots on the whole page stay the three known colours.
  const plain = await chromatic(p.locator('[data-testid="stage-outside"] > div:not([data-testid^="pin-selected"]) .nh-pin'));
  check(T + "outside pins use ink only: no colour at all outside the selected ring", plain.length === 0, plain.join(" "));
  const sel = await chromatic(p.locator('[data-testid^="pin-selected"] .nh-pin'));
  check(T + "a selected outside pin adds only the existing focus colour", sel.every((c) => c === focus), sel.join(" "));
  const dots = await p.locator(".nh-dot").evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).backgroundColor))].sort());
  check(T + "status dots are still exactly green, yellow, red", JSON.stringify(dots) === JSON.stringify(["rgb(23, 201, 100)", "rgb(238, 0, 0)", "rgb(250, 204, 21)"]), dots.join(" "));
  check(T + "no outside pin carries a status dot", (await p.locator(".nh-pin--outside .nh-dot").count()) === 0);
  const srcColours = await chromatic(p.locator(".nh-src"));
  check(T + "every source square on the page is ink on surface", srcColours.length === 0, srcColours.join(" "));
}

// ---------- desktop, light ----------
{
  const { ctx, p } = await open("desktop-light");
  await pinChecks(p, "light");

  // ---- our pins are untouched ----
  const ours = p.locator('[data-testid="stage-ours"] .nh-pin');
  check("our pins: same markup as before (dot + rate, 1 px outline)", (await ours.count()) === 5 && (await css(p.locator('[data-testid="stage-ours"] .nh-pin__chip').first(), "borderTopWidth")) === "1px" && (await css(p.locator('[data-testid="stage-ours"] .nh-pin__chip').first(), "paddingLeft")) === "9px");

  // ---- layer rules on the small fake map ----
  const map = p.locator('[data-testid="mini-map"]');
  const outside = map.locator("[data-outside]");
  check("five outside pins: the two homes without coordinates and the one on the claim have none", (await outside.count()) === 5, String(await outside.count()));
  check("the home on the claim is drawn once, as the black pin", (await map.locator(".nh-pin--attached").count()) === 1 && (await map.locator('.nh-pin--outside[aria-label^="912 Example St"]').count()) === 0);
  const zs = await outside.evaluateAll((els) => els.map((e) => Number(e.style.zIndex)));
  check("stacking: every outside pin sits in 400–500, best first", zs.every((z) => z >= 400 && z <= 500) && zs[0] === 496 && JSON.stringify(zs) === JSON.stringify([...zs].sort((a, b) => b - a)), zs.join(","));

  const first = outside.first();
  await first.hover();
  check("hover lifts the pin above its neighbours (3500)", (await first.locator(".nh-pin--hover").count()) === 1 && (await first.evaluate((e) => e.style.zIndex)) === "3500");
  await first.click();
  check("click selects it (4000) and says so in text", (await first.locator(".nh-pin--selected").count()) === 1 && (await first.evaluate((e) => e.style.zIndex)) === "4000" && (await text(p.locator('[data-testid="mini-state"]'))) === "Selected: 4100 Sample Ave");
  await p.mouse.move(5, 5);
  await p.waitForTimeout(150);
  check("only one pin is selected, none hovered after the pointer leaves", (await map.locator(".nh-pin--outside.nh-pin--selected").count()) === 1 && (await map.locator(".nh-pin--hover").count()) === 0);
  await map.screenshot({ path: `${OUT}/layer-selected.png` });

  await p.locator('[data-testid="filter-pets"]').click();
  check("a rail filter dims outside pins that fail it (3 of 5), it does not remove them", (await outside.count()) === 5 && (await map.locator(".nh-pin--outside.nh-pin--dimmed").count()) === 3, String(await map.locator(".nh-pin--outside.nh-pin--dimmed").count()));
  await p.locator('[data-testid="filter-pets"]').click();

  const keyWrap = p.locator('[data-testid="mini-map"]').locator("xpath=preceding-sibling::div[1]");
  const pill = keyWrap.locator('button[data-key="outside"]');
  check("rail pill reads Outside 7 and is pressed", (await text(pill)).replace(/\s+/g, "") === "ZFOutside7" && (await pill.getAttribute("aria-pressed")) === "true", await text(pill));
  check("rail pill: aria-pressed and the spec's title", (await pill.getAttribute("aria-pressed")) === "true" && (await pill.getAttribute("title")) === "Zillow and Furnished Finder listings that are not in our database yet. Click to hide.");
  await pill.click();
  check("Outside off: every outside pin is removed, not dimmed", (await outside.count()) === 0 && (await map.locator(".nh-pin--outside").count()) === 0);
  check("Outside off: our pins, the black pin and the loss pin are all still there", (await map.locator(".nh-pin:not(.nh-pin--outside)").count()) === 4 && (await map.locator(".nh-loss").count()) === 1);
  check("Outside off: pill unpressed, struck through, title says show", (await pill.getAttribute("aria-pressed")) === "false" && (await css(pill, "textDecorationLine")) === "line-through" && (await pill.getAttribute("title")).endsWith("Click to show."));
  check("Outside off: the floating key strikes its entry and says hidden", (await css(map.locator('[data-key="floating"] [data-key="outside"]'), "textDecorationLine")) === "line-through" && (await text(map.locator('[data-key="floating"] [data-key="outside"]'))).endsWith("hidden"));
  await map.screenshot({ path: `${OUT}/layer-outside-off.png` });
  await pill.focus();
  await p.keyboard.press("Enter");
  check("keyboard: Enter on the pill brings the pins back", (await outside.count()) === 5 && (await pill.getAttribute("aria-pressed")) === "true");

  // ---- key in the rail ----
  const rail = (id) => p.locator(`[data-testid="${id}"]`);
  check("rail today (no outside props): three colour pills, no Outside pill", (await rail("rail-today").locator("button").count()) === 3 && (await rail("rail-today").locator('[data-key="outside"]').count()) === 0 && !(await text(rail("rail-today"))).includes("Outside"));
  const order = await rail("rail-on").locator("button").evaluateAll((bs) => bs.map((b) => b.textContent.replace(/[\d,]+$/, "").trim()));
  check("Outside comes right after Do not use", JSON.stringify(order) === JSON.stringify(["Used before", "Neutral", "Do not use", "ZFOutside"]), order.join("|"));
  const on = rail("rail-on").locator('[data-key="outside"]');
  check("rail pill is the same height as the status pills (h-7)", (await box(on)).height === (await box(rail("rail-on").locator("button").first())).height, String((await box(on)).height));
  const squares = on.locator(".nh-src");
  const sq = [await box(squares.nth(0)), await box(squares.nth(1))];
  check("the Z and F squares are 14 px and overlap by 3 px", sq[0].width === 14 && sq[1].width === 14 && Math.round(sq[0].right - sq[1].left) === 3, `${sq[0].right - sq[1].left}`);
  await on.click();
  check("rail-on: click flips aria-pressed", (await on.getAttribute("aria-pressed")) === "false");
  await on.click();
  check("rail-off look: muted, struck through", (await css(rail("rail-off").locator('[data-key="outside"]'), "textDecorationLine")) === "line-through" && (await rail("rail-off").locator('[data-key="outside"]').getAttribute("aria-pressed")) === "false");
  const zero = rail("rail-zero").locator('[data-key="outside"]');
  check("no outside homes: pill reads Outside 0 and is disabled", (await text(zero)).replace(/\s+/g, "") === "ZFOutside0" && (await zero.isDisabled()));
  check("touch rail: the Outside pill is a 44 px target", (await box(rail("rail-touch").locator('[data-key="outside"]'))).height >= 44);
  check("the two trailing entries are still not buttons", (await rail("rail-on").getByText("On this claim").evaluate((e) => !e.closest("button"))) && (await rail("rail-on").getByText("Nearby grouped").evaluate((e) => !e.closest("button"))));

  // ---- key over the map ----
  const key = (id) => p.locator(`[data-testid="${id}"] [data-key="floating"]`);
  check("floating today (no outside props): same six entries, no Outside, no reserved width", (await text(key("float-today"))) === "Loss Used before Neutral Do not use On this claim (3) 7 Nearby grouped · zoom in to split" && (await key("float-today").evaluate((e) => e.style.maxWidth)) === "", await text(key("float-today")));
  check("floating with outside: Outside listing (12) is the last entry, in ink", (await text(key("float-outside"))).endsWith("Outside listing (12)") && (await css(key("float-outside").locator('[data-key="outside"]'), "color")) === (await token(p, "--ink")));
  check("floating loading: the spinner is still there", (await key("float-loading").locator("svg.animate-spin").count()) === 1);
  check("floating hidden: struck through and says hidden", (await text(key("float-hidden").locator('[data-key="outside"]'))).endsWith("Outside listing (12), hidden"));
  const bubbleD = await box(p.locator('[data-testid="float-outside"] [data-testid="bubble-standin"]'));
  const kD = await box(key("float-outside"));
  check("floating, bubble closed (lg+): the key does not reach the bubble", kD.right <= bubbleD.left || kD.top >= bubbleD.bottom || kD.bottom <= bubbleD.top, `${kD.right} vs ${bubbleD.left}`);

  const frame = await box(p.locator('[data-testid="float-chat"]'));
  const kc = await box(key("float-chat"));
  const chat = await box(p.locator('[data-testid="float-chat"] [data-testid="chat-standin"]'));
  check("chat open: the key is at most (map width − 396) wide and wraps", kc.width <= frame.width - 396 + 1 && kc.height > 40, `${kc.width} of ${frame.width}`);
  check("chat open: the key stays 12 px clear of the chat window", kc.right <= chat.left - 11, `${kc.right} vs ${chat.left}`);
  check("chat open, wide map: labels are visible", (await key("float-chat").locator(".sr-only").count()) === 0);

  const kg = await box(key("float-glyphs"));
  const chatG = await box(p.locator('[data-testid="float-glyphs"] [data-testid="chat-standin"]'));
  const sr = await key("float-glyphs").locator(".sr-only").allInnerTexts();
  check("chat open, map under 600 px: glyphs only, every label kept for screen readers", sr.length === 7 && sr.join("|") === "Loss|Used before|Neutral|Do not use|On this claim (3)|Nearby grouped · zoom in to split|Outside listing (12)", sr.join("|"));
  const titles = await key("float-glyphs").locator(":scope > span[title]").evaluateAll((els) => els.map((e) => e.title));
  check("glyphs only: each glyph has its label as a title", titles.length === 7 && titles[6] === "Outside listing (12)" && titles[0] === "Loss", titles.join("|"));
  check("glyphs only: the key clears the chat window", kg.right <= chatG.left, `${kg.right} vs ${chatG.left}`);

  await p.locator('[data-testid="stage-outside"]').screenshot({ path: `${OUT}/pins-light.png` });
  await p.locator('[data-testid="stage-ours"]').screenshot({ path: `${OUT}/pins-ours-light.png` });
  await p.locator('[data-testid="float-chat"]').screenshot({ path: `${OUT}/key-chat-light.png` });
  await p.locator('[data-testid="float-glyphs"]').screenshot({ path: `${OUT}/key-glyphs-light.png` });
  await p.locator('[data-testid="rail-on"]').screenshot({ path: `${OUT}/rail-on-light.png` });
  await p.screenshot({ path: `${OUT}/desktop-light.png`, fullPage: true });
  await ctx.close();
}

// ---------- desktop, dark ----------
{
  const { ctx, p } = await open("desktop-dark", { theme: "dark" });
  check("dark theme is applied", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  await pinChecks(p, "dark");
  const chipBg = await css(p.locator('[data-testid="pin-exact"] .nh-pin__chip'), "backgroundColor");
  const letter = await css(p.locator('[data-testid="pin-exact"] .nh-src'), "color");
  check("dark: the letter flips with the theme (dark letter on a light square)", chipBg === letter && chipBg === (await token(p, "--surface")));
  check("dark: rail pill and floating entry render", (await p.locator('[data-testid="rail-on"] [data-key="outside"]').isVisible()) && (await p.locator('[data-testid="float-outside"] [data-key="outside"]').isVisible()));
  await p.locator('[data-testid="stage-outside"]').screenshot({ path: `${OUT}/pins-dark.png` });
  await p.locator('[data-testid="mini-map"]').screenshot({ path: `${OUT}/layer-dark.png` });
  await p.locator('[data-testid="rail-on"]').screenshot({ path: `${OUT}/rail-on-dark.png` });
  await p.screenshot({ path: `${OUT}/desktop-dark.png`, fullPage: true });
  await ctx.close();
}

// ---------- phone, 360 px ----------
{
  const { ctx, p } = await open("phone-360", { w: 360, h: 760, touch: true });
  check("360 px: the page does not scroll sideways", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const frame = p.locator('[data-testid="float-short"]');
  const key = frame.locator('[data-key="floating"]');
  await frame.scrollIntoViewIfNeeded();
  check("phone key: the short labels", (await text(key)) === "Loss Used before Neutral Do not use On claim (3) 7 Grouped Z F Outside (12)", await text(key));
  const f = await box(frame);
  const k = await box(key);
  const bubble = await box(frame.locator('[data-testid="bubble-standin"]'));
  check("phone key: at most (map width − 84) wide", k.width <= f.width - 84 + 1, `${k.width} of ${f.width}`);
  check("phone key: never runs under the bubble", k.right <= bubble.left, `${k.right} vs ${bubble.left}`);
  check("phone key: stays inside the map", k.left >= f.left && k.top >= f.top);
    check("phone: outside pins render at the same size (28 px chip)", (await box(p.locator('[data-testid="pin-exact"] .nh-pin__chip'))).height === 28);
  const miniPins = p.locator('[data-testid="mini-map"] [data-outside]');
  // The fake map is crowded at 360 px; the far south-east pin is the one nothing overlaps.
  const lone = miniPins.filter({ has: p.locator('[aria-label^="5 Stretch Ct"]') });
  await lone.scrollIntoViewIfNeeded();
  await lone.tap();
  check("phone: tapping an outside pin selects it", (await p.locator('[data-testid="mini-map"] .nh-pin--outside.nh-pin--selected').count()) === 1);
  check("phone: rail pill wraps inside a 320 px rail", (await box(p.locator('[data-testid="rail-touch"] [data-key="outside"]'))).right <= (await box(p.locator('[data-testid="rail-touch"]'))).right);
  await frame.screenshot({ path: `${OUT}/key-phone.png` });
  await p.locator('[data-testid="stage-outside"]').screenshot({ path: `${OUT}/pins-phone.png` });
  await p.screenshot({ path: `${OUT}/phone-360.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
