// The agent chat: the round bubble in the map and the chat window (components/AgentBubble.tsx,
// components/AgentChat.tsx, lib/use-agent-chat.ts, lib/use-speech.ts), driven on the dev preview page
// /dev/agent-chat. POST /api/claim/*/ask is mocked with the fixtures, so nothing real is called.
//
//   BASE=http://localhost:3103 node tests/browser/agent-chat.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";
import { ASK, CLAIM_ID, HOME } from "../fixtures/map-agent.mjs";

const BASE = process.env.BASE ?? "http://localhost:3103";
const OUT = process.argv[2] ?? "test-results/agent-chat";
const CHROME = process.env.CHROME ?? "";
const { chromium } = await import("playwright-core")
  .catch(() => createRequire(import.meta.url)("playwright"))
  .catch(() => (process.env.PW_CORE ? import(process.env.PW_CORE) : Promise.reject(new Error("playwright isn't installed; set PW_CORE to playwright-core's index.mjs"))));
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const USER = "Alex Example";

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

// Stand-ins for the browser's speech-to-text, installed before the page's own scripts.
const NO_SPEECH = () => {
  for (const k of ["SpeechRecognition", "webkitSpeechRecognition"]) {
    try {
      Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true });
    } catch {}
  }
};
const FAKE_SPEECH = (refuse) => {
  window.__speech = { started: 0, stopped: 0, last: null };
  class Fake {
    start() {
      window.__speech.started++;
      window.__speech.last = this;
      if (refuse) setTimeout(() => { this.onerror?.({ error: "not-allowed" }); this.onend?.(); }, 20);
    }
    stop() {
      window.__speech.stopped++;
      setTimeout(() => this.onend?.(), 0);
    }
    abort() {
      this.stop();
    }
  }
  window.__say = (parts) => window.__speech.last?.onresult?.({ results: parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) });
  Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true, writable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: Fake, configurable: true, writable: true });
};

/**
 * One browser context on the preview page. `net.answer(body)` decides what the mocked route says:
 * `{ json, status?, delay? }`. Every request body lands in `net.asks`.
 */
async function open(name, { w = 1440, h = 900, theme = "light", mobile = false, reporter = USER, query = "", speech = "none" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(
    ({ t, r }) => {
      try {
        localStorage.setItem("nh-theme", t);
        if (r) localStorage.setItem("nh-reporter-name", r);
      } catch {}
    },
    { t: theme, r: reporter },
  );
  if (speech === "none") await ctx.addInitScript(NO_SPEECH);
  else await ctx.addInitScript(FAKE_SPEECH, speech === "refuse");
  const net = { asks: [], urls: [], aborted: 0, answer: (body) => ({ json: body.action === "open" ? ASK.open : body.action === "undo" ? ASK.undo : body.action === "more_like" ? ASK.moreLike : ASK.message }) };
  await ctx.route("**/api/claim/*/ask", async (route) => {
    const req = route.request();
    const body = req.postDataJSON();
    net.asks.push(body);
    net.urls.push(new URL(req.url()).pathname);
    const a = net.answer(body);
    if (a.delay) await new Promise((r) => setTimeout(r, a.delay));
    await route.fulfill({ status: a.status ?? 200, json: a.json }).catch(() => {});
  });
  const p = await ctx.newPage();
  p.on("requestfailed", (r) => { if (/\/ask$/.test(r.url())) net.aborted++; });
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|502/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${BASE}/dev/agent-chat${query}`, { waitUntil: "networkidle" });
  const ui = {
    bubble: p.locator("[data-agent-bubble]"),
    chat: p.locator("[data-agent-chat]"),
    input: p.getByLabel("Message the housing agent"),
    send: p.locator("[data-agent-send]"),
    mic: p.locator("[data-agent-mic]"),
    running: p.locator("[data-agent-running]"),
    msgs: p.locator("[data-agent-msg]"),
    results: p.locator("[data-agent-result]"),
    undo: p.locator("[data-agent-undo]"),
    chips: p.locator("[data-agent-chips] button"),
    changed: async () => Number(await p.locator("[data-preview-changed]").getAttribute("data-preview-changed")),
    lastMsg: async () => (await p.locator("[data-agent-msg]").last().innerText()).replace(/\s+/g, " "),
    seen: (text, timeout = 5000) => p.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout }).then(() => true, () => false),
    until: (fn, timeout = 5000) => p.waitForFunction(fn, null, { timeout }).then(() => true, () => false),
    asked: async (n, timeout = 5000) => {
      const t = Date.now();
      while (net.asks.length < n && Date.now() - t < timeout) await p.waitForTimeout(25);
      return net.asks.length >= n;
    },
  };
  return { ctx, p, net, ui };
}
const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const idle = (ui) => ui.running.waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false);

// ---------- 1. Desktop, light: the whole conversation ----------
{
  const { ctx, p, net, ui } = await open("desktop", { query: "?panel=1" });
  const map = await box(p.locator("[data-preview-map]"));
  let b = await box(ui.bubble);
  check("bubble: 48 px round button", b.w === 48 && b.h === 48 && (await ui.bubble.evaluate((e) => e.tagName === "BUTTON" && getComputedStyle(e).borderRadius.startsWith("9999") || parseFloat(getComputedStyle(e).borderRadius) >= 24)));
  check("bubble: bottom right of the map, 12 px in and 24 px up", Math.round(map.r - b.r) === 12 && Math.round(map.b - b.b) === 24, `${map.r - b.r} / ${map.b - b.b}`);
  check("bubble: closed label, not expanded, controls the window", (await ui.bubble.getAttribute("aria-label")) === "Ask the housing agent" && (await ui.bubble.getAttribute("aria-expanded")) === "false" && (await ui.bubble.getAttribute("aria-controls")) === "nh-agent-chat");
  check("closed: no window and no request yet", (await ui.chat.count()) === 0 && net.asks.length === 0);
  await p.screenshot({ path: `${OUT}/desktop-light-closed.png` });

  // Open with the keyboard.
  await ui.bubble.focus();
  await p.keyboard.press("Enter");
  check("open sends one request", await ui.asked(1));
  check("open: the exact body { action: open, user }", same(net.asks[0], { action: "open", user: USER }), JSON.stringify(net.asks[0]));
  check("open: posted to this claim's ask route", net.urls[0] === `/api/claim/${CLAIM_ID}/ask`, net.urls[0]);
  check("window: role dialog, named Housing agent, not modal", (await ui.chat.getAttribute("role")) === "dialog" && (await ui.chat.getAttribute("aria-label")) === "Housing agent" && (await ui.chat.getAttribute("aria-modal")) === null);
  check("window: id matches the bubble's aria-controls", (await ui.chat.getAttribute("id")) === "nh-agent-chat");
  check("bubble: open label and expanded", (await ui.bubble.getAttribute("aria-label")) === "Close the housing agent" && (await ui.bubble.getAttribute("aria-expanded")) === "true");
  check("open: focus goes to the message box", await ui.input.evaluate((e) => e === document.activeElement));
  check("open: the agent's answer is shown", await ui.seen(ASK.open.say));
  await idle(ui);
  check("result summary: 7 homes · 2 new, Map and list updated", (await ui.results.last().innerText()).replace(/\s+/g, " ").startsWith("7 homes · 2 new Map and list updated"), await ui.results.last().innerText());
  check("open: the coordinator is told to re-read (onChanged once)", (await ui.changed()) === 1);
  check("still exactly one request (no double open)", net.asks.length === 1, String(net.asks.length));
  check("header: claim name and FRV", (await p.locator("[data-agent-claim]").innerText()) === "Ramirez family · FRV $3,200");
  check("Undo is disabled on the first search", await ui.undo.isDisabled());
  check("mic is hidden when the browser has no speech-to-text", (await ui.mic.count()) === 0);
  check("log: role log, polite", (await p.locator('[role="log"]').getAttribute("aria-live")) === "polite");
  check("messages start with a visible You / Agent label", (await ui.msgs.first().innerText()).startsWith("Agent"));
  const win = await box(ui.chat);
  check("window: 360 × 520", Math.round(win.w) === 360 && Math.round(win.h) === 520, `${win.w}×${win.h}`);
  check("window: 12 px from the map's right edge, 84 px up", Math.round(map.r - win.r) === 12 && Math.round(map.b - win.b) === 84, `${map.r - win.r} / ${map.b - win.b}`);
  const panel = await box(p.locator("[data-preview-panel]"));
  check("window and bubble never sit over the docked panel", win.r <= panel.x && b.r <= panel.x);
  check("three suggestion chips with no home selected", same(await ui.chips.allInnerTexts(), ["Within 10 miles", "Show unfurnished", "Cheaper"]));
  check("Send is disabled with an empty box", await ui.send.isDisabled());
  check("placeholder and hint", (await ui.input.getAttribute("placeholder")) === "Ask for homes, or change the search" && (await ui.seen("Enter to send", 500)));

  // Shift+Enter adds a line and sends nothing; the box grows.
  const h1 = (await box(ui.input)).h;
  await ui.input.fill("line one");
  await p.keyboard.press("Shift+Enter");
  await p.keyboard.type("line two");
  check("Shift+Enter adds a line and sends nothing", (await ui.input.inputValue()) === "line one\nline two" && net.asks.length === 1);
  const h2 = (await box(ui.input)).h;
  check("the box grows with the text", h2 > h1, `${h1} → ${h2}`);
  await ui.input.fill(Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n"));
  check("…up to five lines, then scrolls", (await box(ui.input)).h <= 103 && (await ui.input.evaluate((e) => e.scrollHeight > e.clientHeight)));
  check("at most 500 characters", (await ui.input.getAttribute("maxlength")) === "500");

  // Type + Enter, the route answers after 1.6 s: running state.
  net.answer = () => ({ json: ASK.message, delay: 1600 });
  await ui.input.fill("  under 3k and a bit wider ");
  await p.keyboard.press("Enter");
  check("Enter sends", await ui.asked(2));
  check("message: the exact body { action: message, message, user }", same(net.asks[1], { action: "message", message: "under 3k and a bit wider", user: USER }), JSON.stringify(net.asks[1]));
  check("the box is emptied and the person's line is shown", (await ui.input.inputValue()) === "" && (await ui.lastMsg()) === "You under 3k and a bit wider", await ui.lastMsg());
  await ui.running.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  check("running: status card with the spec's wording", (await ui.running.locator('[role="status"]').innerText().catch(() => "")) === "Searching Zillow and Furnished Finder…");
  const line = await p.locator("[data-agent-elapsed]").innerText().catch(() => "");
  check("running: elapsed time and the keep-using-the-map line", /^0:0\d · usually under 90 seconds\. You can keep using the map\.$/.test(line), line);
  check("running: Stop button", (await p.locator("[data-agent-stop]").innerText().catch(() => "")).trim() === "Stop");
  await ui.input.fill("typing while it runs");
  check("running: typing is allowed, Send is disabled", (await ui.input.inputValue()) === "typing while it runs" && (await ui.send.isDisabled()));
  await p.keyboard.press("Enter");
  check("running: Enter sends nothing", net.asks.length === 2);
  check("running: chips are disabled", (await ui.chips.evaluateAll((els) => els.every((e) => e.disabled))) === true);
  check("running: placeholder says to wait or stop", (await ui.input.getAttribute("placeholder")) === "Wait for this search, or stop it");
  check("running: the bubble shows a spinner ring", (await p.locator("[data-agent-bubble-ring]").count()) === 1);
  await ui.input.fill("");
  await p.screenshot({ path: `${OUT}/desktop-light-running.png` });
  check("running ends when the route answers", await idle(ui));
  check("answer shown, with its summary", (await ui.seen(ASK.message.say)) && (await ui.results.last().innerText()).replace(/\s+/g, " ").startsWith("9 homes · 3 new Map and list updated"));
  check("onChanged again after the answer", (await ui.changed()) === 2);
  check("the spinner ring is gone", (await p.locator("[data-agent-bubble-ring]").count()) === 0);
  check("a new agent message does not steal focus", await ui.input.evaluate((e) => e === document.activeElement));
  check("Undo is on once there is an earlier search", await ui.undo.isEnabled());
  await p.screenshot({ path: `${OUT}/desktop-light.png` });
  await ui.chat.screenshot({ path: `${OUT}/desktop-light-window.png` });

  // Stop aborts the request.
  net.answer = () => ({ json: ASK.message, delay: 2500 });
  await ui.input.fill("Cheaper please");
  await ui.send.click();
  await ui.asked(3);
  await ui.running.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  const before = { changed: await ui.changed(), msgs: await ui.msgs.count() };
  await p.locator("[data-agent-stop]").click();
  check("Stop: the spec's line, running state gone", (await ui.seen("Search stopped. Nothing changed on the map.")) && (await ui.running.count()) === 0);
  await p.waitForTimeout(400);
  check("Stop aborts the request", net.aborted === 1, String(net.aborted));
  await p.waitForTimeout(2600);
  check("Stop: the late answer is ignored and nothing is re-read", (await ui.msgs.count()) === before.msgs + 1 && (await ui.changed()) === before.changed);

  // Error, then Try again resends the same thing.
  net.answer = () => ({ status: 502, json: ASK.failed });
  await ui.input.fill("pets ok");
  await p.keyboard.press("Enter");
  await ui.asked(4);
  const alert = p.locator("[data-agent-error]");
  await alert.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("error: the spec's line with Try again", (await alert.innerText().catch(() => "")).replace(/\s+/g, " ") === "The search didn't finish. Nothing changed on the map. Try again" && (await alert.getAttribute("role")) === "alert", await alert.innerText().catch(() => ""));
  check("error: nothing re-read", (await ui.changed()) === before.changed);
  await p.screenshot({ path: `${OUT}/desktop-light-error.png` });
  net.answer = () => ({ json: ASK.answer });
  await p.locator("[data-agent-retry]").click();
  check("Try again resends the same body", (await ui.asked(5)) && same(net.asks[4], net.asks[3]) && same(net.asks[4], { action: "message", message: "pets ok", user: USER }), JSON.stringify(net.asks[4]));
  check("Try again: answer shown, error gone, the person's line not repeated", (await ui.seen(ASK.answer.say)) && (await alert.count()) === 0 && (await p.locator('[data-agent-msg="user"]', { hasText: "pets ok" }).count()) === 1);

  // 429 has its own line.
  net.answer = () => ({ status: 429, json: ASK.rateLimited });
  await ui.input.fill("again");
  await p.keyboard.press("Enter");
  await ui.asked(6);
  check("rate limit: its own line", await ui.seen("Too many messages. Try again in a few minutes."));

  // A suggestion chip sends at once.
  net.answer = () => ({ json: ASK.message });
  await ui.chips.nth(2).click();
  check("chip sends at once: { action: message, message: Cheaper, user }", (await ui.asked(7)) && same(net.asks[6], { action: "message", message: "Cheaper", user: USER }), JSON.stringify(net.asks[6]));
  await idle(ui);
  check("chip: shown as the person's line, error cleared", (await p.locator('[data-agent-msg="user"]').last().innerText()).replace(/\s+/g, " ") === "You Cheaper" && (await alert.count()) === 0);

  // Undo.
  net.answer = () => ({ json: ASK.undo });
  await ui.undo.click();
  check("Undo: the exact body { action: undo, user }", (await ui.asked(8)) && same(net.asks[7], { action: "undo", user: USER }), JSON.stringify(net.asks[7]));
  check("Undo: the agent's line is shown", await ui.seen(ASK.undo.say));
  await idle(ui);

  // Esc: only from inside the window; focus goes back to the bubble.
  await p.locator("[data-preview-claim]").focus();
  await p.keyboard.press("Escape");
  check("Esc outside the window leaves it open", (await ui.chat.count()) === 1);
  await ui.input.focus();
  await p.keyboard.press("Escape");
  check("Esc inside the window closes it", (await ui.chat.count()) === 0);
  check("…and focus returns to the bubble", await ui.bubble.evaluate((e) => e === document.activeElement));
  check("re-opening the same claim does not send open again", await (async () => { await ui.bubble.click(); await p.waitForTimeout(400); return net.asks.length === 8 && (await ui.msgs.count()) > 5; })());

  // Badge: an answer that lands while the window is closed.
  net.answer = () => ({ json: ASK.message, delay: 900 });
  await ui.chips.nth(0).click();
  await ui.asked(9);
  await p.locator("[data-agent-close]").click();
  check("the close button closes and returns focus to the bubble", (await ui.chat.count()) === 0 && (await ui.bubble.evaluate((e) => e === document.activeElement)));
  check("closed while searching: the ring shows on the bubble", (await p.locator("[data-agent-bubble-ring]").count()) === 1);
  const badge = p.locator("[data-agent-bubble-badge]");
  await badge.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  check("badge: the number of new homes, found while closed", (await badge.innerText().catch(() => "")) === "3");
  await p.screenshot({ path: `${OUT}/desktop-light-badge.png` });
  await ui.bubble.click();
  check("badge clears when the window opens", (await badge.count()) === 0);

  // Another claim: clean slate, and the no-claim state in between.
  await p.locator("[data-preview-claim]").click();
  check("no claim: the spec's line and Open claims", (await ui.seen("Pick a claim first. The agent searches for one claim at a time.")) && (await p.getByRole("button", { name: "Open claims" }).count()) === 1);
  check("no claim: prompt box disabled, no chips, no Undo, messages gone", (await ui.input.isDisabled()) && (await ui.send.isDisabled()) && (await ui.chips.count()) === 0 && (await ui.undo.count()) === 0 && (await ui.msgs.count()) === 0);
  await p.getByRole("button", { name: "Open claims" }).click();
  check("Open claims calls back", (await p.locator("[data-preview-claims]").getAttribute("data-preview-claims")) === "1");
  check("no claim: no request", net.asks.length === 9);
  await ui.chat.screenshot({ path: `${OUT}/desktop-light-no-claim.png` });
  net.answer = () => ({ json: ASK.open });
  await p.locator("[data-preview-claim]").click();
  check("a claim opened again starts clean and sends open", (await ui.asked(10)) && same(net.asks[9], { action: "open", user: USER }));
  await idle(ui);
  check("…with only the new answer in the log", (await ui.msgs.count()) === 1);
  await ctx.close();
}

// ---------- 1b. Stop on the greeting: not sent again on the spot; sent again when the window is reopened ----------
{
  const { ctx, p, net, ui } = await open("greeting-stop", { query: "?panel=1" });
  net.answer = (body) => (body.action === "open" ? { json: ASK.open, delay: 2500 } : { json: ASK.message });
  await ui.bubble.click();
  await ui.running.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  check("greeting: open is sent once and is running", (await ui.asked(1)) && (await ui.running.count()) === 1);
  await p.locator("[data-agent-stop]").click();
  await p.waitForTimeout(3000);
  check("Stop on the greeting: no second open is sent while the window stays open", net.asks.length === 1, `asks=${net.asks.length}`);
  check("Stop on the greeting: the window is still open and idle", (await ui.chat.count()) === 1 && (await ui.running.count()) === 0);
  await p.locator("[data-agent-close]").click();
  net.answer = () => ({ json: ASK.open });
  await ui.bubble.click();
  check("reopening after a stopped greeting sends open again", (await ui.asked(2)) && same(net.asks[1], { action: "open", user: USER }), JSON.stringify(net.asks));
  await idle(ui);
  await ctx.close();
}

// ---------- 2. Desktop, dark: voice, More like this one ----------
{
  const { ctx, p, net, ui } = await open("desktop-dark", { theme: "dark", query: `?home=outside`, speech: "fake", w: 1280, h: 800 });
  check("dark theme is on", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  await ui.bubble.click();
  await ui.asked(1);
  await idle(ui);
  check("mic is shown when the browser has speech-to-text", (await ui.mic.count()) === 1 && (await ui.mic.getAttribute("aria-label")) === "Speak" && (await ui.mic.getAttribute("aria-pressed")) === "false");
  await ui.mic.click();
  check("listening: pressed, placeholder and helper", (await ui.mic.getAttribute("aria-pressed")) === "true" && (await p.evaluate(() => window.__speech.started)) === 1 && (await ui.input.getAttribute("placeholder")) === "Listening… speak now" && (await ui.seen("Tap the mic to stop", 1000)));
  check("listening: the box border turns ink", await p.locator("[data-agent-prompt]").evaluate((e) => e.dataset.listening === "true" && getComputedStyle(e).borderTopColor === "rgb(237, 237, 237)"));
  check("listening: focus stays in the box", await ui.input.evaluate((e) => e === document.activeElement));
  await p.screenshot({ path: `${OUT}/desktop-dark-listening.png` });
  await p.evaluate(() => window.__say([["pets", false]]));
  check("interim words land in the box", (await ui.input.inputValue()) === "pets", await ui.input.inputValue());
  await p.keyboard.type(" ok");
  check("typing takes over: listening stops, the text stays", (await ui.input.inputValue()) === "pets ok" && (await ui.mic.getAttribute("aria-pressed")) === "false" && (await p.evaluate(() => window.__speech.stopped)) === 1);
  await ui.input.fill("Cheaper,");
  await ui.mic.click();
  await p.evaluate(() => window.__say([["within ten", false]]));
  check("spoken words are added after what was typed", (await ui.input.inputValue()) === "Cheaper, within ten", await ui.input.inputValue());
  await p.evaluate(() => window.__say([["within ten miles", true]]));
  check("final words replace the interim ones", (await ui.input.inputValue()) === "Cheaper, within ten miles");
  check("speech sends nothing by itself", net.asks.length === 1);
  await ui.send.click();
  check("Send posts the spoken text and stops listening", (await ui.asked(2)) && same(net.asks[1], { action: "message", message: "Cheaper, within ten miles", user: USER }) && (await p.evaluate(() => window.__speech.stopped)) === 2 && (await ui.mic.getAttribute("aria-pressed")) === "false", JSON.stringify(net.asks[1]));
  await idle(ui);

  check("a selected home adds More like this one", same(await ui.chips.allInnerTexts(), ["Within 10 miles", "Show unfurnished", "Cheaper", "More like this one"]));
  await ui.chips.nth(3).click();
  check("More like this one (outside listing): { action: more_like, listingId, user }", (await ui.asked(3)) && same(net.asks[2], { action: "more_like", listingId: HOME.zillowExact, user: USER }), JSON.stringify(net.asks[2]));
  check("…shown as More like <name>", (await p.locator('[data-agent-msg="user"]').last().innerText()).replace(/\s+/g, " ") === "You More like 4100 Sample Ave");
  await idle(ui);

  // Closing stops the mic.
  await ui.mic.click();
  await ui.input.focus();
  await p.keyboard.press("Escape");
  check("closing the window stops listening", (await p.evaluate(() => window.__speech.stopped)) === 3);
  await ui.bubble.click();
  await p.screenshot({ path: `${OUT}/desktop-dark.png` });
  await ui.chat.screenshot({ path: `${OUT}/desktop-dark-window.png` });
  await ctx.close();
}

// ---------- 3. A home from our own database, no name remembered, the mic refused ----------
{
  const { ctx, p, net, ui } = await open("refused", { reporter: "", query: "?home=db", speech: "refuse", w: 1100, h: 700 });
  await ui.bubble.click();
  check("no name remembered: the body is exactly { action: open }", (await ui.asked(1)) && same(net.asks[0], { action: "open" }), JSON.stringify(net.asks[0]));
  await idle(ui);
  await ui.chips.nth(3).click();
  check("More like this one (home in our database): sent as a message", (await ui.asked(2)) && same(net.asks[1], { action: "message", message: "More like 1418 Juniper Ct" }), JSON.stringify(net.asks[1]));
  await idle(ui);
  await ui.mic.click();
  check("mic refused: the mic goes away and the spec's line shows", (await ui.seen("The microphone is blocked here. You can still type.")) && (await ui.mic.count()) === 0);
  net.answer = () => ({ json: ASK.off });
  await ui.input.fill("hello");
  await p.keyboard.press("Enter");
  await ui.asked(3);
  const changed = await ui.changed();
  check("agent switched off (ok:false): its line is shown, nothing re-read, no card added", (await ui.seen("The agent is switched off.")) && (await ui.changed()) === changed);
  await ctx.close();
}

// ---------- 4. Phone, 360 px: bottom sheet ----------
for (const theme of ["light", "dark"]) {
  const { ctx, p, net, ui } = await open(`phone-${theme}`, { w: 360, h: 740, mobile: true, theme, speech: "fake" });
  const map = await box(p.locator("[data-preview-map]"));
  const b = await box(ui.bubble);
  check(`360 ${theme}: bubble 12 px above the 56 px sheet bar`, Math.round(map.b - b.b) === 68 && Math.round(map.r - b.r) === 12, `${map.b - b.b}`);
  await p.screenshot({ path: `${OUT}/phone-${theme}-closed.png` });
  net.answer = (body) => (body.action === "open" ? { json: ASK.open } : { json: ASK.message, delay: 1500 });
  await ui.bubble.tap();
  await ui.asked(1);
  await ui.chat.waitFor({ state: "visible" });
  await idle(ui);
  await p.waitForTimeout(700);
  const sheet = await box(ui.chat);
  check(`360 ${theme}: full-width bottom sheet, 88% tall`, Math.round(sheet.w) === 360 && sheet.x === 0 && Math.round(sheet.b) === 740 && Math.abs(sheet.h - 740 * 0.88) < 2, JSON.stringify(sheet));
  check(`360 ${theme}: modal dialog named Housing agent`, (await ui.chat.getAttribute("role")) === "dialog" && (await ui.chat.getAttribute("aria-label")) === "Housing agent" && (await p.evaluate(() => getComputedStyle(document.body).pointerEvents)) === "none");
  check(`360 ${theme}: focus starts in the message box`, await ui.input.evaluate((e) => e === document.activeElement));
  for (let i = 0; i < 14; i++) await p.keyboard.press("Tab");
  check(`360 ${theme}: focus is trapped in the sheet`, await p.evaluate(() => !!document.activeElement?.closest("[data-agent-chat]")));
  check(`360 ${theme}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const sizes = await p.evaluate(() => [...document.querySelectorAll("[data-agent-chat] button")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check(`360 ${theme}: every button is a 44 px touch target`, sizes.length >= 6 && sizes.every(([w, h]) => h >= 44 && w >= 44), JSON.stringify(sizes));
  check(`360 ${theme}: nothing is cut off at the right edge`, await p.evaluate(() => [...document.querySelectorAll("[data-agent-chat] *")].every((e) => e.getBoundingClientRect().right <= 360.5)));
  check(`360 ${theme}: the result card offers Show on map`, (await p.locator("[data-agent-show]").count()) === 1);
  await p.screenshot({ path: `${OUT}/phone-${theme}.png` });
  await ui.chips.nth(2).tap();
  await ui.asked(2);
  await ui.running.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  check(`360 ${theme}: running state in the sheet`, (await ui.running.count()) === 1 && (await p.locator("[data-agent-stop]").count()) === 1);
  await p.screenshot({ path: `${OUT}/phone-${theme}-running.png` });
  await idle(ui);
  await p.locator("[data-agent-show]").tap();
  await ui.chat.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  check(`360 ${theme}: Show on map closes the sheet`, (await ui.chat.count()) === 0);
  await ui.bubble.tap();
  await ui.chat.waitFor({ state: "visible" });
  await p.keyboard.press("Escape");
  await ui.chat.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  check(`360 ${theme}: Esc closes the sheet and focus returns to the bubble`, (await ui.chat.count()) === 0 && (await ui.bubble.evaluate((e) => e === document.activeElement)));
  await ctx.close();
}

// ---------- 5. Phone: the bubble follows the results sheet ----------
{
  const half = await open("phone-half", { w: 360, h: 740, mobile: true, query: "?snap=half" });
  const map = await box(half.p.locator("[data-preview-map]"));
  const b = await box(half.ui.bubble);
  check("phone, sheet half open: bubble sits 12 px above it", Math.round(map.b - b.b) === 740 / 2 + 12, String(map.b - b.b));
  await half.p.screenshot({ path: `${OUT}/phone-half.png` });
  await half.ctx.close();
  const full = await open("phone-expanded", { w: 360, h: 740, mobile: true, query: "?snap=expanded" });
  check("phone, sheet expanded: bubble hidden", !(await full.ui.bubble.isVisible()));
  await full.ctx.close();
  const hid = await open("phone-hidden", { w: 360, h: 740, mobile: true, query: "?hidden=1" });
  check("hidden (property panel open on a phone): bubble not drawn", (await hid.ui.bubble.count()) === 0);
  await hid.ctx.close();
  const wide = await open("desktop-expanded", { query: "?snap=expanded" });
  check("desktop ignores the sheet position", (await wide.ui.bubble.isVisible()) && Math.round((await box(wide.p.locator("[data-preview-map]"))).b - (await box(wide.ui.bubble)).b) === 24);
  await wide.ctx.close();
}

// ---------- 6. Every state, side by side ----------
for (const [name, opts] of [["states-light", {}], ["states-dark", { theme: "dark" }], ["states-360", { w: 360, h: 740, mobile: true }]]) {
  const { ctx, p } = await open(name, { query: "?view=states", ...opts });
  await p.locator("[data-state-box]").first().waitFor({ state: "visible" });
  const text = await p.locator("body").innerText();
  check(`${name}: every state is on the preview page`, ["Tell me what the family needs, or tap a suggestion.", "Pick a claim first.", "Searching Zillow and Furnished Finder…", "The search didn't finish.", "Search stopped. Nothing changed on the map.", "Tap the mic to stop", "The microphone is blocked here. You can still type.", "More like this one"].every((t) => text.includes(t)));
  check(`${name}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  // The page scrolls inside its own box (the app locks page scroll): grow the viewport to show every state.
  const tall = await p.locator("[data-states-scroll]").evaluate((e) => e.scrollHeight);
  await p.setViewportSize({ width: opts.w ?? 1440, height: Math.min(6000, tall) });
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 600));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
