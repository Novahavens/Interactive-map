// Links that open Quo on the user's own device, so a call or text goes out from their own Quo
// account and number. The map has no login and no per-user Quo setup: the device is the identity.
// Pure: no I/O and no imports, so `npm run test:unit` covers every rule here.
//
// Quo's documented schemes (support.quo.com → Integrations → Deep linking):
//   openphone://dial?number=…            pre-filled dialer (mobile apps)
//   openphone://message?number=…&text=…  pre-filled composer (mobile apps)
// On a laptop the desktop app handles tel: links once Quo is the default calling app
// (support.quo.com → Calling → Click-to-call); it has no sms: handler, so the Text button there
// tries the openphone:// scheme and also copies the number.

export type Platform = "ios" | "android" | "desktop";

/** Where the page is running, from the user agent. iPadOS reports itself as a Mac with touch. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

const enc = encodeURIComponent;

/** Opens Quo's dialer on `phone` (E.164). The user confirms the call in Quo, from their selected Quo number. */
export function quoDialUrl(phone: string): string {
  return `openphone://dial?number=${enc(phone)}`;
}

/** Opens Quo's composer to `phone` (E.164) with `text` pre-filled, from the user's selected Quo number. */
export function quoMessageUrl(phone: string, text = ""): string {
  const q = [`number=${enc(phone)}`, "selectedAsFallback=true"];
  if (text) q.push(`text=${enc(text)}`);
  return `openphone://message?${q.join("&")}`;
}

/** The desktop route: Quo's click-to-call answers tel: when it's the default calling app. */
export function telUrl(phone: string): string {
  return `tel:${phone}`;
}

/** The link a Call button uses on this platform. */
export function callHref(phone: string, platform: Platform): string {
  return platform === "desktop" ? telUrl(phone) : quoDialUrl(phone);
}

/** Street part of a Monday address: "123 Main St, Tulsa, OK 74133, USA" → "123 Main St". */
export function streetOf(address: string | null | undefined): string {
  return (address ?? "").split(",")[0].trim();
}

/** First name of a contact: "Jane Doe" → "Jane"; a company name is kept whole up to 3 words. */
export function firstNameOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.some((w) => /^(LLC|Inc\.?|Properties|Rentals|Homes|Group|Realty|Management)$/i.test(w))) return words.slice(0, 3).join(" ");
  return words[0];
}

/**
 * The opening line pre-filled in Quo's composer. Short, easy to delete, and it names the property so
 * the owner knows which one. `from` is the reporter name remembered on this device, when there is one.
 */
export function draftText(opts: { to?: string | null; address?: string | null; from?: string | null }): string {
  const who = firstNameOf(opts.to);
  const street = streetOf(opts.address);
  const from = (opts.from ?? "").trim();
  const hi = who ? `Hi ${who}, ` : "Hi, ";
  const us = from ? `it's ${from} from Nova Havens` : "this is Nova Havens";
  const about = street ? ` about ${street}` : "";
  return `${hi}${us}${about}. `;
}
