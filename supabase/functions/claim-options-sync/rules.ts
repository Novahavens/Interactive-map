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

/** Below this share of the last successful run's claims, a read is treated as partial (a failed page, a token that lost access). */
export const MIN_SHARE_OF_LAST = 0.5;

/** A Monday outage, a renamed group, a bad token or a half-read board must never wipe the mirror.
 *  Refuses when: no claims came back; fewer than half of the last good run's claims came back; or the
 *  response lacks any of the nine active groups (a group that exists but is empty is still returned). */
export function replaceGuard(
  claims: number,
  lastClaims: number | null,
  groupIds: readonly string[],
): { replace: true } | { replace: false; reason: string } {
  if (claims <= 0) return { replace: false, reason: "Monday returned 0 claims; keeping the existing rows" };
  const missing = Object.keys(ACTIVE_GROUPS).filter((g) => !groupIds.includes(g));
  if (missing.length) return { replace: false, reason: `Monday response lacks group(s) ${missing.join(", ")}; keeping the existing rows` };
  if (lastClaims && claims < lastClaims * MIN_SHARE_OF_LAST) {
    return { replace: false, reason: `Monday returned ${claims} claims, under half of the last run's ${lastClaims}; keeping the existing rows` };
  }
  return { replace: true };
}

export const THROTTLE_MS = 20_000;
/** A run that started but never finished and is younger than this still counts as in flight. */
export const IN_FLIGHT_MS = 90_000;

/** Webhook runs are only a hint: skip when the newest run started within 20 s, or is still running. */
export function shouldThrottle(last: { started_at: string | null; finished_at: string | null; error: string | null } | null, now: number): boolean {
  if (!last?.started_at) return false;
  const age = now - new Date(last.started_at).getTime();
  if (age < THROTTLE_MS) return true;
  return last.finished_at === null && last.error === null && age < IN_FLIGHT_MS;
}
