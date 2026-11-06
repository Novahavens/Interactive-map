// The property as the map will have it once an edit lands, for the answers the edit route gives without a fresh
// mirror row (dry run, or the mirror read failing). Pure, so `npm run test:unit` covers it.
import type { AddressValue, EditChanges } from "./listing-edit";

/** The costs that make up properties.move_in_total (a generated column: rent, deposits and fees, not pet rent). */
export const MOVE_IN_PARTS = [
  "monthly_rate", "security_deposit", "cleaning_fee", "admin_fee", "application_fee", "move_in_fee",
  "pet_deposit", "pet_fee", "other_fee_1", "other_fee_2",
] as const;

/**
 * The detail with the changes laid over it; move_in_total is recomputed the way Postgres does when a cost
 * changed. An address lands on the record's own columns: address, lat, lng, and the parts Google gave.
 */
export function overlayDetail<T extends object>(detail: T, changes: EditChanges): T {
  const { address, ...rest } = changes;
  const out = { ...detail, ...rest } as Record<string, unknown>;
  // (A type-only import keeps this file runnable by the unit tests without a bundler.)
  if (address && typeof address === "object") {
    const a = address as AddressValue;
    out.address = a.address;
    out.lat = a.lat;
    out.lng = a.lng;
    for (const part of ["city", "state", "zipcode"] as const) if (a[part]) out[part] = a[part];
    out.geocode_status = "ok";
    out.location_precision = "exact";
  }
  if (MOVE_IN_PARTS.some((k) => k in changes)) {
    out.move_in_total = MOVE_IN_PARTS.reduce((sum, k) => {
      const v = out[k];
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0;
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }
  return out as T;
}
