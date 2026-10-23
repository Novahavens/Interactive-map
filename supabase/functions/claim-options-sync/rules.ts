// Pure rules for "active options": claim sub-items that still point a property at a live claim.
// No I/O, so `deno test` covers every rule.
//
// An option is active when its claim is still being worked or lived in (not Stuck, Lost, Moved Out,
// Deposit or the AI test group) AND its own status says the property is still in play (not declined,
// not available-to-nobody, not fell through). The map shows these as "On claim X" on the property.

export const CLAIM_BOARD = "9030696652";
export const SUBITEM_STATUS_COL = "status";
/** Sub-item column that links the option to its PROPERTY DATABASE item. */
export const SUBITEM_PROPERTY_COL = "board_relation_mm441";

/** Claim-board groups whose claims count. "topics" is New Housing Request. */
export const ACTIVE_GROUPS: Record<string, string> = {
  topics: "New Housing Request",
  group_mkvngrgz: "New Option Needed",
  group_mkvnnd97: "Waiting Adjuster approval",
  group_mkqfrrf2: "Adjuster Approved / Walkthrough",
  group_mkqfnvw3: "Incoming Move In",
  group_mkqf3bj5: "Current Tenant",
  group_mkqfypyq: "45 Days To Vacate",
  group_mkqfpc0y: "30 Days To Vacate",
  group_mm58f6m6: "10 Days To Vacate",
};

/** Sub-item statuses where the property is still an option on the claim. */
export const ACTIVE_STATUSES: readonly string[] = [
  "To Do",
  "Ready to Submit",
  "Potential option",
  "Pending details - poss option",
  "Option Submitted",
  "Awaiting Response",
  "Available",
  "See Note",
  "FF Calendar",
  "Selected - WON",
  "Lease signing",
];

const norm = (s: string) => s.trim().toLowerCase();
const STATUS_SET = new Set(ACTIVE_STATUSES.map(norm));

export const isActiveGroup = (groupId: string | null | undefined): boolean => !!groupId && groupId in ACTIVE_GROUPS;
export const isActiveStatus = (status: string | null | undefined): boolean => !!status && STATUS_SET.has(norm(status));

export type RawSubitem = {
  id: string;
  name?: string | null;
  column_values: { id: string; text: string | null; linked_item_ids?: string[] | null }[];
};
export type RawClaim = { id: string; name: string; group?: { id: string } | null; subitems?: RawSubitem[] | null };

export type OptionRow = {
  subitem_id: string;
  property_item_id: string;
  claim_item_id: string;
  claim_name: string;
  status: string | null;
  claim_group: string;
};

/** One row per active sub-item that links a property. A sub-item that links several keeps the first. */
export function toOptions(claims: RawClaim[]): OptionRow[] {
  const out = new Map<string, OptionRow>();
  for (const claim of claims) {
    const group = claim.group?.id;
    if (!group || !isActiveGroup(group)) continue;
    for (const sub of claim.subitems ?? []) {
      const col = (id: string) => sub.column_values.find((c) => c.id === id);
      const status = col(SUBITEM_STATUS_COL)?.text?.trim() || null;
      if (!isActiveStatus(status)) continue;
      const property = col(SUBITEM_PROPERTY_COL)?.linked_item_ids?.map(String).find((id) => /^\d+$/.test(id));
      if (!property) continue;
      out.set(sub.id, {
        subitem_id: sub.id, property_item_id: property, claim_item_id: claim.id,
        claim_name: claim.name, status, claim_group: ACTIVE_GROUPS[group],
      });
    }
  }
  return [...out.values()];
}

/** A Monday outage, a renamed group or a bad token must never wipe the mirror. Zero claims is never
 *  a real answer (the board always has claims in these groups). */
export function replaceGuard(claims: number): { replace: true } | { replace: false; reason: string } {
  return claims > 0 ? { replace: true } : { replace: false, reason: "Monday returned 0 claims; keeping the existing rows" };
}
