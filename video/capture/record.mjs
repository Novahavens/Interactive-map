// Records the app as high-quality frame sequences (CDP screencast) with a visible cursor, then encodes 30fps MP4s.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as D from "./demo-data.mjs";

const OUT = process.argv[2];
const ONLY = process.argv[3]; // optional clip name
const W = 1440, H = 810, DSF = 1.5;

const CURSOR = `
(() => {
  const mk = () => {
    if (document.getElementById("__c")) return;
    const c = document.createElement("div"); c.id = "__c";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L10 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
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
async function center(p, loc) { const b = await loc.first().boundingBox(); if (!b) throw new Error("no box"); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
async function clickOn(p, loc, ms = 700) { const c = await center(p, loc); await glide(p, c.x, c.y, ms); await p.waitForTimeout(150); await loc.first().click(); }
async function typeSlow(p, text, delay = 90) { for (const ch of text) { await p.keyboard.type(ch); await p.waitForTimeout(delay); } }

async function setup(browser, { url, w = W, h = H, theme = "light", addOk = true, warm = null }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DSF, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  await p.addInitScript((t) => { try { localStorage.setItem("nh-theme", t); } catch {} }, theme);
  await p.addInitScript(CURSOR);
  await p.addInitScript(() => { const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith("mailto:")) return; return c.call(this); }; });
  await p.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: false } }));
  await p.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims: D.claims, count: D.claims.length } }));
  await p.route(/\/api\/claim\/\d+\/summary/, (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true, updateId: "demo_1" } }) : r.fulfill({ json: D.summary }));
  await p.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: D.claim }));
  await p.route("**/api/claim/add", async (r) => { await new Promise((s) => setTimeout(s, 600)); r.fulfill({ status: 201, json: { ok: true, subitemId: "demo_2", alreadyAttached: false } }); });
  await p.route(/\/api\/properties\?/, (r) => r.fulfill({ json: { pins: D.pins, coverage: { mappable: 7310, unmapped: 8420 } } }));
  await p.route(/\/api\/properties\/\d+$/, (r) => r.fulfill({ json: D.detail }));
  if (warm) { await p.goto(warm, { waitUntil: "networkidle" }); await p.waitForTimeout(4000); } // pre-load map tiles into the cache
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(3000); // tiles
  cur = { x: w * 0.6, y: h * 0.7 }; await p.mouse.move(cur.x, cur.y);
  return { ctx, p };
}

async function record(p, name, fn) {
  const dir = path.join(OUT, name + "_frames"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const i = frames.length; const file = path.join(dir, String(i).padStart(5, "0") + ".jpg");
    fs.writeFileSync(file, Buffer.from(f.data, "base64")); frames.push({ file, t: f.metadata.timestamp });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
  });
  const vp = p.viewportSize();
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: vp.width * DSF, maxHeight: vp.height * DSF, everyNthFrame: 1 });
  await p.waitForTimeout(400);
  await fn();
  await p.waitForTimeout(600);
  await cdp.send("Page.stopScreencast");
  // concat list with real durations -> constant 30fps
  const lines = [];
  for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.1; lines.push(`file '${frames[i].file}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); }
  lines.push(`file '${frames.at(-1).file}'`);
  const list = path.join(OUT, name + ".txt"); fs.writeFileSync(list, lines.join("\n"));
  const mp4 = path.join(OUT, name + ".mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", mp4]);
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim();
  console.log(`${name}: ${frames.length} frames, ${dur}s -> ${mp4}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

const clips = {
  // 01 Pick: empty state -> Ctrl+K -> type -> select -> map lands on the loss
  async pick(b) {
    const { ctx, p } = await setup(b, { url: "http://localhost:3000/", warm: "http://localhost:3000/?claimId=100000001" });
    await record(p, "pick", async () => {
      await p.waitForTimeout(700);
      await p.keyboard.press("Control+k"); await p.waitForTimeout(900);
      await typeSlow(p, "Rivera", 110); await p.waitForTimeout(500);
      await clickOn(p, p.getByText("Demo Family — Rivera #DEMO-1042"), 800);
      await p.waitForTimeout(3200);
    });
    await ctx.close();
  },
  // 02 Find: radius 15, Pets allowed, glance down the list
  async find(b) {
    const { ctx, p } = await setup(b, { url: "http://localhost:3000/?claimId=100000001" });
    await record(p, "find", async () => {
      await p.waitForTimeout(500);
      await clickOn(p, p.getByRole("radio", { name: "15 mi" }), 900); await p.waitForTimeout(1300);
      await clickOn(p, p.getByRole("button", { name: "Pets allowed" }), 700); await p.waitForTimeout(1100);
      await clickOn(p, p.getByRole("radio", { name: "10 mi" }), 700); await p.waitForTimeout(800);
      const row = p.getByRole("button", { name: new RegExp(D.sel.name) });
      const c = await center(p, row); await glide(p, c.x, c.y, 1000); await p.waitForTimeout(900);
    });
    await ctx.close();
  },
  // 03 Add: open a property, scroll to the move-in total, add to claim
  async add(b) {
    const { ctx, p } = await setup(b, { url: "http://localhost:3000/?claimId=100000001" });
    await record(p, "add", async () => {
      await p.waitForTimeout(400);
      await clickOn(p, p.getByRole("button", { name: new RegExp(D.sel.name) }), 900); await p.waitForTimeout(1600);
      const panel = p.locator('aside[aria-label="Property details"]:visible');
      const pc = await center(p, panel); await glide(p, pc.x, pc.y - 120, 600);
      for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 70); await p.waitForTimeout(90); }
      await p.waitForTimeout(1400);
      await clickOn(p, p.locator("button:visible", { hasText: "Add to claim" }), 800); await p.waitForTimeout(3200);
    });
    await ctx.close();
  },
  // 04 Send: open the summary, scroll the preview, email the specialist
  async send(b) {
    const { ctx, p } = await setup(b, { url: "http://localhost:3000/?claimId=100000001" });
    await record(p, "send", async () => {
      await p.waitForTimeout(400);
      await clickOn(p, p.getByRole("button", { name: /Send summary/ }).first(), 900); await p.waitForTimeout(1500);
      const fr = await center(p, p.locator("iframe[title='Summary preview']")); await glide(p, fr.x, fr.y, 600);
      for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 60); await p.waitForTimeout(90); }
      await p.waitForTimeout(900);
      await clickOn(p, p.getByRole("button", { name: /Email Jordan Demo/ }), 800); await p.waitForTimeout(2400);
    });
    await ctx.close();
  },
  // Establishing shot: the map with a claim, slow cursor drift
  async hero(b) {
    const { ctx, p } = await setup(b, { url: "http://localhost:3000/?claimId=100000001" });
    await record(p, "hero", async () => { await glide(p, W * 0.55, H * 0.5, 2500); await glide(p, W * 0.62, H * 0.45, 2500); });
    await ctx.close();
  },
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--force-device-scale-factor=1.5"] });
fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of Object.entries(clips)) { if (!ONLY || ONLY === name) await fn(browser); }
await browser.close();
