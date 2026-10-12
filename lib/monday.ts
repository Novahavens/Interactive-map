import "server-only";
import type { AttachedOption, ClaimNeeds } from "./types";

// Board wiring — PRD v4 §8.3. Env overrides exist only so a board move is a config change, not a code change.
export const BOARDS = {
  property: process.env.MONDAY_PROPERTY_BOARD_ID ?? "18415735059",
  claim: process.env.MONDAY_CLAIM_BOARD_ID ?? "9030696652",
  claimSubitems: process.env.MONDAY_CLAIM_SUBITEM_BOARD_ID ?? "9205253360",
};

export const COLS = {
  lossAddress: "location_mkqdyjmk",
  beds: "numeric_mm0b1j6h",
  baths: "numberx0svvlle",
  pets: "numeric_mm1gyzhf",
  frv: "numeric_mkqdrcm9",
  moveIn: "date_mkqaaq16",
  adults: "numeric_mkqd84rr",
  children: "numeric_mkqd8f42",
  // subitem board
  propertyRelation: "board_relation_mm441",
  subitemStatus: "status",
  distanceToLoss: "numeric_mm7np0z7", // Distance to Loss (mi), E-rental-history / comment thread bdafebbd
};

export const SUBITEM_START_STATUS = "Ready to Submit"; // William, 26 Aug

const MONDAY_API = "https://api.monday.com/v2";

/** Local safety: with MONDAY_DRY_RUN=1, reads still hit Monday but no mutation is ever sent. */
export const DRY_RUN = process.env.MONDAY_DRY_RUN === "1";
const API_VERSION = "2024-10";

export class MondayError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "MondayError";
  }
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; [k: string]: unknown }>;
  error_message?: string;
  error_code?: string;
}

/**
 * Single GraphQL call. Monday returns HTTP 200 with an `errors` array on
 * failure; we treat that as a failure, never as success.
 */
/**
 * Read-only queries retry once on a transient failure (429 / 5xx / network).
 * Mutations never retry here: a duplicate sub-item is worse than a visible
 * error, and the caller's idempotency check covers the safe retry path (E6-T3).
 */
export async function monday<T>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: { retry?: boolean } = {},
): Promise<T> {
  if (DRY_RUN && /^\s*mutation\b/.test(query)) {
    // Backstop for any mutation that skips its own dry-run branch: refuse rather than write.
    console.info("[monday dry-run] blocked", query, variables);
    throw new MondayError("Dry run: mutation not sent to Monday");
  }
  const retry = opts.retry ?? /^\s*query\b/.test(query);
  try {
    return await mondayOnce<T>(query, variables);
  } catch (e) {
    const transient =
      e instanceof MondayError && (/\b(429|50\d)\b/.test(e.message) || /rate limit|complexity|timeout|non-JSON/i.test(e.message));
    if (!retry || !transient) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    return await mondayOnce<T>(query, variables);
  }
}

async function mondayOnce<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new MondayError("MONDAY_API_TOKEN is not set");

  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  let json: GqlResponse<T>;
  try {
    json = (await res.json()) as GqlResponse<T>;
  } catch {
    throw new MondayError(`Monday returned non-JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new MondayError(json.error_message ?? `Monday HTTP ${res.status}`, json);
  }
  if (json.errors?.length) {
    throw new MondayError(json.errors.map((e) => e.message).join("; "), json.errors);
  }
  if (json.error_message) {
    throw new MondayError(json.error_message, json);
  }
  if (!json.data) throw new MondayError("Monday returned no data", json);
  return json.data;
}

// ---------- Claim read ----------

interface ClaimItemRaw {
  id: string;
  name: string;
  column_values: Array<{
    id: string;
    text: string | null;
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
  }>;
  subitems: Array<{
    id: string;
    name: string;
    column_values: Array<{ id: string; text: string | null; linked_item_ids?: string[] }>;
  }> | null;
}

export interface ClaimRaw {
  id: string;
  name: string;
  loss: { lat: number; lng: number; address: string } | null;
  needs: ClaimNeeds;
  attached: AttachedOption[];
}

function num(text: string | null | undefined): number | null {
  if (text == null || text.trim() === "") return null;
  const n = Number(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function readClaim(claimId: string): Promise<ClaimRaw | null> {
  const query = `
    query ($ids: [ID!]) {
      items(ids: $ids) {
        id
        name
        column_values(ids: ${JSON.stringify([
          COLS.lossAddress,
          COLS.beds,
          COLS.baths,
          COLS.pets,
          COLS.frv,
          COLS.moveIn,
          COLS.adults,
          COLS.children,
        ])}) {
          id
          text
          ... on LocationValue { lat lng address }
        }
        subitems {
          id
          name
          column_values(ids: ${JSON.stringify([COLS.propertyRelation, COLS.subitemStatus])}) {
            id
            text
            ... on BoardRelationValue { linked_item_ids }
          }
        }
      }
    }`;
  const data = await monday<{ items: ClaimItemRaw[] }>(query, { ids: [claimId] });
  const item = data.items?.[0];
  if (!item) return null;

  const col = (id: string) => item.column_values.find((c) => c.id === id);
  const loc = col(COLS.lossAddress);
  const loss =
    loc && typeof loc.lat === "number" && typeof loc.lng === "number"
      ? { lat: loc.lat, lng: loc.lng, address: loc.address ?? loc.text ?? "" }
      : null;

  const moveInText = col(COLS.moveIn)?.text ?? null;
  const needs: ClaimNeeds = {
    bedrooms: num(col(COLS.beds)?.text),
    bathrooms: num(col(COLS.baths)?.text),
    pets: num(col(COLS.pets)?.text),
    frv: num(col(COLS.frv)?.text),
    moveIn: moveInText ? moveInText.slice(0, 10) : null,
    adults: num(col(COLS.adults)?.text),
    children: num(col(COLS.children)?.text),
  };

  const attached: AttachedOption[] = (item.subitems ?? []).map((s) => {
    const rel = s.column_values.find((c) => c.id === COLS.propertyRelation);
    const status = s.column_values.find((c) => c.id === COLS.subitemStatus);
    return {
      subitemId: s.id,
      subitemName: s.name,
      status: status?.text ?? null,
      propertyId: rel?.linked_item_ids?.[0] ?? null,
    };
  });

  return { id: item.id, name: item.name, loss, needs, attached };
}

// ---------- Add to claim ----------

export async function createSubitem(
  claimId: string,
  name: string,
  propertyId: string,
  distanceMiles?: number | null,
): Promise<string> {
  const cols: Record<string, unknown> = {
    [COLS.propertyRelation]: { item_ids: [Number(propertyId)] },
    [COLS.subitemStatus]: { label: SUBITEM_START_STATUS },
  };
  // Distance is best-effort: a claim with no loss address, or a property with
  // no geocode, just leaves the column blank rather than failing the attach.
  if (distanceMiles != null && Number.isFinite(distanceMiles)) {
    cols[COLS.distanceToLoss] = String(distanceMiles);
  }
  const columnValues = JSON.stringify(cols);
  if (DRY_RUN) {
    console.info("[monday dry-run] create_subitem", { parent: claimId, name, cols });
    return `dry_${Date.now()}`;
  }
  const mutation = `
    mutation ($parent: ID!, $name: String!, $cols: JSON!) {
      create_subitem(parent_item_id: $parent, item_name: $name, column_values: $cols) {
        id
        column_values(ids: ${JSON.stringify([COLS.propertyRelation])}) {
          id
          ... on BoardRelationValue { linked_item_ids }
        }
      }
    }`;
  const data = await monday<{
    create_subitem: { id: string; column_values: Array<{ id: string; linked_item_ids?: string[] }> } | null;
  }>(mutation, { parent: claimId, name, cols: columnValues });

  const created = data.create_subitem;
  if (!created?.id) throw new MondayError("create_subitem returned no id");

  // Verify the relation actually landed. If not, roll back so the claim never carries a blank option row.
  const rel = created.column_values.find((c) => c.id === COLS.propertyRelation);
  const linked = rel?.linked_item_ids ?? [];
  if (!linked.map(String).includes(String(propertyId))) {
    await deleteItem(created.id).catch(() => undefined);
    throw new MondayError("Sub-item was created but the property link did not save; rolled back");
  }
  return created.id;
}

export async function deleteItem(itemId: string): Promise<void> {
  await monday(`mutation ($id: ID!) { delete_item(item_id: $id) { id } }`, { id: itemId });
}
