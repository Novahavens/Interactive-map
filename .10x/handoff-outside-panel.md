# Handoff — pillar D, `outside-panel`

Preview: `/dev/outside-panel` (dev only, 404 in production). Browser test: `BASE=http://localhost:3104 node tests/browser/outside-panel.mjs` (screenshots in `test-results/outside-panel/`, not committed).

## What is exported

### `components/OutsidePanel.tsx` (default)
The panel for a home that is not in our database. Same `aside aria-label="Property details"` frame as `PropertyPanel`. It reads nothing itself: everything comes from the `OutsideHome` you pass.

```ts
{
  home: OutsideHome;
  claim: { id: string; name: string; accountManager: string | null } | null;
  onAdded(home: OutsideHome, res: AddOutsideResponse): void;
  onClose(): void;
  canAdd: boolean;                    // features.addOutside
  score?: React.ReactNode;            // slot: top of "Fit against this claim" (MatchScore)
  fit?: React.ReactNode;              // slot: under the score (fit rows)
  onAskAddress?(): void;              // "Text: Ask for the address"
  submit?: SubmitStatus | null;       // see OutsideFooter
  children?: React.ReactNode;         // slot: sections between "Listing" and "Notes & links" (contacts, FindPhone)
}
```
"Fit against this claim" is drawn only when `score`, `fit` or `home.excludedBy` has something.

### `components/property/OutsideFooter.tsx` (default, + `OutsideFooterProps`)
```ts
{ home; claim; canAdd; onAdded; onAskAddress?; submit?: SubmitStatus | null; user?: string }
```
- Posts `POST /api/claim/{claim.id}/add-outside` with `{ listingId, user }`. `user` is the name remembered on the device (`nh-reporter-name`); with no name the body is `{ listingId }`.
- `data-outside-footer` on the root says the state: `idle`, `adding`, `done`, `on-claim`, `dry`, `blocked`, `error`, `no-claim`.
- `onAdded` is called after 201 and after 200 `alreadyOnClaim`. **It is not called for a dry run** (nothing changed).
- `canAdd={false}` renders nothing, except for a home with `onClaim: true`, which still shows "On this claim".
- Blocked (amber note, button disabled) when `home.addressKnown` is false, or after a 409 `no_address`.
- `submit`: leave it out when the `submit` flag is off (no steps). Pass the home's row, or `null` when there is none; right after an add, `null` shows "To Do".

### `components/property/SubmitStatus.tsx` (default)
```ts
{ status: SubmitStatus | null; loading?: boolean; className?: string }
```
Read-only. `null` renders nothing; `loading` with no status renders one 20 px skeleton bar.

### `components/property/PanelFooter.tsx` (changed)
New optional prop `submit?: SubmitStatus | null`. Attached and non-null: `<SubmitStatus>` under the "On this claim" box. Otherwise unchanged.

### `components/ClaimBrief.tsx` (changed)
New optional prop `submitCounts?: { ready: number; submitted: number; options?: number | null } | null`. Shows `3 ready · 2 submitted` in the "Claim information" row; `options: 0` shows `No options yet`. Without the prop: unchanged.

### `lib/submit-status.ts` (pure, unit-tested)
`SUBMIT_STEPS`, `submitSteps`, `submitAriaLabel`, `submitLine`, `blockedText`, `submitCountsLabel`, `submitDate`, `firstName`, `addedLine`. Pillar F can use `submitCountsLabel` for the count line in the claims drawer.

## Wiring for the coordinator

In `MapApp.tsx`:
1. When the selected id is an outside home (`listingId`), render `<OutsidePanel>` where `<PropertyPanel>` goes (both mounts: rail and sheet). Key it by claim + listing id, as the property panel is.
2. `canAdd={features.addOutside}`.
3. `onAdded`: re-read the claim and `/api/claim/[id]/outside` (`onClaim` flips). `res.propertyId` may be null.
4. `score={<MatchScore … />}` when pillar B's card is ready. Outside homes have `score: null` today.
5. `onAskAddress`: pass it only when there is a number to text. `OutsideHome` has `hasPhone` but **no phone number**, so today there is nothing to open Quo with; leave it out until the home carries a number.
6. Read `/api/claim/[id]/submit-status` once per claim when `features.submit` is on. Then:
   - `PropertyPanel` → `PanelFooter`: `submit={options.find(o => o.propertyId === propertyId) ?? null}` (needs one pass-through prop on `PropertyPanel`).
   - `OutsidePanel`: `submit={features.submit ? (row ?? null) : undefined}`, matched on `home.propertyItemId`.
   - `ClaimBrief`: `submitCounts={features.submit ? { ...counts, options: options.length } : null}`.

## Differs from the spec, on purpose
- The spec's `OutsidePanel` props (`score: MatchScore | null`, `needs`, `attached`, `onAttached`) and its `PanelFooter outside?: {…}` prop are replaced by the brief's: a separate `OutsideFooter`, and `score` as a node.
- The spec's `SubmitState` object is not what the foundation built. The real row is `SubmitStatus` (`state`, `reason` as free text). `blockedText` knows `claim_closed` and `already_submitted` and shows any other reason as `Blocked: <reason>. This home can't be submitted.`
- No "already on another claim" confirm for outside homes: `OutsideHome` has no list of other claims.
- No loading / load error / listing gone states in `OutsidePanel`: it takes the home from the list, there is no fetch.

## Not done / open
- Dry-run copy is mine (the spec has none): `Dry run: nothing was added. Monday and our database were not changed.`
- The "already on the claim" line is mine: `Already an option on this claim · Monday →`.
- `submitCounts.options` is an addition to the brief's shape, needed for `No options yet`.
- `npm run build` passes (dummy env). It once failed on a `next/font` download and passed on retry; not related to this work.
