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
