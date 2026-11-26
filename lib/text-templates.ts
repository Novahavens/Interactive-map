// Ready-made openings for the Text action in Contacts. Pure: no I/O. Same tone as draftText in
// lib/quo-links.ts: short, easy to edit, names the home so the owner knows which one, ends with a space so
// the person can keep typing. Nothing is sent from here; the text only pre-fills Quo's composer.
import { firstNameOf, streetOf } from "./quo-links.ts";
import type { TextTemplate } from "./types";

export const TEXT_TEMPLATES: readonly TextTemplate[] = [
  { key: "availability", label: "Ask if it's available" },
  { key: "address", label: "Ask for the address" },
  { key: "rate", label: "Ask the rate" },
];

export interface TemplateOpts {
  /** The contact's name as Monday has it; a company name gives a plain "Hi,". */
  to?: string | null;
  /** The home's address; only the street part is used. */
  address?: string | null;
  /** The teammate's name remembered on this device. */
  from?: string | null;
  /** Bedrooms the family needs. */
  beds?: number | null;
  city?: string | null;
  /** Move-in date, YYYY-MM-DD. */
  moveIn?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-01" → "Dec 1"; anything that is not a real date → "". No time zone involved. */
export function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!m) return "";
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${MONTHS[month - 1]} ${day}`;
}

export function templateText(key: TextTemplate["key"], opts: TemplateOpts = {}): string {
  const who = firstNameOf(opts.to);
  const street = streetOf(opts.address);
  const from = (opts.from ?? "").trim();
  const city = (opts.city ?? "").trim();
  const beds = typeof opts.beds === "number" && Number.isFinite(opts.beds) && opts.beds > 0 ? opts.beds : null;
  const when = shortDate(opts.moveIn);

  const hi = who ? `Hi ${who}, ` : "Hi, ";
  const us = from ? `it's ${from} from Nova Havens` : "this is Nova Havens";
  const about = street ? ` about ${street}` : "";
  const size = beds !== null ? `${beds}-bedroom ` : "";
  const where = city ? ` in ${city}` : "";

  if (key === "address") {
    // Used when the listing hides the street (Furnished Finder), so the home is named by size and city.
    return `${hi}${us}. We have a family interested in your ${size}place${where}. Could you send the street address so we can check the distance for them? `;
  }
  if (key === "rate") {
    const stay = when ? ` for a stay starting ${when}` : "";
    return `${hi}${us}${about}. What is the monthly rate${stay}, and are utilities included? `;
  }
  const start = when ? ` from ${when}` : "";
  return `${hi}${us}${about}. Is it available${start}? We have a family that needs a ${size}home${where}. `;
}
