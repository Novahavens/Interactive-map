import type { ClaimOption, Pin, PropertyDetail } from "./types";
import { BAD_LINK } from "./types";
import { dayMonth } from "./utils";

export type ChipTone = "ok" | "info" | "muted" | "bad" | "amber";

export interface Chip {
  key: string;
  label: string;
  tone: ChipTone;
  /** Red outline instead of plain red text (Bad link). */
  outline?: boolean;
  strike?: boolean;
  title?: string;
}

export interface ChipSource {
  availability?: string | null;
  link_status?: string | null;
  last_contact?: string | null;
  other_claims?: ClaimOption[] | null;
}

const AVAILABILITY_CHIP: Record<string, Omit<Chip, "key">> = {
  "available now": { label: "Available now", tone: "ok" },
  "available soon": { label: "Available soon", tone: "info" },
  "available (unverified)": { label: "Unverified", tone: "muted", title: "Listed as available, not confirmed by the availability check" },
  unavailable: { label: "Unavailable", tone: "bad" },
  "listing removed": { label: "Listing removed", tone: "muted", strike: true },
};

function isBadLink(linkStatus: string | null | undefined): boolean {
  return (linkStatus ?? "").trim().toUpperCase() === BAD_LINK;
}

/** The detail is the fresher copy and the list's pin covers its gaps, but a BAD LINK in either wins so a stale mirror cannot undo a report. */
export function mergeChipSource(detail: PropertyDetail | null, pin: Pin | null): ChipSource {
  return {
    availability: detail?.availability ?? pin?.availability,
    link_status: [detail?.link_status, pin?.link_status].find(isBadLink) ?? detail?.link_status ?? pin?.link_status,
    last_contact: detail?.last_contact ?? pin?.last_contact,
    other_claims: detail?.other_claims ?? pin?.other_claims,
  };
}

/**
 * The compact chip line shared by list rows and the panel header, in the order availability, claims, link,
 * contact. "Check Failed", blank and unrecognised availability give no chip: the monitor said nothing useful.
 * `otherClaims` is the claims holding the property without the one being worked. The panel header passes
 * `{ availability: false }`: it shows availability as its own pill (components/property/AvailabilityPill.tsx).
 */
export function chipsFor(
  src: ChipSource,
  claimId: string | null,
  opts: { availability?: boolean } = {},
): { chips: Chip[]; otherClaims: ClaimOption[]; badLink: boolean } {
  const chips: Chip[] = [];
  const avail = opts.availability === false ? undefined : AVAILABILITY_CHIP[(src.availability ?? "").trim().toLowerCase()];
  if (avail) chips.push({ key: "availability", ...avail });

  const otherClaims = (src.other_claims ?? []).filter((c) => c.claimId !== claimId);
  if (otherClaims.length > 0) {
    const [first] = otherClaims;
    const status = (c: ClaimOption) => (c.status ? ` · ${c.status}` : "");
    chips.push({
      key: "other-claims",
      label: otherClaims.length === 1 ? `On claim ${first.claimName}${status(first)}` : `On ${otherClaims.length} claims`,
      tone: "amber",
      title: otherClaims.map((c) => `${c.claimName}${status(c)}`).join("\n"),
    });
  }

  const badLink = isBadLink(src.link_status);
  if (badLink) chips.push({ key: "bad-link", label: "Bad link", tone: "bad", outline: true, title: "Reported as a broken listing link" });
  if (src.last_contact) chips.push({ key: "last-contact", label: `Last contact ${dayMonth(src.last_contact)}`, tone: "muted" });
  return { chips, otherClaims, badLink };
}
