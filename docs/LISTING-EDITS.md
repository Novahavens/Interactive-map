# Listing edits and the availability pill — technical reference

How a teammate changes a property's details from the map, how that reaches Monday and Supabase, and how availability is shown at the top of the property panel. For the user-facing description see the README (*Using the map → Tap a property*).

Last updated: 28 Oct 2026 · Owner: Fazal Abed (fazal@novahavens.com)

## 1. In one paragraph

The property panel has an **Edit** button. It opens a form with 18 listing fields. **Save** sends only the fields that changed to `POST /api/properties/[id]/edit`. The server checks every value, applies rate limits, re-reads those columns from Monday and stops with a conflict if someone changed them there since the form opened. It then writes Monday in one mutation, reads those columns back, copies only the values Monday confirms into the Supabase mirror so the map shows them at once, and posts a note on the Monday item saying who changed what. Anything Monday didn't confirm is named on screen instead of being reported as saved. Monday's own webhook re-reads the item a second later and confirms the mirror. At the top of the panel, availability now sits in a raised pill with a soft glow, instead of a chip among the others.

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
| 1 | Editing is on only when `MAP_EDIT_SECRET` is set and `MAP_EDITING` isn't `off` | 403 `editing_off` |
| 2 | Content-Length over 32 KB is refused before reading; then id and body are checked; `parseEditRequest` validates every value and needs a name | 413 / 400 with the reason |
| 3 | `listing_edit_guard` (Postgres) checks the secret and re-validates every value in SQL, then logs the attempt and enforces limits: 30 attempts per IP per 10 min (a missing IP is its own bucket), 20 **saved** edits per property per hour, 500 saved edits a day, and one save at a time per property | 503 `editing_off` / 400 / 404 / 429 / 409 `busy` |
| 4 | `readColumns` reads the changed columns from Monday now | 502 `monday_error`, nothing written |
| 5 | Each field's Monday value is compared with `base` | 409 `conflict` with Monday's current values |
| 6 | Fields already equal to Monday are dropped; if none are left | 200, nothing written (`noop`) |
| 7 | `changeColumns` → Monday `change_multiple_column_values` (one mutation, labels never created) | 502 `monday_error` "Monday may not have saved this. Reopen the property to check before trying again", nothing mirrored |
| 7b | The same columns are read back from Monday; a field counts as confirmed only if Monday now shows the new value | Unconfirmed fields are left out of the mirror and the note and returned as `unconfirmed`; the panel names them and keeps them in the draft |
| 8 | Dry run (`MONDAY_DRY_RUN=1`) stops here: the response shows the values but nothing is stored | — |
| 9 | The log row is marked `monday_ok`; `listing_edit_mirror` copies **that row's logged values** into `properties` (the generated `move_in_total` recalculates) | `mirrored: false`; the Monday webhook brings them in seconds |
| 10 | `createUpdate` posts "✏️ Edited on the map by Will on 2026-10-28: • Monthly rent: $2,200 → $2,400 …" (HTML-escaped) | `noted: false`; the edit stands |
| 11 | The log row is marked `applied` with Monday's before-values. Every other path also closes its row (`conflict`, `noop`, `failed`, `dry_run`), so none stays pending | — |

Every Monday call has a 10-second timeout inside a 22-second budget, and the route is capped at 25 seconds, so a hung Monday can't hold a save past the 30-second *busy* window. A field Monday already holds at the new value (for example after a save that timed out but landed) counts as done, not as a conflict, and the map is caught up from it.

The response is the property as the map now has it, built by the same code as `GET /api/properties/[id]` (`lib/property-detail.ts`).

### Monday value formats

Checked against Monday's developer docs and the board's column settings, then confirmed live on 28 Oct 2026 on a throwaway private board (since deleted) with one column of each kind: every set format stored as expected, and `null` cleared all five.

| Kind | Set | Clear |
|---|---|---|
| Numbers, text | `"2400"` | `null` (an empty string leaves a stored empty value instead of clearing) |
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
- All three edit functions in Postgres need a **server-only secret** (`MAP_EDIT_SECRET` in Vercel, matching the `MAP_EDIT_KEY` row in `sync_config`, which is not readable with the publishable key). Without it they refuse, so holding the publishable key isn't enough to change anything.
- `listing_edit_mirror` takes a log id and applies only the values logged for that request, only after Monday accepted them, within five minutes, and re-checks them. It can't be used to write arbitrary values to the map.
- `listing_edit_finish` only moves a log row forward (pending → outcome, `monday_ok` → `applied`), so finished history can't be rewritten.
- Two saves on the same property can't overlap: the second gets *Someone else is saving this property* and the person saves again a moment later (there is no automatic retry).
- Every attempt that passes the guard is in `listing_edit_log` with its requested values and outcome; Monday's before-values are added once Monday has been written. Attempts refused earlier (bad secret, invalid values, rate limits, busy, and the route's own 400s) are not logged.
- **Kill switch:** set `MAP_EDITING=off` in Vercel and redeploy, or remove `MAP_EDIT_SECRET`. The Edit button disappears (via `/api/health`) and the route refuses.

### Turning it on

1. Apply `supabase/migrations/20261027_listing_edit.sql` (statement by statement).
2. Generate a long random secret and store it: `insert into public.sync_config (key, value) values ('MAP_EDIT_KEY', '<secret>') on conflict (key) do update set value = excluded.value;`
3. Set `MAP_EDIT_SECRET` to the same value in Vercel (Production, and Preview if wanted) and redeploy.
4. `GET /api/health` now says `editing: true` and the *Edit* button appears.

Rotate by changing both values and redeploying. Until both are set, editing stays off.

The migration is applied to production (28 Oct 2026). `tests/sql/listing-edit-rollback.sql` checks it on the real database inside a transaction that rolls back: wrong and missing secrets are refused, invalid or non-whitelisted values are refused, a second save is *busy*, the mirror refuses before Monday is confirmed and with a wrong secret, then applies exactly once (rent and move-in total move together), finished rows don't move backwards, and the anon role can't read the log, the secret or the key check. It ran clean on 28 Oct and left no rows behind.

### What the editor sees after Save

| Outcome | Message |
|---|---|
| Saved and confirmed | Saved to Monday. |
| Saved, note failed | Saved to Monday. The Monday note couldn't be posted. |
| Some fields not confirmed by Monday | Saved, but Monday didn't confirm *Pets allowed*. Reopen the property to check. (amber, stays until dismissed; those fields stay in the draft) |
| Nothing confirmed | Monday may not have saved this. Reopen the property to check. |
| Monday already had these values | Already saved in Monday. (plus "The Monday note couldn't be posted." if an earlier save's owed note failed again) |
| Dry run | Dry run: nothing was written to Monday. |
| Conflict | *Monday now* next to *You entered*, with *Use Monday's values* / *Save mine anyway* |
| Busy, rate limit, too large, editing off, Monday down | The server's message in the form footer; nothing typed is lost |

### Unsaved changes

The draft lives in the page, not in one copy of the panel, so a window resize across the desktop/phone width keeps it. It is also saved in the browser tab's session storage per property as the user types: if Monday reloads the embedded map, reopening *Edit* restores it ("Restored your unsaved changes", with *Start over*), unless the property changed in Monday since, in which case it is dropped with a note. Closing the panel, picking another property or switching claims with unsaved changes asks *Discard N changes?*; doing it while a save is running waits for the save.

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

If *Next availability* is in the past and the status isn't Available now, Unavailable or Listing removed, the pill says **date passed (Mar 1, 2025)**: the signal for Lou's stale-date clean-up. For those three settled statuses a past date still shows, as plain information: "next availability was Sep 1". The pill is the first row of the panel header and renders from the list's copy before the detail loads. The availability chip no longer appears in the panel header (list rows keep theirs), and the duplicate "Available" row is gone from the Property section. Styles are `.nh-avail` and `.nh-avail--{tone}` in `app/globals.css`, built on the theme tokens so dark mode stays subtle.

## 6. Files

| File | Role |
|---|---|
| `lib/listing-edit.ts` | Fields, validation, Monday formats, conflicts, note lines (pure) |
| `lib/edit-config.ts` | Whether editing is on (secret set, kill switch not thrown) |
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
| `node tests/api/edit-route.mjs serve`, then the app with `SUPABASE_URL=http://127.0.0.1:3098 SUPABASE_KEY=test MONDAY_API_URL=http://127.0.0.1:3098/v2 MONDAY_API_TOKEN=test MAP_EDIT_SECRET=test`, then `BASE=… node tests/api/edit-route.mjs` | The route against one mock of Monday and Supabase: exact Monday JSON, the secret on every call, mirror by log id, the log state sequence, note, conflict, busy, no-op, every refusal, Monday read and write failures, note failure, dry run, kill switch and missing secret, body size, the GET route unchanged |
| `BASE=… node tests/browser/edit-listing.mjs` | The pill in every state (light, dark, desktop, phone, at most two lines at 390 px) and the form: validation, exact request body, success, conflict, busy, errors, discard prompts on close / another property / claim switch, keyboard use, both panel mounts agreeing, one health request per page |

The route test never touches the live database or Monday.
