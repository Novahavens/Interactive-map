import "server-only";
import type { ActiveClaim, AttachedOption, ClaimBrief, ClaimNeeds } from "./types";

// Board wiring — PRD v4 §8.3. Env overrides exist only so a board move is a config change, not a code change.
export const BOARDS = {
  property: process.env.MONDAY_PROPERTY_BOARD_ID ?? "18415735059",
  claim: process.env.MONDAY_CLAIM_BOARD_ID ?? "9030696652",
  claimSubitems: process.env.MONDAY_CLAIM_SUBITEM_BOARD_ID ?? "9205253360",
};

export const COLS = {
  lossAddress: "location_mkqdyjmk",
  beds: "numberx0svvlle", // "# Bedrooms" (values 2-4; numeric_mm0b1j6h is "# Bathrooms")
  baths: "numeric_mm0b1j6h", // "# Bathrooms"
  pets: "numeric_mm1gyzhf",
  frv: "numeric_mkqdrcm9",
  moveIn: "date_mkqaaq16",
  adults: "numeric_mkqd84rr",
  children: "numeric_mkqd8f42",
  claimStatus: "color_mkrvebt", // "Current Status"
  received: "date_mkwek71p", // "Date Received"
  leaseMonths: "numeric_mkr92jxa", // "Initial Lease Term (Months)"
  petDescription: "text_mkqat460",
  utilityCap: "numeric_mm5zre3s",
  specialRequests: "long_text_mkqdw8at", // "Notes & Special Requests"
  accountManager: "multiple_person_mkrta1fv",
  searcher: "multiple_person_mm48cyzp",
  coordinator: "multiple_person_mm5449zf",
  company: "color_mkqaatwj", // "ZZ.Company" (ALE Solutions, Alacrity, CRS ...)
  specialist: "board_relation_mks1djce", // "Relocation Specialist" (contacts board, external people)
  specialistEmail: "lookup_mm47e8rz", // mirror of the specialist's email; may hold several, e.g. "a@x.com - b@x.com"
  // subitem board
  propertyRelation: "board_relation_mm441",
  subitemStatus: "status",
  distanceToLoss: "numeric_mm7np0z7", // Distance to Loss (mi), E-rental-history / comment thread bdafebbd
};

export const SUBITEM_START_STATUS = "To Do"; // Gaby, 15 Oct / Lou, 20 Oct: a new option is not yet vetted, so never "Ready to Submit"

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
  group?: { title: string } | null;
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
  brief: ClaimBrief;
}

function num(text: string | null | undefined): number | null {
  if (text == null || text.trim() === "") return null;
  const n = Number(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const NEEDS_COLS = [COLS.beds, COLS.baths, COLS.pets, COLS.frv, COLS.moveIn, COLS.adults, COLS.children];
const BRIEF_COLS = [
  COLS.claimStatus, COLS.received, COLS.leaseMonths, COLS.petDescription, COLS.utilityCap,
  COLS.specialRequests, COLS.accountManager, COLS.searcher, COLS.coordinator, COLS.company,
];

function needsFrom(col: (id: string) => { text: string | null } | undefined): ClaimNeeds {
  const moveInText = col(COLS.moveIn)?.text ?? null;
  return {
    bedrooms: num(col(COLS.beds)?.text),
    bathrooms: num(col(COLS.baths)?.text),
    pets: num(col(COLS.pets)?.text),
    frv: num(col(COLS.frv)?.text),
    moveIn: moveInText ? moveInText.slice(0, 10) : null,
    adults: num(col(COLS.adults)?.text),
    children: num(col(COLS.children)?.text),
  };
}

export async function readClaim(claimId: string): Promise<ClaimRaw | null> {
  const query = `
    query ($ids: [ID!]) {
      items(ids: $ids) {
        id
        name
        group { title }
        column_values(ids: ${JSON.stringify([COLS.lossAddress, ...NEEDS_COLS, ...BRIEF_COLS])}) {
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

  const needs = needsFrom(col);

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

  const text = (id: string) => {
    const t = col(id)?.text?.trim();
    return t ? t : null;
  };
  const brief: ClaimBrief = {
    status: text(COLS.claimStatus),
    group: item.group?.title ?? null,
    receivedOn: text(COLS.received)?.slice(0, 10) ?? null,
    moveIn: needs.moveIn,
    leaseMonths: num(col(COLS.leaseMonths)?.text),
    frv: needs.frv,
    adults: needs.adults,
    children: needs.children,
    bedrooms: needs.bedrooms,
    bathrooms: needs.bathrooms,
    pets: needs.pets,
    petDescription: text(COLS.petDescription),
    utilityCap: num(col(COLS.utilityCap)?.text),
    specialRequests: text(COLS.specialRequests),
    accountManager: text(COLS.accountManager),
    searcher: text(COLS.searcher),
    coordinator: text(COLS.coordinator),
    company: text(COLS.company),
  };

  return { id: item.id, name: item.name, loss, needs, attached, brief };
}

// ---------- Active claims (drawer) ----------

// "Active" = the groups where a claim is waiting on housing options. Confirmed against the board on 12 Oct:
// New Housing Request (topics) and New Option Needed. The board has no "Awaiting Options" status label.
const ACTIVE_GROUPS = (process.env.MONDAY_ACTIVE_CLAIM_GROUPS ?? "topics,group_mkvngrgz")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TEST_GROUP = process.env.MONDAY_TEST_CLAIM_GROUP ?? "group_mm1jnpwf"; // "Claims AI @ Novahavens.com ONLY FOR TESTING"

interface ActiveItemRaw {
  id: string;
  name: string;
  created_at: string;
  group: { id: string; title: string };
  column_values: ClaimItemRaw["column_values"];
  subitems: Array<{ id: string }> | null;
}

const ACTIVE_ITEM_FIELDS = `
  id
  name
  created_at
  group { id title }
  column_values(ids: ${JSON.stringify([COLS.lossAddress, COLS.claimStatus, ...NEEDS_COLS])}) {
    id
    text
    ... on LocationValue { lat lng address }
  }
  subitems { id }`;

export async function listActiveClaims(includeTest: boolean): Promise<ActiveClaim[]> {
  const groups = includeTest ? [...ACTIVE_GROUPS, TEST_GROUP] : ACTIVE_GROUPS;
  const first = await monday<{
    boards: Array<{ groups: Array<{ items_page: { cursor: string | null; items: ActiveItemRaw[] } }> }>;
  }>(
    `query ($board: [ID!], $groups: [String]) {
      boards(ids: $board) {
        groups(ids: $groups) {
          items_page(limit: 100) { cursor items { ${ACTIVE_ITEM_FIELDS} } }
        }
      }
    }`,
    { board: [BOARDS.claim], groups },
  );

  const raw: ActiveItemRaw[] = [];
  for (const g of first.boards?.[0]?.groups ?? []) {
    raw.push(...g.items_page.items);
    let cursor = g.items_page.cursor;
    while (cursor) {
      const next = await monday<{ next_items_page: { cursor: string | null; items: ActiveItemRaw[] } }>(
        `query ($cursor: String!) { next_items_page(limit: 100, cursor: $cursor) { cursor items { ${ACTIVE_ITEM_FIELDS} } } }`,
        { cursor },
      );
      raw.push(...next.next_items_page.items);
      cursor = next.next_items_page.cursor;
    }
  }

  return raw
    .map((item) => {
      const col = (id: string) => item.column_values.find((c) => c.id === id);
      const loc = col(COLS.lossAddress);
      return {
        id: item.id,
        name: item.name,
        lossAddress: loc?.address ?? loc?.text ?? null,
        lat: typeof loc?.lat === "number" ? loc.lat : null,
        lng: typeof loc?.lng === "number" ? loc.lng : null,
        needs: needsFrom(col),
        createdAt: item.created_at,
        status: col(COLS.claimStatus)?.text ?? null,
        attachedCount: item.subitems?.length ?? 0,
        group: item.group.title,
        isTest: item.group.id === TEST_GROUP,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------- Relocation specialist + summary log (F4) ----------

/** The claim's relocation specialist. External people, so they're contacted by email, not @mention. */
export async function readSpecialist(claimId: string): Promise<{ name: string | null; emailText: string | null }> {
  const data = await monday<{
    items: Array<{ column_values: Array<{ id: string; display_value?: string | null }> }>;
  }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        column_values(ids: ${JSON.stringify([COLS.specialist, COLS.specialistEmail])}) {
          id
          ... on BoardRelationValue { display_value }
          ... on MirrorValue { display_value }
        }
      }
    }`,
    { ids: [claimId] },
  );
  const cols = data.items?.[0]?.column_values ?? [];
  const val = (id: string) => cols.find((c) => c.id === id)?.display_value?.trim() || null;
  return { name: val(COLS.specialist), emailText: val(COLS.specialistEmail) };
}

/** Posts an update on the claim item (the record that a summary went out). */
export async function createUpdate(itemId: string, body: string): Promise<string> {
  if (DRY_RUN) {
    console.info("[monday dry-run] create_update", { itemId, body });
    return `dry_${Date.now()}`;
  }
  const data = await monday<{ create_update: { id: string } | null }>(
    `mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }`,
    { item: itemId, body },
  );
  if (!data.create_update?.id) throw new MondayError("create_update returned no id");
  return data.create_update.id;
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
