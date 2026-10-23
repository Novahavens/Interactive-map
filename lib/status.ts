import type { ClaimOption } from "./types";
import { dayMonth } from "./utils";

// The map's dot colour. The rule itself lives in the database (map_status_reason in
// supabase/migrations/20261022_map_status.sql) so one place decides; this file is only how the
// app names, colours and explains the three results.
//
// Every property is exactly one of these. Anything missing or unrecognised is neutral (yellow),
// never blank, grey or a fourth colour.

export type MapStatus = "green" | "yellow" | "red";

export const STATUS_ORDER: MapStatus[] = ["green", "yellow", "red"];

/** Anything that is not exactly "green" or "red" is neutral. */
export function asMapStatus(v: unknown): MapStatus {
  return v === "green" || v === "red" ? v : "yellow";
}

export const STATUS_COLOR: Record<MapStatus, string> = {
  green: "#17c964",
  yellow: "#facc15",
  red: "#ee0000",
};

export const STATUS_LABEL: Record<MapStatus, string> = {
  green: "Used before",
  yellow: "Neutral",
  red: "Do not use",
};

export const STATUS_HELP: Record<MapStatus, string> = {
  green: "We have worked with this owner, or they are marked Preferred",
  yellow: "In the database, no history with us",
  red: "Do not use",
};

/** Why a property has its colour: the reason codes returned by property_map_status(). */
export const REASON_TEXT: Record<string, string> = {
  dnu_group: "In the DO NOT USE group",
  dnu_owner: "The owner is marked DO NOT USE",
  preferred_group: "In the Preferred group",
  owner_preferred: "The owner is marked Preferred",
  owner_approved: "The owner is marked Approved",
  rented_before: "We have placed a family here before",
  used_before: "We have placed a tenant with this owner before",
  none: "No history with us yet",
};

export function reasonText(reason: string | null | undefined): string {
  return REASON_TEXT[reason ?? "none"] ?? REASON_TEXT.none;
}

/** Each colour also has its own shape, so the three read apart without relying on red versus green. */
export const STATUS_SHAPE: Record<MapStatus, "circle" | "diamond" | "square"> = {
  green: "circle",
  yellow: "diamond",
  red: "square",
};

// ---------- list and panel chips (availability, other claims, link, last contact) ----------

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

const AVAILABILITY_CHIP: Record<string, Omit<Chip, "key">> = {
  "available now": { label: "Available now", tone: "ok" },
  "available soon": { label: "Available soon", tone: "info" },
  "available (unverified)": { label: "Unverified", tone: "muted", title: "Listed as available, not confirmed by the availability check" },
  unavailable: { label: "Unavailable", tone: "bad" },
  "listing removed": { label: "Listing removed", tone: "muted", strike: true },
};

/** "Check Failed", blank and anything unrecognised give no chip: the monitor said nothing useful. */
export function availabilityChip(availability: string | null | undefined): Chip | null {
  const c = AVAILABILITY_CHIP[(availability ?? "").trim().toLowerCase()];
  return c ? { key: "availability", ...c } : null;
}

export function isBadLink(linkStatus: string | null | undefined): boolean {
  return (linkStatus ?? "").trim().toUpperCase() === "BAD LINK";
}

/** The claims that already hold this property, without the one being worked. */
export function otherClaimsOf(claims: ClaimOption[] | null | undefined, currentClaimId: string | null): ClaimOption[] {
  return (claims ?? []).filter((c) => c.claimId !== currentClaimId);
}

export function otherClaimsChip(others: ClaimOption[]): Chip | null {
  if (others.length === 0) return null;
  const title = others.map((c) => `${c.claimName}${c.status ? ` · ${c.status}` : ""}`).join("\n");
  const [first] = others;
  return {
    key: "other-claims",
    label: others.length === 1 ? `On claim ${first.claimName}${first.status ? ` · ${first.status}` : ""}` : `On ${others.length} claims`,
    tone: "amber",
    title,
  };
}

interface ChipSource {
  availability?: string | null;
  link_status?: string | null;
  last_contact?: string | null;
  other_claims?: ClaimOption[] | null;
}

/** The compact chip line shared by list rows and the panel header. Order: availability, claims, link, contact. */
export function propertyChips(src: ChipSource, currentClaimId: string | null): Chip[] {
  const chips: Chip[] = [];
  const avail = availabilityChip(src.availability);
  if (avail) chips.push(avail);
  const claims = otherClaimsChip(otherClaimsOf(src.other_claims, currentClaimId));
  if (claims) chips.push(claims);
  if (isBadLink(src.link_status)) chips.push({ key: "bad-link", label: "Bad link", tone: "bad", outline: true, title: "Reported as a broken listing link" });
  if (src.last_contact) chips.push({ key: "last-contact", label: `Last contact ${dayMonth(src.last_contact)}`, tone: "muted" });
  return chips;
}
