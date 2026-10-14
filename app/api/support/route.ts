import { NextRequest, NextResponse } from "next/server";
import { SUPPORT_LIMITS, cleanContext, imageKind, slackText } from "@/lib/support";
import type { ApiError, SupportResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// Overridable only so the flow can be exercised against a local stub.
const SLACK = process.env.SLACK_API_URL ?? "https://slack.com/api";

// The app has no login, so anyone with the URL can reach this route. Cap how often
// one address can post. Best-effort: each serverless instance keeps its own count.
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_WINDOW) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  return false;
}

class SlackError extends Error {
  constructor(readonly method: string, readonly code: string) {
    super(`${method}: ${code}`);
  }
}

async function slack(method: string, token: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SLACK}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // Slack answers 200 with ok:false; never trust the status alone.
  if (!json.ok) throw new SlackError(method, String(json.error ?? `HTTP ${res.status}`));
  return json;
}

/** Text only: one message. With a screenshot: upload it and post it with the report as its
 *  comment, so the image shows inline in the channel with the text above it. */
type Shot = { file: Blob; filename: string };

async function send(token: string, channel: string, text: string, shot: Shot | null) {
  if (!shot) {
    await slack("chat.postMessage", token, { channel, text, unfurl_links: "false", unfurl_media: "false" });
    return;
  }
  const slot = await slack("files.getUploadURLExternal", token, { filename: shot.filename, length: String(shot.file.size) });
  const up = await fetch(String(slot.upload_url), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: shot.file,
  });
  if (!up.ok) throw new SlackError("upload", `HTTP ${up.status}`);
  await slack("files.completeUploadExternal", token, {
    files: JSON.stringify([{ id: String(slot.file_id), title: "Screenshot" }]),
    channel_id: channel,
    initial_comment: text,
  });
}

const FRIENDLY: Record<string, string> = {
  not_in_channel: "The Slack bot hasn't been added to the troubleshooting channel yet.",
  channel_not_found: "The troubleshooting channel couldn't be found. Check SLACK_SUPPORT_CHANNEL_ID.",
  invalid_auth: "The Slack token is no longer valid.",
  not_authed: "The Slack token is missing.",
  missing_scope: "The Slack app is missing a permission (it needs chat:write and files:write).",
  ratelimited: "Slack is busy. Try again in a minute.",
};

/**
 * POST /api/support (multipart/form-data)
 *   message     required, what went wrong
 *   name        optional, who is reporting
 *   context     optional JSON (SupportContext) — claim, property, search, page/device
 *   screenshot  optional image (PNG, JPEG, WebP or GIF), up to 4 MB
 * Posts one message to the troubleshooting channel.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json<ApiError>({ error: "Too many reports from here. Try again in a few minutes.", code: "rate_limited" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json<ApiError>({ error: "Send the report as a form.", code: "bad_request" }, { status: 400 });
  }

  const message = String(form.get("message") ?? "").trim();
  if (!message) return NextResponse.json<ApiError>({ error: "Describe the problem first.", code: "bad_request" }, { status: 400 });
  if (message.length > SUPPORT_LIMITS.message) {
    return NextResponse.json<ApiError>({ error: `Keep the description under ${SUPPORT_LIMITS.message} characters.`, code: "bad_request" }, { status: 400 });
  }
  const name = String(form.get("name") ?? "").trim().slice(0, SUPPORT_LIMITS.name) || null;

  let context = cleanContext(null);
  const rawContext = form.get("context");
  if (typeof rawContext === "string" && rawContext.length <= SUPPORT_LIMITS.context) {
    try {
      context = cleanContext(JSON.parse(rawContext));
    } catch {
      /* a broken context never blocks the report */
    }
  }

  let shot: Shot | null = null;
  const file = form.get("screenshot");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > SUPPORT_LIMITS.screenshotBytes) {
      return NextResponse.json<ApiError>({ error: "That screenshot is too large (4 MB max).", code: "bad_request" }, { status: 413 });
    }
    const kind = imageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!kind) return NextResponse.json<ApiError>({ error: "The screenshot must be a PNG, JPEG, WebP or GIF image.", code: "bad_request" }, { status: 400 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    shot = { file, filename: `map-report-${stamp}.${kind}` };
  }

  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const version = sha ? `${sha} (${process.env.VERCEL_ENV ?? "unknown"})` : null;
  const text = slackText({ message, name, context, version, hasScreenshot: !!shot });

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SUPPORT_CHANNEL_ID;
  if (!token || !channel) {
    // Local and preview runs without Slack keep working; production must be wired up.
    if (process.env.VERCEL_ENV === "production") {
      console.error("support report not sent: SLACK_BOT_TOKEN / SLACK_SUPPORT_CHANNEL_ID not set");
      return NextResponse.json<ApiError>({ error: "Troubleshooting isn't connected to Slack yet.", code: "not_configured" }, { status: 503 });
    }
    console.info("[support dry run] would post to Slack:\n" + text + (shot ? `\n[screenshot ${shot.filename}, ${shot.file.size} bytes]` : ""));
    return NextResponse.json<SupportResponse>({ ok: true, dryRun: true });
  }

  try {
    await send(token, channel, text, shot);
    return NextResponse.json<SupportResponse>({ ok: true, dryRun: false });
  } catch (e) {
    const code = e instanceof SlackError ? e.code : "network";
    console.error("support report failed", e);
    return NextResponse.json<ApiError>(
      { error: FRIENDLY[code] ?? "Slack didn't accept the report. Try again, or post it in the channel yourself.", code: `slack_${code}` },
      { status: 502 },
    );
  }
}
