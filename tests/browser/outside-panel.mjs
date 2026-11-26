// The outside-home panel, its footer and the submit steps, on the dev preview page /dev/outside-panel.
// Covers every footer state (the exact add request, 201, 200 already, dry run, 409 no address, 504, 503,
// slow answer, address unknown, no claim, feature off), each SubmitStatus state, and the optional props on
// PanelFooter and ClaimBrief, at desktop light, desktop dark and 360 px. Every route is mocked: nothing is written.
//
//   BASE=http://localhost:3104 node tests/browser/outside-panel.mjs [screenshot-dir]
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3104";
const OUT = process.argv[2] ?? "test-results/outside-panel";
const require = createRequire(import.meta.url);
const { chromium } = await import("playwright-core")
  .catch(() => require("playwright"))
  .catch(() => (process.env.PW_CORE ? import(process.env.PW_CORE) : Promise.reject(new Error("playwright isn't installed; set PW_CORE to playwright-core's index.mjs"))));
fs.mkdirSync(OUT, { recursive: true });

const CLAIM_ID = "9900000001";
const id = (n) => `11111111-1111-4111-8111-1111111111${String(n).padStart(2, "0")}`;
// Same payloads as ADD_OUTSIDE in tests/fixtures/map-agent.mjs.
const { ADD_OUTSIDE } = await import("../fixtures/map-agent.mjs");
const ANSWERS = {
  [id(1)]: { status: 201, json: ADD_OUTSIDE.added },
  [id(2)]: { status: 201, json: ADD_OUTSIDE.added },
  [id(4)]: { status: 200, json: ADD_OUTSIDE.already },
  [id(6)]: { status: 200, json: ADD_OUTSIDE.dryRun },
  [id(9)]: { status: 409, json: ADD_OUTSIDE.noAddress },
  [id(10)]: { status: 504, json: { error: "The agent took too long. Try again", code: "timeout" } },
  [id(8)]: { status: 503, json: ADD_OUTSIDE.off },
  [id(11)]: { status: 201, json: ADD_OUTSIDE.added, delay: 1500 },
};
const PHOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="352"><rect width="800" height="352" fill="#8aa"/><rect x="250" y="120" width="300" height="232" fill="#bcc"/><path d="M220 130 400 30l180 100z" fill="#677"/></svg>`;

const failures = [];
const errors = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures.push(name);
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function open(name, { w = 1440, h = 900, theme = "light", reporter = "Dana Whitfield", touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(
    ({ t, r }) => {
      try {
        localStorage.setItem("nh-theme", t);
        if (r) localStorage.setItem("nh-reporter-name", r);
      } catch {}
    },
    { t: theme, r: reporter },
  );
  const posts = [];
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: true, quo: false, editing: false } }));
  await ctx.route("**/photos/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: PHOTO }));
  await ctx.route("**/api/claim/**", async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    let body = null;
    try { body = JSON.parse(req.postData() ?? "null"); } catch {}
    posts.push({ method: req.method(), path: url.pathname, raw: req.postData(), body, type: req.headers()["content-type"] });
    const a = ANSWERS[body?.listingId] ?? { status: 404, json: { error: "No such listing", code: "not_found" } };
    if (a.delay) await new Promise((res) => setTimeout(res, a.delay));
    await r.fulfill({ status: a.status, json: a.json }).catch(() => {});
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await p.goto(`${BASE}/dev/outside-panel`, { waitUntil: "networkidle" });
  await p.locator('[data-case="panel-zillow"]').waitFor();
  const c = (n) => p.locator(`[data-case="${n}"]`);
  return { ctx, p, c, posts };
}
const shots = async (p, c, tag) => {
  const groups = p.locator("[data-group]");
  for (let i = 1; i < (await groups.count()); i++) await groups.nth(i).screenshot({ path: `${OUT}/${tag}-${["panels", "footers", "submit", "panel-footer", "claim-brief"][i]}.png` });
  for (const n of ["panel-zillow", "panel-area", "panel-onclaim", "panel-stretch"]) await c(n).screenshot({ path: `${OUT}/${tag}-${n}.png` });
};

// ---------- desktop, light: everything ----------
{
  const { ctx, p, c, posts } = await open("desktop");
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // --- the panel ---
  const z = c("panel-zillow");
  const aside = z.locator('aside[aria-label="Property details"]');
  check("panel: same frame and label as the property panel", (await aside.count()) === 1);
  const zt = await text(z);
  check("panel: source line and distance", zt.includes("From Zillow") && zt.includes("0.9 mi from the loss"), zt.slice(0, 120));
  check("panel: title is the address, as a heading", (await text(z.getByRole("heading", { level: 2 }))) === "4100 Sample Ave");
  check("panel: place, beds, baths and rent under the title", zt.includes("Tulsa, OK · 3 bd · 2 ba · $2,350/mo"));
  const facts = await text(z.locator('[aria-label="Key facts"]'));
  check("panel: key facts tiles", /Beds 3/.test(facts) && /Baths 2/.test(facts) && /Rent \/ mo \$2,350/.test(facts) && /Pets Yes/.test(facts), facts);
  check("panel: availability and pets from the listing", zt.includes("From Dec 1") && zt.includes("Pets allowed"));
  check("panel: photo shown with alt text", (await z.locator('img[alt="Listing photo of 4100 Sample Ave"]').count()) === 1);
  check("panel: score slot inside Fit against this claim", (await z.locator("section", { hasText: "Fit against this claim" }).locator('[data-slot="score"]').count()) === 1);
  const link = z.getByRole("link", { name: "Open on Zillow" });
  check("panel: Open on Zillow opens the listing in a new tab", (await link.getAttribute("href")) === "https://example.com/zillow/4100-sample-ave" && (await link.getAttribute("target")) === "_blank" && /noopener/.test(await link.getAttribute("rel")));
  check("panel: no area note on an exact home", !zt.includes("Area only"));

  const a = c("panel-area");
  const at = await text(a);
  check("area home: From Furnished Finder", at.includes("From Furnished Finder"));
  check("area home: the area-only note, exact copy", at.includes("≈ Area only — the listing doesn't show the street"));
  check("area home: Open on Furnished Finder", (await a.getByRole("link", { name: "Open on Furnished Finder" }).getAttribute("href")) === "https://example.com/ff/quiet-3br");
  check("area home: outreach line", at.includes("Asked Nov 25 · no reply yet"));
  check("area home: children slot rendered before Notes & links", (await a.locator('[data-slot="children"]').count()) === 1);
  check("area home: no photo, no broken image", (await a.locator("img").count()) === 0);
  check("area home: footer is blocked up front", (await a.locator("[data-outside-footer]").getAttribute("data-outside-footer")) === "blocked");
  check("area home: blocked message, exact copy", at.includes("Ask the landlord for the address first. We can't add a home without a street address."));
  check("area home: Add to claim is disabled", await a.getByRole("button", { name: "Add to claim" }).isDisabled());
  await a.getByRole("button", { name: "Text: Ask for the address" }).click();
  check("area home: Text: Ask for the address calls onAskAddress", (await text(p.locator("[data-log]"))).includes("ask-address"));
  check("area home: nothing was posted", posts.length === 0);

  const oc = c("panel-onclaim");
  const oct = await text(oc);
  check("on-claim home: banner and no Add button", (await oc.getByRole("status").filter({ hasText: "On this claim" }).count()) === 1 && (await oc.getByRole("button", { name: "Add to claim" }).count()) === 0);
  check("on-claim home: saved-to-our-database chip and Monday link", oct.includes("Saved to our database") && (await oc.getByRole("link", { name: "Open in Monday" }).count()) === 1);
  check("on-claim home: submit steps under the banner", (await oc.locator('ol[aria-label="Submit status: Ready to Submit, step 2 of 3"]').count()) === 1 && oct.includes("Approved by Alex Example · Nov 25"));

  const st = await text(c("panel-stretch"));
  check("unfit home: says why it is outside the search", st.includes("Outside the search. The rent is above the limit."), st.slice(0, 200));
  check("unfit home: New chip, pets No", st.includes("New") && /Pets No/.test(st));
  const ap = await text(c("panel-approx"));
  check("approx home: approximate note and ≈ distance", ap.includes("≈ Approximate location") && ap.includes("≈ 3.7 mi from the loss"));
  check("no claim: button disabled with the reason", (await c("panel-approx").getByRole("button", { name: "Add to claim" }).isDisabled()) && ap.includes("Pick a claim from Claims"));
  const bare = c("panel-bare");
  const bt = await text(bare);
  check("unknown source: plain label, dashes, no unsafe link", bt.includes("Outside listing") && (await bare.locator('a[href^="javascript"]').count()) === 0 && bt.includes("No link on this listing."));
  check("adding off: the panel has no footer", (await bare.locator("[data-outside-footer]").count()) === 0);

  let closes = 0;
  for (const n of ["panel-zillow", "panel-area"]) { await c(n).getByRole("button", { name: "Close panel" }).click(); closes++; }
  check("Close panel calls onClose", ((await text(p.locator("[data-log]"))).match(/closed/g) ?? []).length === closes);

  // --- footer states ---
  const idle = c("foot-add");
  const it = await text(idle);
  check("footer idle: Adding to: claim · account manager", it.includes("Adding to: Sample family · Alex Example"), it);
  check("footer idle: helper line, exact copy", it.includes("Also saves this home to our database. Starts as “To Do”."));
  check("footer no claim: disabled, says to pick a claim", (await c("foot-noclaim").getByRole("button", { name: "Add to claim" }).isDisabled()) && (await text(c("foot-noclaim"))).includes("Pick a claim from Claims") && !(await text(c("foot-noclaim"))).includes("Adding to:"));
  check("footer feature off: renders nothing", (await c("foot-off").locator("[data-outside-footer]").count()) === 0 && (await c("foot-off").getByRole("button").count()) === 0);
  check("footer feature off, home on the claim: still says On this claim, no button", (await text(c("foot-off-onclaim"))).includes("On this claim") && (await c("foot-off-onclaim").getByRole("button").count()) === 0);
  check("footer blocked, no number: note shown, no Text shortcut", (await text(c("foot-blocked-nonumber"))).includes("Ask the landlord for the address first.") && (await c("foot-blocked-nonumber").getByRole("button", { name: /Ask for the address/ }).count()) === 0);
  check("footer blocked, with a number: Text shortcut shown", (await c("foot-blocked").getByRole("button", { name: "Text: Ask for the address" }).count()) === 1);
  const ocf = await text(c("foot-onclaim"));
  check("footer on claim from the list: banner, steps, submitted line", ocf.includes("On this claim") && ocf.includes("Submitted Nov 26 · approved by Alex Example") && ocf.includes("Already an option on this claim"));
  await p.locator("[data-group]").nth(1).screenshot({ path: `${OUT}/desktop-light-footers-before.png` });

  // adding (slow answer)
  const slow = c("foot-slow");
  await slow.getByRole("button", { name: "Add to claim" }).click();
  await slow.getByText("Adding to claim…").waitFor();
  check("footer adding: Adding to claim…, button disabled", await slow.getByRole("button", { name: /Adding to claim/ }).isDisabled());
  await slow.screenshot({ path: `${OUT}/desktop-light-foot-adding.png` });

  // 201
  await idle.getByRole("button", { name: "Add to claim" }).click();
  await idle.getByRole("status").filter({ hasText: "On this claim" }).waitFor();
  const post = posts.find((x) => x.body?.listingId === id(1));
  check("add: POST /api/claim/:claimId/add-outside", post?.method === "POST" && post?.path === `/api/claim/${CLAIM_ID}/add-outside`, `${post?.method} ${post?.path}`);
  check("add: exact body { listingId, user }", post?.raw === JSON.stringify({ listingId: id(1), user: "Dana Whitfield" }), post?.raw);
  check("add: sent as JSON", /application\/json/.test(post?.type ?? ""));
  const done = await text(idle);
  check("added: line with the day, who, and Monday link", done.includes(`Added ${today} by Dana · saved to our database · Monday →`), done);
  check("added: Monday link goes to the claim item", (await idle.getByRole("link", { name: "Monday →" }).getAttribute("href")).endsWith(`/pulses/${CLAIM_ID}`));
  check("added: starts at To Do when the submit flag is on", (await idle.locator('ol[aria-label="Submit status: To Do, step 1 of 3"]').count()) === 1);
  check("added: onAdded(home, res) called with the answer", (await text(p.locator("[data-log]"))).includes(`added ${id(1)} sub=9900000205 property=9900000107 already=false`));
  check("added: the Add button is gone", (await idle.getByRole("button").count()) === 0);

  const plain = c("foot-add-plain");
  await plain.getByRole("button", { name: "Add to claim" }).click();
  await plain.getByRole("status").filter({ hasText: "On this claim" }).waitFor();
  check("added, submit flag off: no steps", (await plain.locator("ol").count()) === 0 && (await text(plain)).includes(`Added ${today} by Dana`));

  // 200 already on the claim
  const al = c("foot-already");
  await al.getByRole("button", { name: "Add to claim" }).click();
  await al.getByRole("status").filter({ hasText: "On this claim" }).waitFor();
  check("already on claim (200): banner and its own line, not 'Added'", (await text(al)).includes("Already an option on this claim · Monday →") && !(await text(al)).includes("Added "));
  check("already on claim: onAdded told so", (await text(p.locator("[data-log]"))).includes(`added ${id(4)} sub=9900000201 property=9900000101 already=true`));

  // dry run
  const dry = c("foot-dry");
  await dry.getByRole("button", { name: "Add to claim" }).click();
  await dry.getByText("Dry run: nothing was added.").waitFor();
  check("dry run: says nothing was added, stays addable, not marked on the claim", (await dry.locator("[data-outside-footer]").getAttribute("data-outside-footer")) === "dry" && (await dry.getByRole("button", { name: "Add to claim" }).isEnabled()) && !(await text(dry)).includes("On this claim"));
  check("dry run: onAdded is not called", !(await text(p.locator("[data-log]"))).includes(id(6)));

  // 409 no_address
  const na = c("foot-409");
  check("409 home starts addable", await na.getByRole("button", { name: "Add to claim" }).isEnabled());
  await na.getByRole("button", { name: "Add to claim" }).click();
  await na.getByRole("alert").waitFor();
  check("409 no_address: the spec's message", (await text(na.getByRole("alert"))) === "Ask the landlord for the address first. We can't add a home without a street address.", await text(na.getByRole("alert")));
  check("409 no_address: button disabled, no red error box", (await na.getByRole("button", { name: "Add to claim" }).isDisabled()) && !(await text(na)).includes("Not added."));
  const before = (await text(p.locator("[data-log]"))).match(/ask-address/g)?.length ?? 0;
  await na.getByRole("button", { name: "Text: Ask for the address" }).click();
  check("409 no_address: Text: Ask for the address calls onAskAddress", ((await text(p.locator("[data-log]"))).match(/ask-address/g)?.length ?? 0) === before + 1);

  // errors
  const er = c("foot-error");
  await er.getByRole("button", { name: "Add to claim" }).click();
  await er.getByText("Not added.").waitFor();
  check("error (504): Not added. <reason>, can try again", (await text(er)).includes("Not added. The agent took too long. Try again") && (await er.getByRole("button", { name: "Add to claim" }).isEnabled()));
  const off = c("foot-off-503");
  await off.getByRole("button", { name: "Add to claim" }).click();
  await off.getByText("Not added.").waitFor();
  check("switched off on the server (503): Not added. with its reason", (await text(off)).includes("Not added. Adding outside homes is switched off"));

  await slow.getByRole("status").filter({ hasText: "On this claim" }).waitFor();
  check("slow add lands as added", (await text(slow)).includes(`Added ${today} by Dana`));
  check("one request per click, none from blocked / off / no-claim footers", posts.length === 8 && posts.every((x) => x.method === "POST"), String(posts.length));

  // keyboard
  const kb = c("foot-error").getByRole("button", { name: "Add to claim" });
  await kb.focus();
  check("Add to claim is a real button, focusable", await kb.evaluate((e) => e === document.activeElement && e.tagName === "BUTTON"));
  check("Add to claim is as tall as the existing footer button (35px, root font 14px)", (await kb.evaluate((e) => e.getBoundingClientRect().height)) === 35);

  // --- SubmitStatus ---
  const steps = async (n) => c(n).locator("ol > li").evaluateAll((lis) => lis.map((li) => `${li.querySelector("span[aria-hidden]:last-of-type, span.rounded-full")?.textContent ?? ""}|${li.getAttribute("aria-current") ?? ""}`));
  const dots = async (n) => c(n).locator("ol > li span.rounded-full").allInnerTexts();
  check("To Do: ol label, dots 1 2 3, step 1 current", (await c("submit-todo").locator("ol").getAttribute("aria-label")) === "Submit status: To Do, step 1 of 3" && (await dots("submit-todo")).join("") === "123" && (await steps("submit-todo"))[0].endsWith("|step"));
  check("To Do: the three labels, no line under", /To Do.*Ready to Submit.*Option Submitted/.test(await text(c("submit-todo"))) && (await c("submit-todo").locator("p").count()) === 0);
  check("Ready: ✓ 2 3, step 2 current, approved line", (await c("submit-ready").locator("ol").getAttribute("aria-label")) === "Submit status: Ready to Submit, step 2 of 3" && (await dots("submit-ready")).join("") === "✓23" && (await steps("submit-ready"))[1].endsWith("|step") && (await text(c("submit-ready"))).includes("Approved by Alex Example · Nov 25"));
  check("Ready, no approver yet: no line", (await c("submit-ready-noapprover").locator("p").count()) === 0);
  check("Submitted: ✓ ✓ ✓, step 3 current, submitted line", (await c("submit-submitted").locator("ol").getAttribute("aria-label")) === "Submit status: Option Submitted, step 3 of 3" && (await dots("submit-submitted")).join("") === "✓✓✓" && (await text(c("submit-submitted"))).includes("Submitted Nov 26 · approved by Alex Example"));
  check("current step is filled, later steps are hollow (not colour alone: number / tick too)", await c("submit-ready").locator("ol > li span.rounded-full").evaluateAll((d) => { const bg = d.map((e) => getComputedStyle(e).backgroundColor); return bg[1] !== bg[2] && bg[0] === bg[2]; }));
  check("Blocked, claim closed: red note, no steps", (await text(c("submit-blocked-closed"))).includes("Blocked: claim closed. This home can't be submitted.") && (await c("submit-blocked-closed").locator("ol").count()) === 0 && (await c("submit-blocked-closed").locator("svg").count()) === 1);
  check("Blocked, already submitted: with the day it was sent", (await text(c("submit-blocked-already"))).includes("Blocked: already submitted. This home was sent on Nov 20."));
  check("Blocked, other reason: the reason is shown", (await text(c("submit-blocked-other"))).includes("Blocked: availability has not been checked in the last 7 days. This home can't be submitted."));
  check("Loading: one 20px skeleton bar", (await c("submit-loading").locator(".nh-skeleton").evaluate((e) => e.getBoundingClientRect().height)) === 20);
  check("Unknown: renders nothing", (await c("submit-unknown").locator("ol, [data-submit]").count()) === 0);

  // --- PanelFooter and ClaimBrief stay as they were without the new props ---
  const pfPlain = await text(c("pf-plain"));
  check("PanelFooter without submit: unchanged", pfPlain.includes("On this claim") && pfPlain.includes("Sub-item created · “To Do” · open on Monday →") && (await c("pf-plain").locator("ol").count()) === 0);
  check("PanelFooter with submit: steps under the On this claim box, existing line kept", (await c("pf-submit").locator('[role="status"] + [data-submit="ready"]').count()) === 1 && (await text(c("pf-submit"))).includes("open on Monday →"));
  check("PanelFooter blocked: the red note", (await text(c("pf-blocked"))).includes("Blocked: claim closed."));
  check("PanelFooter not attached: submit ignored", (await c("pf-notattached").locator("[data-submit]").count()) === 0 && (await text(c("pf-notattached"))).includes("One sub-item, status “To Do”."));
  check("ClaimBrief without counts: unchanged", (await c("brief-plain").locator("[data-submit-counts]").count()) === 0 && (await text(c("brief-plain").locator("summary"))) === "Claim information");
  check("ClaimBrief: 3 ready · 2 submitted in the summary row", (await text(c("brief-counts").locator("summary"))) === "Claim information 3 ready · 2 submitted");
  check("ClaimBrief: 0 ready · 0 submitted with options", (await text(c("brief-zero").locator("summary [data-submit-counts]"))) === "0 ready · 0 submitted");
  check("ClaimBrief: No options yet", (await text(c("brief-none").locator("summary [data-submit-counts]"))) === "No options yet");

  check("desktop: no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shots(p, c, "desktop-light");
  await ctx.close();
}

// ---------- desktop, dark ----------
{
  const { ctx, p, c, posts } = await open("dark", { theme: "dark", reporter: "" });
  check("dark theme is on", (await p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark");
  await c("foot-add").getByRole("button", { name: "Add to claim" }).click();
  await c("foot-add").getByRole("status").filter({ hasText: "On this claim" }).waitFor();
  check("no name remembered: body is exactly { listingId }", posts[0]?.raw === JSON.stringify({ listingId: id(1) }), posts[0]?.raw);
  check("no name remembered: 'Added <day>' without a name", /Added \w{3} \d{1,2} · saved to our database/.test(await text(c("foot-add"))));
  for (const n of ["foot-409", "foot-error", "foot-dry"]) await c(n).getByRole("button", { name: "Add to claim" }).click();
  await c("foot-409").getByRole("alert").waitFor();
  await c("foot-error").getByText("Not added.").waitFor();
  await c("foot-dry").getByText("Dry run: nothing was added.").waitFor();
  const contrast = await c("submit-ready").locator("ol > li span.rounded-full").nth(1).evaluate((e) => { const s = getComputedStyle(e); return s.backgroundColor !== s.color; });
  check("dark: current step dot is readable (fill differs from its number)", contrast);
  await shots(p, c, "desktop-dark");
  await ctx.close();
}

// ---------- 360 px, touch ----------
{
  const { ctx, p, c } = await open("phone", { w: 360, h: 780, touch: true });
  check("360: no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), String(await p.evaluate(() => document.documentElement.scrollWidth)));
  const fits = async (n) => c(n).evaluate((e) => [...e.querySelectorAll("*")].every((x) => x.getBoundingClientRect().right <= window.innerWidth + 0.5));
  check("360: panel fits the screen", (await fits("panel-zillow")) && (await fits("panel-area")));
  check("360: three steps fit side by side", (await fits("submit-submitted")) && (await c("submit-submitted").locator("ol > li").evaluateAll((l) => new Set(l.map((x) => Math.round(x.getBoundingClientRect().top))).size)) === 1);
  check("360: Add to claim is a 44px touch target", (await c("foot-add").getByRole("button", { name: "Add to claim" }).evaluate((e) => e.getBoundingClientRect().height)) === 44);
  check("360: Text: Ask for the address is a 44px touch target", (await c("foot-blocked").getByRole("button", { name: "Text: Ask for the address" }).evaluate((e) => e.getBoundingClientRect().height)) === 44);
  check("360: Close is a 44px touch target", (await c("panel-zillow").getByRole("button", { name: "Close panel" }).evaluate((e) => { const r = e.getBoundingClientRect(); return r.height === 44 && r.width === 44; })));
  check("360: claim counts stay on the summary row", await c("brief-counts").locator("summary").evaluate((e) => e.getBoundingClientRect().height <= 48));
  for (const n of ["foot-add", "foot-409", "foot-error", "foot-dry"]) await c(n).getByRole("button", { name: "Add to claim" }).tap();
  await c("foot-add").getByRole("status").filter({ hasText: "On this claim" }).waitFor();
  await c("foot-409").getByRole("alert").waitFor();
  await c("foot-error").getByText("Not added.").waitFor();
  await shots(p, c, "phone-360");
  await ctx.close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nALL PASSED");
process.exit(failures.length ? 1 : 0);
