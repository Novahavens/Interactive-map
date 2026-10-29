// Routes every /api call the map makes to the fictional demo data. Anything not listed is aborted, so a
// recording against the live site can never read or write real data.
import * as D from "./demo-data.mjs";

export async function mock(ctx, state = {}) {
  const details = new Map(D.pins.map((p) => [p.monday_item_id, D.detail(p)]));
  state.details = details;
  state.said = structuredClone(D.ownerSaid);
  state.added = new Set();
  await ctx.route(/^https:\/\/nova-havens-map\.vercel\.app\/api\//, (r) => r.abort()); // registered first = matched last
  await ctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, dryRun: false, quo: true, editing: true } }));
  await ctx.route("**/api/claims/active**", (r) => r.fulfill({ json: { claims: D.claims, count: D.claims.length } }));
  await ctx.route(/\/api\/claim\/\d+$/, (r) => r.fulfill({ json: { ...D.claim, attachedPins: [...state.added].map((id) => D.pins.find((p) => p.monday_item_id === id)) } }));
  await ctx.route(/\/api\/claim\/\d+\/summary/, (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true, updateId: "demo_1" } }) : r.fulfill({ json: D.summary }));
  await ctx.route("**/api/claim/add", async (r) => {
    await new Promise((s) => setTimeout(s, 600));
    try { state.added.add(String(r.request().postDataJSON().propertyId ?? D.HERO_ID)); } catch {}
    r.fulfill({ status: 201, json: { ok: true, subitemId: "demo_2", alreadyAttached: false } });
  });
  await ctx.route(/\/api\/properties\?/, (r) => r.fulfill({ json: { pins: D.pins, coverage: { mappable: 15700, unmapped: 0 } } }));
  await ctx.route(/\/api\/properties\/\d+$/, (r) => r.fulfill({ json: details.get(r.request().url().split("/").pop()) }));
  await ctx.route(/\/api\/properties\/\d+\/contact(\?|$)/, async (r) => { await new Promise((s) => setTimeout(s, 300)); r.fulfill({ json: D.contact }); });
  await ctx.route(/\/api\/properties\/\d+\/owner-said$/, (r) => {
    const id = r.request().url().split("/").slice(-2)[0];
    r.fulfill({ json: id === D.HERO_ID ? state.said : { enabled: true, calls: [] } });
  });
  await ctx.route(/\/api\/properties\/\d+\/edit$/, async (r) => {
    const id = r.request().url().split("/").slice(-2)[0];
    const body = r.request().postDataJSON();
    await new Promise((s) => setTimeout(s, 500));
    details.set(id, { ...details.get(id), ...body.changes });
    if (body.source) { const c = state.said.calls.find((x) => x.callId === body.source.callId); if (c) c.applied = { by: body.editor, at: "2026-10-29T16:20:00Z", fields: Object.keys(body.changes) }; }
    r.fulfill({ json: { ok: true, detail: details.get(id), noted: true, mirrored: true, unconfirmed: [], alreadySaved: false } });
  });
  await ctx.route(/\/api\/properties\/\d+\/flag-link$/, (r) => r.fulfill({ json: { ok: true, noted: true } }));
}
