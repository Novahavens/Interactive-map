// Supabase Edge Function: slack-approvals. NOT DEPLOYED.
// Receives William's and Lou's button presses on the "Claims ready to submit on Nearsite"
// card and records each press in public.agent_approvals. It is the only writer of that table.
//
// Env (set as function secrets when switching on):
//   SLACK_SIGNING_SECRET        from the Slack app
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   provided by Supabase
//   APPROVERS_JSON              {"U00000000A1":"william","U00000000B2":"lou"}
//   APPROVALS_HANDLER_LIVE      "1" to record presses; anything else answers but records nothing
import { verifySlack, toApprovalRow, statusLine } from "./logic.mjs";

const REQUIRED = ["william", "lou"];
const NAMES: Record<string, string> = { william: "William", lou: "Lou" };

Deno.serve(async (req) => {
  const raw = await req.text();
  const v = await verifySlack({
    signingSecret: Deno.env.get("SLACK_SIGNING_SECRET"),
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
    rawBody: raw,
    nowSec: Math.floor(Date.now() / 1000),
  });
  if (!v.ok) return new Response("bad signature", { status: 401 });

  const payload = JSON.parse(new URLSearchParams(raw).get("payload") || "{}");
  const approvers = JSON.parse(Deno.env.get("APPROVERS_JSON") || "{}");
  const r = toApprovalRow(payload, approvers);
  const ephemeral = (text: string) => new Response(JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
    { headers: { "content-type": "application/json" } });
  if (r.refuse) return ephemeral(`Not recorded: ${r.refuse}.`);
  if (Deno.env.get("APPROVALS_HANDLER_LIVE") !== "1") return ephemeral("Approvals aren't switched on yet, so nothing was recorded.");

  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const h = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const ins = await fetch(`${base}/rest/v1/agent_approvals`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(r.row) });
  if (!ins.ok) return ephemeral("Couldn't record that press. Please try again.");

  const q = await fetch(`${base}/rest/v1/agent_approvals?batch_id=eq.${encodeURIComponent(r.row.batch_id)}&order=pressed_at.asc`, { headers: h });
  const rows = q.ok ? await q.json() : [r.row];
  const s = statusLine(rows, REQUIRED, NAMES);
  return ephemeral(`Recorded: ${NAMES[r.row.person]} pressed ${r.row.action}. ${s.text}`);
});
