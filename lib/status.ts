import type { Pin } from "./types";
import { petsAllowed } from "./utils";

// The rule lives in the database (map_status_reason in supabase/migrations/20261022_map_status.sql);
// this file only names and colours the three results. Anything unrecognised is neutral, never a fourth colour.

export type MapStatus = "green" | "yellow" | "red";

export const STATUS_ORDER: MapStatus[] = ["green", "yellow", "red"];

export function asMapStatus(v: unknown): MapStatus {
  return v === "green" || v === "red" ? v : "yellow";
}

/** Each colour also has its own shape, so the three read apart without relying on red versus green. */
export const STATUS = {
  green: { color: "#17c964", label: "Used before", help: "We have worked with this owner, or they are marked Preferred", shape: "circle" },
  yellow: { color: "#facc15", label: "Neutral", help: "In the database, no history with us", shape: "diamond" },
  red: { color: "#ee0000", label: "Do not use", help: "Do not use", shape: "square" },
} satisfies Record<MapStatus, { color: string; label: string; help: string; shape: "circle" | "diamond" | "square" }>;

/** Why a property has its colour: the reason codes returned by property_map_status(). */
const REASON_TEXT: Record<string, string> = {
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

export interface PinFilters {
  pets: boolean;
  photos: boolean;
  priced: boolean;
  hidden: Record<MapStatus, boolean>;
}

export function passesFilters(p: Pin, f: PinFilters): boolean {
  if (f.pets && petsAllowed(p.pet_status) !== true) return false;
  if (f.photos && !p.has_photos) return false;
  if (f.priced && p.monthly_rate == null) return false;
  return !f.hidden[asMapStatus(p.map_status)];
}
