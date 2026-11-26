// Pure logic for the Slack approval button handler. No network here, so it can be
// tested with node:test and imported by the Supabase Edge Function (Deno).

export const ACTIONS = new Set(["approve", "hold", "reject"]);

/** Constant-time compare of two strings. */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verifies Slack's v0 request signature. Rejects anything older than 5 minutes. */
export async function verifySlack({ signingSecret, timestamp, signature, rawBody, nowSec }) {
  if (!signingSecret || !timestamp || !signature) return { ok: false, why: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return { ok: false, why: "stale or bad timestamp" };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${timestamp}:${rawBody}`));
  const hex = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(hex, signature) ? { ok: true } : { ok: false, why: "signature mismatch" };
}

/**
 * Turns a Slack block_actions payload into one approval row, or a refusal.
 * approvers: { "U00000000A1": "william", "U00000000B2": "lou" }
 */
export function toApprovalRow(payload, approvers) {
  if (!payload || payload.type !== "block_actions") return { refuse: "not a button press" };
  const act = (payload.actions || [])[0];
  if (!act || !ACTIONS.has(act.action_id)) return { refuse: "unknown action" };
  const blockId = String(act.block_id || "");
  if (!blockId.startsWith("nearsite_approval:")) return { refuse: "not a Nearsite approval card" };
  const batchId = String(act.value || "");
  if (!batchId || blockId !== `nearsite_approval:${batchId}`) return { refuse: "batch id mismatch" };
  const slackUser = payload.user && payload.user.id;
  const person = approvers[slackUser];
  if (!person) return { refuse: "only William and Lou can approve" };
  return { row: { batch_id: batchId, person, action: act.action_id, slack_user: slackUser } };
}

/** Text for the card's context line after a press. */
export function statusLine(rows, required, names) {
  const latest = {};
  for (const r of rows) latest[r.person] = r.action;
  const parts = required.map((p) => `${names[p] || p}: ${latest[p] === "approve" ? "approved" : latest[p] || "waiting"}`);
  const all = required.every((p) => latest[p] === "approve");
  return { text: parts.join(" · ") + (all ? " · ready to submit" : ""), allApproved: all };
}
