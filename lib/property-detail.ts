import "server-only";
import { first, rpcAll } from "./supabase";
import { asMapStatus } from "./status";
import type { ClaimOption, PropertyDetail } from "./types";

/**
 * The full record the panel shows: the property_detail row (minus the PostGIS geometry and the raw Monday
 * jsonb) plus its dot colour and reason and the active options on any claim. Shared by GET /api/properties/:id
 * and the edit route so both answer with the same shape. null when there is no such property; throws the
 * first Supabase error.
 */
export async function loadPropertyDetail(id: string): Promise<PropertyDetail | null> {
  const [found, status, claims] = await rpcAll([
    ["property_detail", { p_monday_item_id: id }],
    ["property_map_status", { p_monday_item_id: id }],
    ["property_claim_options", { p_monday_item_id: id }],
  ]);
  const st = first<{ status?: string; reason?: string }>(status);
  const row = first<Record<string, unknown>>(found);
  if (!row) return null;
  const { geom: _geom, fields: _fields, ...rest } = row;
  const detail = { ...rest, map_status: asMapStatus(st?.status), map_reason: st?.reason ?? "none", other_claims: Array.isArray(claims) ? (claims as ClaimOption[]) : [] };
  return detail as unknown as PropertyDetail;
}
