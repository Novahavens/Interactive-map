// Pure rules for "owners we have used before". No I/O, so `deno test` covers every rule.
//
// A claim counts when a tenant was placed or is being placed. The owner's email and phone on
// that claim become contact keys; a property whose owner email or phone matches a key is green.

export const CLAIM_BOARD = "9030696652";

/** Claim-board groups where a tenant was placed (or a lease is signed). Not New Request, New Option,
 *  Waiting Adjuster approval, Adjuster Approved / Walkthrough, Stuck, Lost or the AI test group. */
export const PLACED_GROUPS: Record<string, string> = {
  group_mkqfnvw3: "Incoming Move In",
  group_mkqf3bj5: "Current Tenant",
  group_mkqfypyq: "45 Days To Vacate",
  group_mkqfpc0y: "30 Days To Vacate",
  group_mm58f6m6: "10 Days To Vacate",
  group_mkqfrcs3: "Moved Out (Need to collect deposit)",
  group_mm1gy0cz: "Damage Deposit Dispute",
  group_mkrhje14: "Moved Out/Deposit Returned",
};

export const OWNER_EMAIL_COL = "email_mkqf2s96";
export const OWNER_PHONE_COL = "phone_mkqf26ar";

export type ContactKey = { key: string; kind: "email" | "phone" };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})/g;

/** Every email and US phone in the two owner cells. A cell can hold two ("a@x.com - b@x.com"). */
export function contactKeys(email: string | null | undefined, phone: string | null | undefined): ContactKey[] {
  const out = new Map<string, ContactKey>();
  for (const m of (email ?? "").matchAll(EMAIL)) {
    const key = m[0].toLowerCase();
    out.set(key, { key, kind: "email" });
  }
  for (const m of (phone ?? "").matchAll(PHONE)) {
    const key = `${m[1]}${m[2]}${m[3]}`;
    out.set(key, { key, kind: "phone" });
  }
  return [...out.values()];
}

export type ClaimOwner = { email?: string | null; phone?: string | null };

/** One row per distinct key, with how many placed claims carry it. A claim counts once per key. */
export function tally(claims: ClaimOwner[]): { key: string; kind: "email" | "phone"; claims: number }[] {
  const counts = new Map<string, { key: string; kind: "email" | "phone"; claims: number }>();
  for (const c of claims) {
    for (const k of contactKeys(c.email, c.phone)) {
      const row = counts.get(k.key);
      if (row) row.claims++;
      else counts.set(k.key, { ...k, claims: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** A Monday outage or a bad column id must never wipe the list. */
export const MIN_KEYS_TO_REPLACE = 50;
