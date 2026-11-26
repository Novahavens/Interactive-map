// The claims-agent cockpit (flag `agentGraph`) on the dev preview page /dev/agent-graph: the claim line, Submit for
// approval, and the panel step in each state (tick or X, Message landlord with the clipboard fallback, hand back,
// drop, not running). Desktop light, desktop dark and 360 px touch. The event route is mocked: nothing is written.
//
//   BASE=http://localhost:3106 node tests/browser/agent-graph.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3106";
const OUT = process.argv[2] ?? "test-results/agent-graph";
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

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function open(name, { w = 1280, h = 900, theme = "light", touch = false, answer = 200 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((t) => { try { localStorage.setItem("nh-theme", t); } catch {} }, theme);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const posts = [];
  await ctx.route("**/api/claim/*/agent/event", async (r) => {
    posts.push(JSON.parse(r.request().postData() ?? "null"));
    await r.fulfill({ status: answer, json: answer === 200 ? { ok: true } : { error: "Refused", code: "refused" } });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${BASE}/dev/agent-graph`, { waitUntil: "networkidle" });
  await p.locator('[data-case="claim-ready"]').waitFor();
  return { ctx, p, c: (n) => p.locator(`[data-case="${n}"]`), posts };
}
const shots = async (p, tag) => {
  for (const g of ["claim", "homes"]) await p.locator(`[data-group="${g}"]`).screenshot({ path: `${OUT}/${tag}-${g}.png` });
};

// ---------- desktop, light ----------
{
  const { ctx, p, c, posts } = await open("light");
  check("claim line shows stage and counts", (await c("claim-ready").innerText()).includes("Agent: Ready to submit") && (await c("claim-ready").innerText()).includes("6 homes · 2 need you · 1 ready"));
  check("Submit shows only when ready", (await c("claim-ready").getByRole("button", { name: "Submit for approval" }).count()) === 1 && (await c("claim-sourcing").getByRole("button").count()) === 0);
  check("claim not running draws nothing", (await c("claim-none").locator("[data-agent-claim]").count()) === 0);
  check("tick and X only on a suggested home", (await c("home-suggested").getByRole("button").count()) === 2 && (await c("home-verified").getByRole("button").count()) === 0 && (await c("home-ready").getByRole("button").count()) === 0);
  check("Message landlord on accepted and messaged homes", (await c("home-accepted").getByRole("button", { name: "Message landlord" }).count()) === 1 && (await c("home-messaged").getByRole("button", { name: "Message landlord" }).count()) === 1);
  check("home not run by the agent says so", (await c("home-none").innerText()).includes("isn't working this home"));
  await shots(p, "desktop-light");

  await c("home-suggested").getByRole("button", { name: "Use this home" }).click();
  await c("home-suggested").getByRole("status").filter({ hasText: "Ticked" }).waitFor();
  check("tick posts human_pick accept for that home", JSON.stringify(posts.at(-1)) === JSON.stringify({ homeKey: "9900000101", type: "human_pick", decision: "accept" }));
  await c("home-needs_person").getByRole("button", { name: "Hand back to agent" }).click();
  await c("home-needs_person").getByRole("status").filter({ hasText: "Sent back" }).waitFor();
  check("hand back posts resume to messaged", JSON.stringify(posts.at(-1)) === JSON.stringify({ homeKey: "9900000104", type: "person_action", action: "resume", resumeTo: "messaged" }));
  await c("claim-ready").getByRole("button", { name: "Submit for approval" }).click();
  await c("claim-ready").getByRole("button", { name: "Sent for William and Lou to approve" }).waitFor();
  check("Submit posts submit_pressed only", JSON.stringify(posts.at(-1)) === JSON.stringify({ type: "submit_pressed" }));
  check("Submit can't be pressed twice", await c("claim-ready").getByRole("button").isDisabled());
  await c("home-accepted").getByRole("button", { name: "Message landlord" }).click();
  await c("home-accepted").getByRole("status").filter({ hasText: "Message copied" }).waitFor();
  check("without the extension the draft is copied", (await p.evaluate(() => navigator.clipboard.readText())).startsWith("Hi! This is the housing team"));
  check("three posts in all, nothing else sent", posts.length === 3);
  await ctx.close();
}

// ---------- refused ----------
{
  const { ctx, c } = await open("refused", { answer: 409 });
  await c("home-suggested").getByRole("button", { name: "Not this one" }).click();
  await c("home-suggested").getByRole("status").filter({ hasText: "didn't go through" }).waitFor();
  check("a refused decision says so", true);
  await ctx.close();
}

// ---------- desktop, dark ----------
{
  const { ctx, p } = await open("dark", { theme: "dark" });
  check("dark theme is on", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  await shots(p, "desktop-dark");
  await ctx.close();
}

// ---------- 360 px, touch ----------
{
  const { ctx, p, c } = await open("phone", { w: 360, h: 780, touch: true });
  check("360: no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check("360: buttons are 44px touch targets", (await c("home-suggested").getByRole("button", { name: "Use this home" }).evaluate((e) => e.getBoundingClientRect().height)) === 44);
  await shots(p, "phone-360");
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
