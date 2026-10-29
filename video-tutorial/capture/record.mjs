// Records the live map (production) with every API mocked by capture/mocks.mjs, as CDP screencast frames with a
// visible cursor, encoded to 30 fps MP4s at 3200x1800 (1600x900 viewport at 2x) so the film can punch in.
//   node capture/record.mjs assets/clips [clip]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mock } from "./mocks.mjs";
import * as D from "./demo-data.mjs";
const { chromium } = createRequire(import.meta.url)("/opt/node-tools/node_modules/playwright/index.js");

const BASE = "https://nova-havens-map.vercel.app";
const OUT = process.argv[2];
const ONLY = process.argv[3];
const W = 1600, H = 900, DSF = 2;

const CURSOR = `
(() => {
  const mk = () => {
    if (document.getElementById("__c")) return;
    const c = document.createElement("div"); c.id = "__c";
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L10 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = "translate(" + (e.clientX - 3) + "px," + (e.clientY - 2) + "px)"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: e.clientX - 22 + "px", top: e.clientY - 22 + "px", width: "44px", height: "44px", borderRadius: "50%", border: "3px solid #0070f3", zIndex: 2147483646, pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out", transform: "scale(.3)", opacity: "1" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.4)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mk); else mk();
})();`;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let cur = { x: W * 0.6, y: H * 0.7 };
async function glide(p, x, y, ms = 700) {
  const from = { ...cur }, n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) { const t = ease(i / n); await p.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t); await p.waitForTimeout(ms / n); }
  cur = { x, y };
}
async function center(loc) { const b = await loc.first().boundingBox(); if (!b) throw new Error("no box"); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
async function hover(p, loc, ms = 700) { await loc.first().scrollIntoViewIfNeeded(); const c = await center(loc); await glide(p, c.x, c.y, ms); }
async function clickOn(p, loc, ms = 700) { await hover(p, loc, ms); await p.waitForTimeout(150); await loc.first().click(); }
async function typeSlow(p, text, delay = 90) { for (const ch of text) { await p.keyboard.type(ch); await p.waitForTimeout(delay); } }
async function wheel(p, dy, steps = 6, gap = 90) { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(gap); } }
const row = (p, name) => p.getByRole("button", { name: new RegExp(name) }).first();
const panel = (p) => p.locator('aside[aria-label="Property details"]:visible');

async function setup(browser, { url = `/?claimId=${D.CLAIM_ID}`, w = W, h = H, theme = "light", mobile = false, tweak } = {}) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Chicago" }
    : { viewport: { width: w, height: h }, deviceScaleFactor: DSF, timezoneId: "America/Chicago" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("nh-theme", t); localStorage.setItem("nh-reporter-name", "Will"); } catch {} }, theme);
  if (!mobile) await ctx.addInitScript(CURSOR);
  // Never leave the page: mailto:, tel: and Quo links are swallowed.
  await ctx.addInitScript(() => {
    const c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (!/^https?:/.test(this.href)) return; return c.call(this); };
    addEventListener("click", (e) => { const a = e.target.closest && e.target.closest("a"); if (a && !/^https?:/.test(a.href)) e.preventDefault(); }, true);
    window.open = () => null;
  });
  const state = {}; await mock(ctx, state);
  if (tweak) tweak(state);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  // Warm the tiles, then load for real.
  await p.goto(BASE + url, { waitUntil: "networkidle" }); await p.waitForTimeout(3500);
  await p.goto(BASE + url, { waitUntil: "networkidle" }); await p.waitForTimeout(3000);
  cur = { x: w * 0.6, y: h * 0.7 }; await p.mouse.move(cur.x, cur.y);
  return { ctx, p, state };
}

async function record(p, name, fn) {
  const dir = path.join(OUT, name + "_frames"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, String(frames.length).padStart(5, "0") + ".jpg");
    fs.writeFileSync(file, Buffer.from(f.data, "base64")); frames.push({ file, t: f.metadata.timestamp });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
  });
  const vp = p.viewportSize(); const dsf = await p.evaluate(() => devicePixelRatio);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: vp.width * dsf, maxHeight: vp.height * dsf, everyNthFrame: 1 });
  await p.waitForTimeout(500);
  await fn();
  await p.waitForTimeout(700);
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  const lines = [];
  for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : end - frames[i].t; lines.push(`file '${path.resolve(frames[i].file)}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); }
  lines.push(`file '${path.resolve(frames.at(-1).file)}'`);
  const list = path.join(OUT, name + ".txt"); fs.writeFileSync(list, lines.join("\n"));
  const mp4 = path.join(OUT, name + ".mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-g", "30", mp4]);
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim();
  console.log(`${name}: ${frames.length} frames, ${dur}s -> ${mp4}`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(list);
}

const clips = {
  // Establishing: the claim's map, a slow cursor drift. Used for the hook and the close.
  async hero(b) {
    const { ctx, p } = await setup(b);
    await record(p, "hero", async () => { await glide(p, W * 0.55, H * 0.55, 3000); await glide(p, W * 0.62, H * 0.45, 3000); await glide(p, W * 0.58, H * 0.5, 2500); });
    await ctx.close();
  },
  // Pick: no claim -> Ctrl+K -> type -> pick -> the map lands on the loss.
  async pick(b) {
    const { ctx, p } = await setup(b, { url: "/" });
    await record(p, "pick", async () => {
      await p.waitForTimeout(900);
      await p.keyboard.press("Control+k"); await p.waitForTimeout(1600);
      await typeSlow(p, "Rivera", 120); await p.waitForTimeout(900);
      await clickOn(p, p.getByText("Demo Family — Rivera #DEMO-1042").first(), 900);
      await p.waitForTimeout(3800);
    });
    await ctx.close();
  },
  // Claim card: open Claim information and read down it.
  async claim(b) {
    const { ctx, p } = await setup(b);
    await record(p, "claim", async () => {
      await p.waitForTimeout(500);
      await clickOn(p, p.getByText("Claim information").first(), 900); await p.waitForTimeout(1200);
      await glide(p, 140, 520, 1200); await p.waitForTimeout(700); await wheel(p, 60, 5, 120); await p.waitForTimeout(2600);
    });
    await ctx.close();
  },
  // Find: radius, filters, then hover a row so its pin grows.
  async find(b) {
    const { ctx, p } = await setup(b);
    await record(p, "find", async () => {
      await p.waitForTimeout(500);
      await clickOn(p, p.getByRole("radio", { name: "15 mi" }), 900); await p.waitForTimeout(1400);
      await clickOn(p, p.getByRole("radio", { name: "10 mi" }), 700); await p.waitForTimeout(900);
      await clickOn(p, p.getByText("Filters", { exact: true }).first(), 800); await p.waitForTimeout(700);
      await clickOn(p, p.getByRole("button", { name: "Pets allowed" }), 700); await p.waitForTimeout(1100);
      await hover(p, row(p, D.hero.name), 1000); await p.waitForTimeout(1600);
      await hover(p, row(p, D.pins[3].name), 700); await p.waitForTimeout(1400);
    });
    await ctx.close();
  },
  // Colours: the legend, then across the pins.
  async colours(b) {
    const { ctx, p } = await setup(b);
    await record(p, "colours", async () => {
      await p.waitForTimeout(500);
      await glide(p, 360, 876, 1400); await p.waitForTimeout(500);
      await glide(p, 520, 876, 1200); await p.waitForTimeout(500);
      await glide(p, 760, 876, 1200); await p.waitForTimeout(800);
      await glide(p, 760, 420, 1500); await p.waitForTimeout(1500);
    });
    await ctx.close();
  },
  // Status chips: hover down the list.
  async status(b) {
    const { ctx, p } = await setup(b);
    await record(p, "status", async () => {
      await p.waitForTimeout(500);
      for (const i of [0, 1, 2, 3]) { await hover(p, row(p, D.pins.filter((x) => x.map_status === "green")[i].name), 800); await p.waitForTimeout(900); }
    });
    await ctx.close();
  },
  // Fit and cost: open the hero, scroll to the move-in total.
  async fit(b) {
    const { ctx, p } = await setup(b);
    await record(p, "fit", async () => {
      await p.waitForTimeout(400);
      await clickOn(p, row(p, D.hero.name), 900); await p.waitForTimeout(1800);
      const pc = await center(panel(p)); await glide(p, pc.x, pc.y, 700);
      await p.waitForTimeout(1200);
      await wheel(p, 80, 6, 110); await p.waitForTimeout(2200);
    });
    await ctx.close();
  },
  // Call and text: the owner's number with its buttons.
  async call(b) {
    const { ctx, p } = await setup(b, { url: `/?claimId=${D.CLAIM_ID}` });
    await clickOn(p, row(p, D.hero.name), 300); await p.waitForTimeout(1500);
    const pc = await center(panel(p)); await glide(p, pc.x, pc.y, 200); await wheel(p, 150, 4, 60); await p.waitForTimeout(800);
    await record(p, "call", async () => {
      await p.waitForTimeout(500);
      await hover(p, p.getByRole("button", { name: /^Call/ }).or(p.getByRole("link", { name: /^Call/ })).first(), 1000); await p.waitForTimeout(1300);
      await hover(p, p.getByRole("button", { name: /^Text/ }).or(p.getByRole("link", { name: /^Text/ })).first(), 700); await p.waitForTimeout(1800);
    });
    await ctx.close();
  },
  // After the call: Last contact is today, and the contact history shows Will's call.
  async log(b) {
    const { ctx, p } = await setup(b, { tweak: (st) => { const d = st.details.get(D.HERO_ID); d.last_contact = "2026-10-29"; } });
    await clickOn(p, row(p, D.hero.name), 300); await p.waitForTimeout(1500);
    await record(p, "log", async () => {
      await p.waitForTimeout(500);
      const pc = await center(panel(p)); await glide(p, pc.x, 175, 900); await p.waitForTimeout(1400);
      await glide(p, pc.x, pc.y, 600); await wheel(p, 150, 4, 100); await p.waitForTimeout(600);
      await clickOn(p, panel(p).getByText(/Contact history/i).first(), 900); await p.waitForTimeout(800);
      await wheel(p, 80, 3, 120); await p.waitForTimeout(3000);
    });
    await ctx.close();
  },
  // Owner said -> Update Monday -> the form, filled in -> Save.
  async said(b) {
    const { ctx, p } = await setup(b);
    await clickOn(p, row(p, D.hero.name), 300); await p.waitForTimeout(1500);
    const pc = await center(panel(p)); await glide(p, pc.x, pc.y, 200); await wheel(p, 200, 4, 60); await p.waitForTimeout(800);
    await record(p, "said", async () => {
      await p.waitForTimeout(500);
      await panel(p).getByText(/Owner said/i).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
      await hover(p, panel(p).getByText(/Owner said/i).first(), 900); await p.waitForTimeout(1500);
      await clickOn(p, panel(p).getByRole("button", { name: /Update Monday/ }), 900); await p.waitForTimeout(2600);
      const pc2 = await center(panel(p)); await glide(p, pc2.x, pc2.y, 600); await wheel(p, 70, 4, 140); await p.waitForTimeout(1500);
    });
    await record(p, "edit", async () => {
      await p.waitForTimeout(400);
      await clickOn(p, p.locator("button:visible", { hasText: /^Save/ }), 1000); await p.waitForTimeout(1500); await glide(p, cur.x - 200, cur.y - 300, 900); await p.waitForTimeout(2500);
    });
    await ctx.close();
  },
  // Add to claim.
  async add(b) {
    const { ctx, p } = await setup(b);
    await clickOn(p, row(p, D.hero.name), 300); await p.waitForTimeout(1500);
    await record(p, "add", async () => {
      await p.waitForTimeout(500);
      await clickOn(p, p.locator("button:visible", { hasText: "Add to claim" }), 1000); await p.waitForTimeout(3400);
    });
    await ctx.close();
  },
  // Send summary: preview -> Email.
  async send(b) {
    const { ctx, p } = await setup(b, { tweak: (st) => { st.added.add(D.HERO_ID); st.added.add(D.pins[5].monday_item_id); } });
    await record(p, "send", async () => {
      await p.waitForTimeout(500);
      await clickOn(p, p.getByRole("button", { name: /Send summary/ }).first(), 900); await p.waitForTimeout(1600);
      const fr = await center(p.locator("iframe[title='Summary preview']")); await glide(p, fr.x, fr.y, 700);
      await wheel(p, 60, 8, 110); await p.waitForTimeout(900);
      await clickOn(p, p.getByRole("button", { name: /Email Jordan Demo/ }), 900); await p.waitForTimeout(2600);
    });
    await ctx.close();
  },
  // Phone: stills of the results sheet and a property (a screencast only sends frames when the page changes).
  async phone(b) {
    for (const theme of ["light", "dark"]) {
      const { ctx, p } = await setup(b, { w: 390, h: 844, mobile: true, theme });
      await p.screenshot({ path: path.join(OUT, `phone-${theme}-map.png`) });
      await row(p, D.hero.name).click().catch((e) => console.log("phone tap", e.message.split("\n")[0])); await p.waitForTimeout(2500);
      await p.screenshot({ path: path.join(OUT, `phone-${theme}-panel.png`) });
      console.log(`phone ${theme}: stills`);
      await ctx.close();
    }
  },
};

const browser = await chromium.launch();
fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of Object.entries(clips)) {
  if (ONLY && !ONLY.split(",").includes(name)) continue;
  try { await fn(browser); } catch (e) { console.log(`FAILED ${name}: ${e.message.split("\n")[0]}`); }
}
await browser.close();
