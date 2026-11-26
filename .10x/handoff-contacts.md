# Pillar F — contacts: handoff

Find phone in Contacts, the Text templates menu, and the outreach line. Flags read: `findPhone`, `templates` (the coordinator passes them in; nothing here calls `featuresOn()`).

## Exports

### `components/property/FindPhone.tsx`
```ts
export default function FindPhone(props: {
  propertyId: string;
  name: string | null;        // contact name, for Call / Text of a found number
  address: string | null;
  enabled: boolean;           // features.findPhone; false = renders nothing, no request
  onSave?: (phone: string) => void | Promise<unknown>; // "Save to listing"; left out = no Save button
}): JSX.Element | null
export function FindPhoneView(props: { state: PhoneState; name; address; save?: "idle"|"saving"|"saved"|"failed"; onFind?; onDismiss?; onSave? }) // pure view, used by the preview
```
- On mount: `GET /api/properties/:id/find-phone`. "Find phone" / "Try again": `POST` with `{ by: readReporterName() }`.
- States: loading, idle, searching, found (Call + Text via `ContactActions`, Save to listing, Not right), not found (with date; Try again once per calendar day), off (route answers `state:"off"`: button `aria-disabled` + "Not set up yet."), error, 429.
- Nothing is written by FindPhone. `onSave` gets the E.164 number; the button shows "Saving…" until its promise settles, "Couldn't save the number. Try again." on reject.

### `components/property/TextTemplates.tsx`
```ts
export default function TextTemplates(props: { number: string /* E.164 */; shown: string; name: string | null; address: string | null; from: string; context?: TemplateContext; className: string; onOpen(number: string, shown: string): void })
```
Used only inside `ContactActions`; the coordinator does not render it directly. Trigger keeps `data-quo="text"` and the same `aria-label`; each entry opens `quoMessageUrl(number, text)` and runs ContactActions' own Text handler (copy number, "Quo didn't open" hints).

### `components/property/ContactActions.tsx` (modified, backwards compatible)
New optional props `templates?: boolean` (default false) and `templateContext?: TemplateContext`. Without them the output is byte-for-byte today's (checked in `tests/browser/contacts.mjs`). Now also exports `btn`, `touch`, `pretty`.

### `components/property/OutreachLine.tsx`
```ts
export default function OutreachLine(props: { propertyId?: string; enabled: boolean; outreach?: OutreachStatus | null })
```
`enabled=false` renders nothing and fetches nothing. With `outreach` given (outside homes) no request; otherwise `GET /api/properties/:id/outreach`. No line when nothing was sent or the route says off.

### `lib/phone-lookup-ui.ts` (pure, tested in `tests/unit/phone-lookup-ui.test.mts`)
`PHONE_COPY`, `confidenceWords`, `sourceWords`, `foundLine`, `checkedLine`, `canRetry`, `dayLabel`, `sameDay`, `PhoneState`, `phoneReducer`, `stateOf`, `TemplateContext { beds?, city?, moveIn?, rent? }`, `TEMPLATE_MENU`, `menuText(key, opts)`, `outreachLine(outreach)`.
`menuText` wraps `templateText` (not modified): only "Confirm the rate" differs, naming the rent when `rent` is known.

## Wiring for the coordinator (`PropertyPanel.tsx`, Contacts section)
1. Where `owner_phone` (or `landlord_phone`) is empty, render
   `<FindPhone propertyId={detail.monday_item_id} name={detail.owner_name} address={detail.address} enabled={features.findPhone} onSave={(phone) => saveOwnerPhone(phone)} />`.
   `saveOwnerPhone` should save through the edit route and show the existing saved banner; throw on failure so the button reports it. **Open:** the edit route / `lib/edit-config.ts` has no phone field today, so it needs an `owner_phone` (and `landlord_phone`) field before Save can work. Until then leave `onSave` out: Find phone still shows Call / Text / Not right.
2. On every `<ContactActions>` add `templates={features.templates}` and `templateContext={{ beds: claim?.needs.bedrooms, city: detail.city, moveIn: claim?.needs.moveIn, rent: detail.monthly_rate }}`.
3. Under the owner's ContactActions: `<OutreachLine propertyId={detail.monday_item_id} enabled={features.templates} />` (for an outside home pass `outreach={…}` instead).
4. Pillar for §3.4 "Text: Ask for the address": use `quoMessageUrl(number, menuText("address", opts))` for the same text as the menu.

## Differences from the spec / open issues
- Props differ from the spec table (`onSaved` → `onSave`, TextTemplates takes number/name/context instead of `templates[]`/`outreach`/`onPick`): the outreach line is its own component and the menu reuses ContactActions' handler.
- Template bodies come from the shared `lib/text-templates.ts` (foundation), not the spec's literal sample bodies (which hard-code "Dec 8", "$3,350", "6 months"). If the spec wording is wanted, change `templateText` once for every pillar.
- `PhoneLookup` in `lib/types.ts` is `{ state, phone, source, confidence, lookedUpAt }`, not the spec's union; code follows `lib/types.ts`.
- Extra state beyond the spec: 429 "Too many lookups right now. Nothing was saved. Try again in a few minutes."; "You can try again tomorrow." when the last miss was today.
- `tests/browser/contact-actions.mjs` reads real `/api/properties*`; it was run through a fictional stand-in for those two routes. Its only failure with a dummy Maps key is Google's `InvalidKeyMapError` page errors; with Maps stubbed it passes fully.
