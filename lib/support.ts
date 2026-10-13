// Troubleshooting reports: validation and the Slack message text. Pure functions,
// shared by /api/support and its tests; the Slack calls live in the route.
import type { SupportContext } from "./types";

export const SUPPORT_LIMITS = {
  message: 2000,
  name: 80,
  context: 4000,
  // Vercel functions reject request bodies over 4.5 MB; the browser shrinks screenshots below this first.
  screenshotBytes: 4 * 1024 * 1024,
} as const;

const MONDAY = "https://novahavens.monday.com/boards";

/** Slack treats &, < and > as markup: escaping them is what stops a report from
 *  pinging @channel (<!channel>) or dressing up a link. */
export const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  return s ? s.slice(0, max) : null;
};
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const digits = (v: unknown): string | null => (typeof v === "string" && /^\d{1,20}$/.test(v) ? v : null);

/** The browser's context is a hint for whoever reads the report, never trusted:
 *  keep only known fields, as short plain strings and numbers. */
export function cleanContext(raw: unknown): SupportContext {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const claimId = digits(o.claim?.id);
  const propertyId = digits(o.property?.id);
  const lat = finite(o.search?.lat), lng = finite(o.search?.lng);
  return {
    claim: claimId ? { id: claimId, name: clip(o.claim?.name, 120) } : null,
    property: propertyId ? { id: propertyId, name: clip(o.property?.name, 120) } : null,
    search:
      lat != null && lng != null
        ? {
            address: clip(o.search?.address, 200),
            lat,
            lng,
            radiusMiles: finite(o.search?.radiusMiles),
            filters: Array.isArray(o.search?.filters)
              ? o.search.filters.map((f: unknown) => clip(f, 20)).filter(Boolean).slice(0, 6)
              : [],
          }
        : null,
    page: {
      url: clip(o.page?.url, 300),
      viewport: clip(o.page?.viewport, 20),
      screen: clip(o.page?.screen, 20),
      theme: clip(o.page?.theme, 10),
      userAgent: clip(o.page?.userAgent, 300),
      language: clip(o.page?.language, 20),
      timezone: clip(o.page?.timezone, 60),
    },
  };
}

export type ReportInput = { message: string; name: string | null; context: SupportContext; version: string | null; hasScreenshot: boolean };

/** One Slack message: the problem quoted first, then everything needed to reproduce it. */
export function slackText(r: ReportInput): string {
  const c = r.context;
  const lines: string[] = [];
  lines.push(`:rotating_light: *Map problem report*${r.name ? ` from *${slackEscape(r.name)}*` : ""}`);
  lines.push(r.message.split("\n").map((l) => `> ${slackEscape(l)}`).join("\n"));
  lines.push("");
  if (c.claim) {
    lines.push(`*Claim:* <${MONDAY}/9030696652/pulses/${c.claim.id}|${slackEscape(c.claim.name ?? c.claim.id)}> (\`${c.claim.id}\`)`);
  } else {
    lines.push("*Claim:* none selected");
  }
  if (c.property) {
    lines.push(`*Property:* <${MONDAY}/18415735059/pulses/${c.property.id}|${slackEscape(c.property.name ?? c.property.id)}> (\`${c.property.id}\`)`);
  }
  if (c.search) {
    const s = c.search;
    const where = s.address ? slackEscape(s.address) : `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
    const filters = s.filters.length ? ` · filters: ${s.filters.map(slackEscape).join(", ")}` : "";
    lines.push(`*Search:* ${where} · ${s.radiusMiles ?? "?"} mi${filters}`);
  }
  const p = c.page;
  const device = [p.viewport && `window ${p.viewport}`, p.screen && `screen ${p.screen}`, p.theme && `${p.theme} mode`, p.language, p.timezone]
    .filter(Boolean)
    .map((v) => slackEscape(String(v)))
    .join(" · ");
  if (p.url) lines.push(`*Page:* ${slackEscape(p.url)}`);
  if (device) lines.push(`*Device:* ${device}`);
  if (p.userAgent) lines.push(`*Browser:* \`${slackEscape(p.userAgent)}\``);
  if (r.version) lines.push(`*App version:* \`${slackEscape(r.version)}\``);
  if (!r.hasScreenshot) lines.push("_No screenshot attached._");
  return lines.join("\n");
}

/** Accept only real PNG / JPEG / WebP / GIF bytes, whatever the browser claims the type is. */
export function imageKind(bytes: Uint8Array): "png" | "jpg" | "webp" | "gif" | null {
  const b = bytes;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  return null;
}
