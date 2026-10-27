# Listing edits and the availability pill — technical reference

How a teammate changes a property's details from the map, how that reaches Monday and Supabase, and how availability is shown at the top of the property panel. For the user-facing description see the README (*Using the map → Tap a property*).

Last updated: 28 Oct 2026 · Owner: Fazal Abed (fazal@novahavens.com)

## 1. In one paragraph

The property panel has an **Edit** button. It opens a form with 18 listing fields. **Save** sends only the fields that changed to `POST /api/properties/[id]/edit`. The server checks every value, applies rate limits, re-reads those columns from Monday and stops with a conflict if someone changed them there since the form opened. It then writes Monday in one mutation, copies the same values into the Supabase mirror so the map shows them at once, and posts a note on the Monday item saying who changed what. Monday's own webhook re-reads the item a second later and confirms the mirror. At the top of the panel, availability now sits in a raised pill with a soft glow, instead of a chip among the others.

## 2. What can and can't be edited

| Group | Fields | Monday column |
|---|---|---|
| Availability | Next availability (date) | `date_mm4416ne` |
| Basics | Bedrooms (whole), Bathrooms (whole or half), Square feet, Pets allowed, Furnished, Fenced yard (Yes / No / blank) | `numeric_mm44r6x9`, `numeric_mm44dmx5`, `numeric_mm4b1e83`, `dropdown_mm3ywgac`, `dropdown_mm3yqhxg`, `dropdown_mm3yt55p` |
| Rent and fees | Monthly rent, Security deposit, Cleaning, Admin, Application, Move-in fee, Pet deposit, Pet fee, Monthly pet rent ($0–$100,000) | `numeric_mm44b6ew` and the fee columns |
| Listing | Listing link (`http(s)://` only, ≤ 500 chars), Terms and notes (≤ 2,000 chars, keeps line breaks) | `text_mm3ykmnv`, `long_text_mm4jpg99` |

Deliberately **not** editable:

- **Availability status** (Available now / soon / unverified …). Monday's column says "Set automatically by the Property Availability Monitor. Do not edit by hand." A hand edit would be overwritten on the monitor's next check. *Next availability* is editable.
- **Owner and landlord name, phone, email.** They decide the green / yellow / red dot through the owner board and the dot-colour rules.
- **Name, address, city, state, zip.** They drive the locator pipeline; a typo would move the pin.

The list of fields, their limits and their Monday formats live in one place, `lib/listing-edit.ts`, shared by the form and the route.

## 3. The save, step by step

`POST /api/properties/[id]/edit` with `{ editor, changes, base }`:

- `changes` holds only the fields the user changed (`null` clears one).
- `base` holds the value the form started from for each of those fields.

| # | Step | On failure |
|---|---|---|
| 1 | `MAP_EDITING=off` | 403 `editing_off` |
| 2 | Id and body (≤ 32 KB) checked; `parseEditRequest` validates every value and needs a name | 400 with the reason |
| 3 | `listing_edit_guard` (Postgres) logs the attempt and enforces limits: 30 per IP per 10 min, 20 per property per hour, 500 a day | 404 / 429 |
| 4 | `readColumns` reads the changed columns from Monday now | 502 `monday_error`, nothing written |
| 5 | Each field's Monday value is compared with `base` | 409 `conflict` with Monday's current values |
| 6 | Fields already equal to Monday are dropped; if none are left | 200, nothing written (`noop`) |
| 7 | `changeColumns` → Monday `change_multiple_column_values` (one mutation, labels never created) | 502 `monday_error`, nothing mirrored |
| 8 | Dry run (`MONDAY_DRY_RUN=1`) stops here: the response shows the values but nothing is stored | — |
| 9 | `listing_edit_mirror` copies the values into `properties` (the generated `move_in_total` recalculates) | `mirrored: false`; the Monday webhook brings them in seconds |
| 10 | `createUpdate` posts "✏️ Edited on the map by Will on 2026-10-28: • Monthly rent: $2,200 → $2,400 …" (HTML-escaped) | `noted: false`; the edit stands |
| 11 | The log row is marked `applied` with Monday's before-values | — |

The response is the property as the map now has it, built by the same code as `GET /api/properties/[id]` (`lib/property-detail.ts`).

### Monday value formats

Checked against Monday's developer docs and the board's column settings (read-only):

| Kind | Set | Clear |
|---|---|---|
| Numbers, text | `"2400"` | `null` (an empty string sets a number to 0) |
| Date | `{ "date": "2026-11-01" }` | `null` |
| Yes/No dropdown | `{ "labels": ["Yes"] }` | `null` |
| Long text | `{ "text": "…" }` | `null` |

### The conflict check

Monday is read fresh on every save, so an edit made in Monday after the form opened is never silently overwritten. Values are compared after the same normalisation on both sides. A Monday value that the form can't validate (for example pets typed as "N/D") is compared as text, so such a property doesn't conflict on every save. The form offers two ways out of a conflict: **Use Monday's values** for those fields, or **Save mine anyway**, which resubmits with Monday's values as the new base.

## 4. Who can do this, and the guard rails

The map has no login: it is embedded in Monday and anyone with the URL can open it. So the server is the only gate.

- Only the 18 fields, only valid values; everything else is a 400.
- Rate limits in Postgres (above), per IP and per property, plus a daily cap.
- The editor's name is required and appears in the Monday note and the log, so every change is attributable. It is remembered on the device, shared with *Report bad link*.
- `listing_edit_mirror` is callable with the publishable key (like `flag_link_guard`), so it only applies the fields of that property's newest unfinished guarded edit from the last five minutes. Calling it directly can't rewrite arbitrary properties.
- Every attempt, refused or applied, is in `listing_edit_log` with its before and after values.
- **Kill switch:** set `MAP_EDITING=off` in Vercel and redeploy. The Edit button disappears (via `/api/health`) and the route refuses.

Undoing an edit: edit the field back on the map or in Monday. The Monday note lists the old values.

## 5. The availability pill

`lib/availability.ts` turns the property's availability, the monitor's last check and *Next availability* into one pill. `components/property/AvailabilityPill.tsx` draws it.

| Monday availability | Pill | Tone |
|---|---|---|
| Available Now | Available now · checked Oct 22 | green |
| Available Soon | Available soon · from Nov 1 · checked Oct 22 | blue |
| Available (Unverified) | Unverified · from Nov 1 | grey |
| Unavailable | Unavailable | red |
| Listing Removed | ~~Listing removed~~ (no glow) | dark |
| Check Failed, blank | Availability unknown · from Nov 1 | grey |

If *Next availability* is in the past and the status isn't Available now, Unavailable or Listing removed, the pill says **date passed (Mar 1, 2025)**: the signal for Lou's stale-date clean-up. The pill is the first row of the panel header and renders from the list's copy before the detail loads. The availability chip no longer appears in the panel header (list rows keep theirs), and the duplicate "Available" row is gone from the Property section. Styles are `.nh-avail` and `.nh-avail--{tone}` in `app/globals.css`, built on the theme tokens so dark mode stays subtle.

## 6. Files

| File | Role |
|---|---|
| `lib/listing-edit.ts` | Fields, validation, Monday formats, conflicts, note lines (pure) |
| `lib/edit-overlay.ts` | Lays an edit over a record and recomputes the move-in total (pure) |
| `lib/property-detail.ts` | The detail the GET and edit routes both return |
| `lib/monday.ts` | `readColumns`, `changeColumns`, `MONDAY_API_URL` (tests) |
| `app/api/properties/[id]/edit/route.ts` | The save |
| `supabase/migrations/20261027_listing_edit.sql` | `listing_edit_log`, `listing_edit_guard`, `listing_edit_finish`, `listing_edit_mirror` |
| `components/property/EditListing.tsx` | The form |
| `components/property/health.ts` | One cached `/api/health` request |
| `lib/availability.ts`, `components/property/AvailabilityPill.tsx` | The pill |

## 7. Tests

| Command | Covers |
|---|---|
| `npm run test:unit` | `listing-edit`, `edit-overlay`, `availability` rules |
| `node tests/api/edit-route.mjs serve`, then the app with `SUPABASE_URL=http://127.0.0.1:3098 SUPABASE_KEY=test MONDAY_API_URL=http://127.0.0.1:3098/v2 MONDAY_API_TOKEN=test`, then `BASE=… node tests/api/edit-route.mjs` | The route against one mock of Monday and Supabase: exact Monday JSON, mirror patch, note, conflict, no-op, every refusal, Monday read and write failures, note failure, dry run, kill switch, the GET route unchanged |
| `BASE=… node tests/browser/edit-listing.mjs` | The pill in every state (light, dark, desktop, phone) and the form: validation, exact request body, success, conflict, errors, keyboard use, both panel mounts agreeing |

The route test never touches the live database or Monday.
