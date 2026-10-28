import { createHmac, timingSafeEqual } from "node:crypto";

// Quo signs webhook deliveries the Standard Webhooks way (API version 2026-03-30): HMAC-SHA256, base64, over
// `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64 part of the `whsec_…` key, sent as one
// or more space-separated `v1,<signature>` entries. https://www.quo.com/docs/2026-03-30/webhooks-signature-validation

/** Quo re-signs every retry, so a delivery older than this is a replay. */
export const MAX_AGE_SEC = 5 * 60;

export interface SignedHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * True when the raw body was signed with one of `keys` (newest first; the previous key is kept through a
 * rotation) within MAX_AGE_SEC of `nowSec`.
 */
export function verifyQuoSignature(rawBody: string, h: SignedHeaders, keys: string[], nowSec = Date.now() / 1000): boolean {
  if (!h.id || !h.timestamp || !h.signature || !keys.length) return false;
  if (!/^\d{1,12}$/.test(h.timestamp) || Math.abs(nowSec - Number(h.timestamp)) > MAX_AGE_SEC) return false;
  const given = h.signature
    .split(" ")
    .map((e) => e.trim())
    .filter((e) => e.startsWith("v1,"))
    .map((e) => Buffer.from(e.slice(3)));
  if (!given.length) return false;
  const signed = `${h.id}.${h.timestamp}.${rawBody}`;
  return keys.some((key) => {
    const secret = Buffer.from(key.startsWith("whsec_") ? key.slice(6) : key, "base64");
    if (!secret.length) return false;
    const want = Buffer.from(createHmac("sha256", secret).update(signed).digest("base64"));
    return given.some((g) => g.length === want.length && timingSafeEqual(g, want));
  });
}
