# Quo integration — technical reference

How the property map talks to Quo (formerly OpenPhone): the read-only **contact history** on the owner card, the **Call / Text** buttons that open Quo on the user's own device, the **contact log** that puts every call and text in Monday by itself, and **Owner said**, Quo's AI call summary on the panel. For the user-facing description see the README (*Using the map → 2 · Find the right home → Tap a property*).

Last updated: 29 Oct 2026 · Owner: Fazal Abed (fazal@novahavens.com) · Shipped in [#15](https://github.com/Novahavens/Interactive-map/pull/15) (contact history), [#16](https://github.com/Novahavens/Interactive-map/pull/16) (Call / Text) and [#18](https://github.com/Novahavens/Interactive-map/pull/18) (contact log, Owner said, backfill) and [#19](https://github.com/Novahavens/Interactive-map/pull/19) (the old placeholders removed). **The contact log has been live for every team number since 29 Oct 2026** (§13).

Words used below: **E.164** is the international phone format `+1 918 740 9628` written as `+19187409628`. A **deep link** is a URL with a custom scheme (`openphone://…`) that the operating system hands to the app that registered it. **Rail** is the property panel on the right of the desktop map; **sheet** is the same panel sliding up on a phone; **drawer** is a collapsed section inside it. **PM** is a property manager. **Inbox** is a Quo phone number shared by teammates. The Quo API spec is at https://www.quo.com/docs; Vercel environment variables and logs are under *Settings → Environment Variables* and *Logs* for the `nova-havens-map` project.

## 1. What it does, in one paragraph

Every property's panel has a Contacts card with the owner's and the landlord/PM's phone numbers. The map reads Quo once, server-side, to show a digest of calls and texts with those numbers (*Last call Oct 24 · William · 3 min · 3 calls · 1 unanswered · 4 sent · 1 reply*, plus the last text). Next to each number, **Call** and **Text** open the Quo app on whatever device the user is holding, signed in as them, so the call or text goes out from the Quo number they have selected in their app and shows up in the same history. The map itself never places a call or sends a message. Quo also tells the map about every call and text as it happens (one webhook): the map moves the property's **Last Contact Date** in Monday and leaves one short note there (§8), and after an answered call it shows Quo's AI summary as **Owner said**, with an **Update Monday** button that opens the Edit form already filled in from the call (§9).

## 2. The two halves and why they're different

| | Contact history (digest) | Call / Text buttons |
|---|---|---|
| Direction | Quo → map (read) | map → Quo app (open) |
| Runs | Server (Vercel function) | Browser only |
| Needs | `QUO_API_KEY` (workspace key) | Nothing from the map; the Quo app on the user's device |
| Identity | The workspace: every inbox, every teammate | The user: whoever is signed into Quo on that device |
| Files | `lib/contact.ts`, `lib/quo.ts`, `app/api/properties/[id]/contact/route.ts`, `components/property/ContactDigest.tsx` | `lib/quo-links.ts`, `components/property/ContactActions.tsx` |

**Why the buttons don't use the API.** The map has no login, so it cannot know *who* is clicking. Quo's API would send from the workspace inbox on behalf of the key's owner, which is the wrong sender and would need per-user credentials stored somewhere. Opening the app on the device sidesteps all of that: the device is the identity, the user's selected Quo number is the caller ID, and nothing secret lives in the map. Per-user API keys would have meant each teammate pasting a key into a tool with no login, so anyone with the URL could send as them; a "who are you" picker is the same problem without the key.

## 3. Call / Text: how a click reaches Quo

Quo documents two deep links for its mobile apps, `openphone://dial` and `openphone://message` ([Deep linking](https://support.quo.com/core-concepts/integrations/deep-linking)), and *click-to-call* for its desktop apps ([Click-to-call](https://support.quo.com/core-concepts/calling/click-to-call)). The desktop app has no `sms:` handler. The buttons use the best route per platform:

| Platform (from the user agent) | Call | Text |
|---|---|---|
| iPhone / iPad / Android | `openphone://dial?number=%2B1…` — Quo's dialer, pre-filled; the user taps Call in Quo | `openphone://message?number=%2B1…&selectedAsFallback=true&text=…` — Quo's composer with the draft |
| Mac / Windows | `tel:+1…` — Quo's click-to-call, once Quo is the default calling app | `openphone://message?…` (same link, best effort: Quo documents the deep links for phones only) **and** the number is copied to the clipboard on click |

Details that matter:

- **`+` is percent-encoded** (`%2B`). Quo reads `number=+1918…` as a space otherwise.
- **`selectedAsFallback=true`** tells Quo to send from the number currently selected in the app when `from` isn't given. Without it Quo may ask which number to use. `from` is never set: the map doesn't know the user's number, and the user's selection in Quo is the right answer.
- **The draft text** is `Hi {first name}, it's {name} from Nova Havens about {street}. ` The first name comes from the Monday owner/landlord name (`firstNameOf` skips honorifics and initials, reads "Doe, Jane", and gives no name for a company such as *Acme Properties LLC* or *The Smith Family Trust*, so the draft opens "Hi, this is…"); the street is the part of the address before the first comma; `{name}` is the reporter name saved by *Report bad link* in `localStorage["nh-reporter-name"]`, else "this is Nova Havens". It's one line so it's easy to delete.
- **A number `toE164List` can't read** (a foreign number typed without `+`, or too few digits) still gets *Call* with the digits as typed (`tel:011442079460958`) and the copy button, but no *Text*: Quo's composer needs a real number. Under 7 digits, the cell is shown as plain text.
- **Desktop Text copies the number** because Quo's deep-link doc covers the mobile apps only; the desktop app opens on `openphone://` but hasn't been confirmed to read the parameters (see §8). With the number on the clipboard the user can paste into *To* whichever way the app comes up.
- **"Quo didn't open" hints.** When the user clicks Call or Text on a laptop, the component waits 1.5 s for the window to lose focus (`blur` or `visibilitychange`). If it doesn't, Quo didn't take over, and a one-line hint appears with the right link. For Call: *Quo didn't open? Make Quo your default calling app* → the click-to-call article. For Text: *Quo didn't open. Paste the number into Quo: open Quo* → `https://my.quo.com`, Quo's web app, which works on any laptop without the desktop app. The hint clears itself after 9 s. If another app (FaceTime, Skype) took the `tel:` link instead, it takes focus and no hint shows; the fix is the same, make Quo the default. On phones there's no hint: the store opens when Quo isn't installed, which is the right fallback.
- **Two numbers in one Monday cell** ("918-555-0100 / 918-555-0199") give two rows, each with its own buttons. Parsing is `toE164List` in `lib/contact.ts` (same rules as the digest; never invents a US number from a foreign one).
- **Tap the number to copy it.** The number is a button with a copy icon; a tick replaces it for 1.5 s.
- **Sizes and detection** are commented in `ContactActions.tsx`: 44 px targets on touch, 28 px with a mouse; the platform is read after mount so the server and client renders agree; an iPad reports itself as a Mac with touch.

### What the user has to do once

| Device | Set-up | Then |
|---|---|---|
| iPhone / Android | Install Quo, sign in | Nothing |
| Mac | Install the Quo desktop app; FaceTime → Settings → *Default for calls* → Quo | Nothing; if the Text composer opens empty, paste (the number is on the clipboard) |
| Windows | Install the Quo desktop app; Settings → Default apps → *Choose defaults by protocol* → TEL → Quo | Same as Mac |

Quo's own article with screenshots: https://support.quo.com/core-concepts/calling/click-to-call. The panel links to it the first time Call doesn't take over.

## 4. Contact history: how the digest is built

`GET /api/properties/[id]/contact` → `{ enabled, numbers, digest }` (types in `lib/contact.ts`).

1. **Phones come only from the property record** (`property_detail` RPC: `owner_phone`, `landlord_phone`), never from the request. `toE164List` turns each Monday cell into E.164, at most 4 numbers.
2. **Directory, cached an hour per instance:** `GET /v1/phone-numbers` (every inbox) and `GET /v1/users` (ids → first names for "· William"). A failure caches for one minute; 401/403 is rethrown.
3. **Per number, per inbox:** `GET /v1/calls?phoneNumberId=…&participants=%2B1…&maxResults=100` and the same for `/v1/messages`, following `nextPageToken` at most once (200 items each). `participants` is sent once, without brackets, exactly as the spec requires. Results are cached 10 minutes per phone as promises, so concurrent opens share one read.
4. **Freshness:** a digest can be up to 10 minutes behind Quo (the per-phone cache); teammate names and the inbox list up to an hour. A new or rotated key is read only by a new deployment.
5. **Rate:** a queue allows 3 requests in flight and 120 ms between starts (Quo's limit is 10 req/s); one retry on 429 honouring `Retry-After` up to 3 s; 20 s budget per request; 120 lookups per IP per minute.
6. **`summarise()`** (pure, in `lib/contact.ts`) counts calls (excluding `queued`, `initiated`, `ringing`, `in-progress`, `failed`, `canceled`), marks a call answered when Quo stamps `answeredAt`/`answeredBy`, or its status is `answered`/`forwarded`, or an outgoing `completed` call had duration; counts texts by direction ("4 sent · 1 reply" is 4 outgoing, 1 incoming, across both numbers and every inbox); finds the newest call and text and the last text's first 90 characters; sets `truncated` when a second page existed, which the panel shows as a **+** after the count ("200+ calls").
7. **Partial failure** is a feature: `Promise.allSettled` per number; `unread` counts numbers Quo couldn't read, and the UI says "Couldn't read 1 of the 2 numbers from Quo right now; the counts cover the others."

Assumption to keep in mind: Quo lists newest first (as its app does; the spec doesn't say). It only matters for an owner with more than 200 calls or texts on one number.

### Responses and what the panel shows

| Situation | Route | Panel |
|---|---|---|
| No `QUO_API_KEY`, or it was added without a redeploy | `200 { enabled: false }`; `https://nova-havens-map.vercel.app/api/health` says `quo: false` | No drawer at all |
| Key refused (401/403) | `200 { enabled: false }`; Vercel → *Logs* shows `Quo /calls returned 401` once per instance | No drawer |
| No phone on the record | `200 { numbers: [], digest: null }` | "No phone number Quo can look up on this property." |
| Quo 429 after the retry | `503 quo_busy` with `Retry-After` | "Couldn't reach Quo right now." |
| Quo 5xx / network / nothing readable | `502 quo_error` | "Couldn't reach Quo right now." |
| Too many lookups from one IP | `429` with `Retry-After: 60` | "Couldn't reach Quo right now." |
| Everything read, nothing found | `200`, zero counts | "No calls or texts in Quo yet." |

The drawer (`ContactDigest.tsx`) is closed by default and asks the route only when first opened; the desktop rail and the phone sheet share one request per property for a minute.

## 5. Configuration

| Variable | Where | Value |
|---|---|---|
| `QUO_API_KEY` | Vercel → nova-havens-map → Settings → Environment Variables, **Secret**, Production (+ Preview for preview deployments) | Quo → Settings → *API* → Generate API key (Business plan; owner/admin). The key takes effect on the next deployment. |
| `QUO_API_BASE` | Local tests only | `http://127.0.0.1:3099/v1` points the route at the mock Quo (the webhook tests use `:3097`) |
| `QUO_TIMEZONE` | Optional | Days and note times for the contact log; default `America/Chicago` |
| `MAP_EDIT_SECRET` | Already set for listing edits | Also gates the contact log's database functions and the setup and backfill routes (`x-map-secret`). The webhook's signing key is not an env var: setup stores it in sync_config |

Key rotation, no downtime: generate a new key in Quo (the old one keeps working), replace the value in Vercel for Production and Preview, redeploy, open a property with calls and check the drawer, then revoke the old key in Quo. A revoked key hides the drawer and logs `Quo … returned 401` once; nothing else in the map is affected. Quo's API needs the Business plan and an owner or admin to create the key; on a lower plan there is no *API* page and the drawer stays off.

## 6. Security and privacy

- The key is server-only and never reaches the browser. The browser only ever calls the map's own route with a property id.
- The route never accepts a phone number from the caller; it looks up the property's own numbers, so the map can't be used to query arbitrary numbers against Quo.
- The last text's first 90 characters are shown to anyone who can open the map. The map URL has no login (it's embedded in Monday); if that's too much, hide the preview by returning `null` from `preview()` in `lib/contact.ts`.
- Nothing is written to Quo. The buttons hand off to the Quo app; the user confirms the call or sends the text there.
- The reporter name in `localStorage` stays on the device and is only used to sign the draft.
- The contact log stores who, when, how long and which properties, never a text's words; call summaries are stored as Quo wrote them and shown to anyone with the map (decided 28 Oct, like the last-text preview). Recordings and transcripts are never fetched.
- Every webhook delivery is signature-checked before anything is read; the tables are RLS-locked and every function checks the server secret.

## 7. Tests

| Command | Covers |
|---|---|
| `npm run test:unit` | `tests/unit/contact.test.mts` (phone parsing, answered/missed, counts, truncation, preview) and `tests/unit/quo-links.test.mts` (platform detection, URL encoding, draft text) |
| `node tests/api/contact-route.mjs serve` then the app with `QUO_API_KEY=test-key QUO_API_BASE=http://127.0.0.1:3099/v1`, then `BASE=… node tests/api/contact-route.mjs` | The route against a mock Quo: auth header, exact `participants` encoding, pagination, both inboxes, cache, 429 retry, 401 → hidden, 500 → 502, per-IP 429 |
| `BASE=… node tests/browser/contact-digest.mjs` | The drawer in every state, desktop and phone, light and dark |
| `BASE=… node tests/browser/contact-actions.mjs` | The buttons on a laptop and an iPhone: hrefs per platform, clipboard, draft with and without a remembered name, company names, both hints, copy-on-tap, touch sizes |

`BASE` is the URL of a running build of the app (`npm run build && npx next start -p 3012` → `BASE=http://localhost:3012`), started with `SUPABASE_URL` and `SUPABASE_KEY` because the browser tests read real property records; they mock the claims, health and contact routes, need no Quo key, and write nothing. Headless Chromium freezes input after an unanswered custom-scheme navigation, so `contact-actions.mjs` stops the links from navigating and checks the hrefs, clipboard, draft and hints instead; real browsers don't freeze.

| `npm run test:unit` | Also `tests/unit/quo-events.test.mts` (payloads, what counts, smart pick, street names, note wording, pilot), `owner-said.test.mts` (dates, money, pets, furnished, conflicts) and `quo-signature.test.mts` |
| `node tests/api/quo-webhook.mjs serve`, the app against it, then `node tests/api/quo-webhook.mjs` | The webhook, setup, backfill, owner-said and the edit route's call source against one mock playing Quo, Monday and Supabase (header of the file has the exact commands) |
| `BASE=… node tests/browser/owner-said.mjs` | The Owner said card in every state, the prefilled Edit form, desktop and phone, light and dark |
| `tests/sql/quo-contact-log-rollback.sql` | Every contact-log function against the real database, inside a transaction that rolls back |

After changing the draft wording: update the expected strings in `tests/unit/quo-links.test.mts` and `tests/browser/contact-actions.mjs`, run `npm run test:unit`, then the browser test as above.

## 8. Calls and texts log themselves (the contact log)

Quo posts every call, text and call summary to `POST /api/quo/webhook`. One Quo webhook covers every number (`resourceIds: ["*"]`), on Quo's dated API `2026-03-30` (payloads carry `data.resource` and `data.context`; [event payloads](https://www.quo.com/docs/2026-03-30/webhooks-event-payloads)). Files: `app/api/quo/webhook/route.ts` (the order of work), `lib/quo-events.ts` (every rule, pure and unit-tested), `lib/quo-signature.ts`, `lib/quo-config.ts`, `supabase/migrations/20261028_quo_contact_log.sql`.

**Per event, in order.** Verify the signature (Standard Webhooks: HMAC-SHA256 over `webhook-id.webhook-timestamp.body` with the `whsec_` key; deliveries older than 5 minutes are refused, and Quo re-signs every retry) → parse → `quo_event_begin` (one `contact_events` row per Quo event id: a re-delivery of a handled event answers 200 and does nothing; one being handled right now answers 503) → `quo_match` the other party's number to properties → in **live** mode, write Monday; in **shadow** mode, record what would have been written → `quo_event_finish`.

**What counts (decided 28 Oct).**

| Event | Last Contact Date | Note in Monday |
|---|---|---|
| Answered call, either way | moves to the call's day (never backwards) | one per call: *📞 Will called the owner · 3 min* / *📞 The owner called · Will answered · 3 min* |
| Outgoing call, no answer | no | one a day: *📞 Will tried to call the owner · no answer* |
| Incoming call, missed | no | one a day: *📞 The owner called · missed · left a voicemail* |
| Text we sent / they sent | moves | one a day each way: *💬 Will texted the owner* / *💬 The owner texted* |
| Failed or unknown call, summary | no | none |

The second line of every note is *Oct 27, 2:14 PM · (918) 555-0100 · logged from Quo*: when, which number, and that it was automatic. Notes never quote a text. Days and times are Tulsa's (`QUO_TIMEZONE`, default `America/Chicago`). "Answered" is Quo's `status: answered` (or a forwarded call that ran); Quo marks an outgoing call answered when voicemail picks up too, so a voicemail can read as *called · 1 min*.

**Which properties.** A number is matched against the owner and landlord/PM phones of every property (`quo_phone_keys()`: every North American number in the cell, the same rule as `toE164List`, behind a GIN index; 36 properties for the busiest owner take a few milliseconds). The date moves on every matched property that shows an older one. The note goes on the smart pick: properties that are options on an active claim (`claim_options`), else up to five of them, most recently contacted first. A number on no property is stored as `unmatched`.

**Monday writes.** Notes are off by default (`QUO_MONDAY_NOTES`, below) because every Monday update emails the people who follow the item: on 29 Oct the notes went to people who did not need them. With notes off the event records what it would have posted, and the call history stays in the map's contact card. Dates: one request with an aliased `change_multiple_column_values` per property (25 at most), then `quo_mirror_last_contact` so the map shows the date at once (the Monday webhook confirms it). Notes: `create_update`, posted by the map's Monday token, so they show the token's owner as author and name the teammate in the text. Each note slot (property, day, slot) is claimed in `contact_notes` before posting, so a retried event never posts twice; a post that times out keeps its claim (one missing note beats two).

**Failures.** Anything that fails part-way answers 503 and Quo delivers the event again (8 attempts over about 27 hours); what already happened isn't repeated (dates are idempotent, notes are claimed, and the event row keeps the ids of everything done). A bad signature is 401; an event type the map doesn't use is 200 and ignored.

**The switches** (sync_config, take effect within 5 seconds, no deploy):

| Key | Values |
|---|---|
| `QUO_LOG_MODE` | `shadow` (default: record only), `live` (write Monday), `off` (ignore every event) |
| `QUO_MONDAY_NOTES` (env var, Vercel) | `off` (default): Last Contact Date moves, no Monday updates. `on`: also post one note per answered call, text and attempt. Turn on only if the notes should be seen by everyone following the item: Monday emails each update to those followers. |
| `QUO_LIVE_USERS` | Optional pilot: comma-separated Quo user ids or first names; in live mode only their events write, everyone else's stay shadow |

```sql
insert into sync_config (key, value) values ('QUO_LOG_MODE', 'live')    -- 'shadow' / 'off' (the kill switch) the same way
  on conflict (key) do update set value = excluded.value, updated_at = now();
select * from contact_events_daily order by day desc limit 7;        -- the daily check
select state, type, numbers, property_ids, note_ids, date_ids, error from contact_events order by received_at desc limit 20;
```

## 9. Owner said

After an answered, recorded call, Quo writes an AI summary (`call.summary.completed`; recording and AI summaries must be on for the number). The webhook stores it in `call_summaries` with the facts read from it, and the panel shows it under the contact history (`components/property/OwnerSaid.tsx`, `GET /api/properties/:id/owner-said`).

**Reading the summary** (`lib/owner-said.ts`, decided 28 Oct: Quo's summaries only, no model). Plain rules over the summary sentences pick out: next availability (*available November 1st*, *available now*, *12/15*, *in December*, *end of November*), monthly rent, security deposit, pet deposit / fee / rent, pets yes/no, furnished yes/no. A money amount takes the nearest word naming a cost with no other amount in between (*$2,400 a month with a $500 deposit* → rent 2,400, deposit 500), and amounts nearest a cost the form doesn't take (utilities, cleaning, application, admin) are left alone. A fact said two different ways is dropped, not guessed. Every fact keeps its sentence.

**Which property.** A summary that names a street goes to that property (*the house on Elm Street*, *4512 Harvard*); otherwise the same smart pick as notes. When the number is on more than one property, the card says so: *This number is on N properties. Check the call was about this one.*

**Update Monday** opens the existing Edit form ([LISTING-EDITS.md](LISTING-EDITS.md)) prefilled with the facts, each with *From the call: “…”* under it and *Filled in from Will's call on Oct 27* at the top. Nothing reaches Monday until the person checks the values and presses Save; the save goes through the same edit route (conflict check, read-back, mirror, note), with `source: { kind: "quo_call", callId }`, so the Monday note reads *✏️ Edited on the map by Fazal on 2026-10-28, from Will's call on 2026-10-27* and the card then shows *Applied to Monday by Fazal*. The availability status stays the monitor's; the button hides when Monday already has every value.

## 10. Backfill (one-off)

`POST /api/quo/backfill` with header `x-map-secret: <MAP_EDIT_SECRET>` fills *Last Contact Date* from Quo's history where Monday is blank or older.

1. `{"mode":"scan"}`, then `{"mode":"scan","pageToken":"<next>"}` until `next` is null. Each call reads 50 Quo conversations (`GET /v1/conversations`), matches their numbers, reads the history only where Quo has activity after the map's date, and stores the newest answered call or text per property in `contact_backfill` as `proposed`. Nothing is written to Monday.
2. The report: `select property_item_id, phone, quo_day, kind, teammate, monday_day from contact_backfill where state = 'proposed' order by quo_day desc;` exported as a CSV for approval.
3. `{"mode":"apply"}` repeatedly until `applied: 0, done: true`. Each call writes up to 25 dates in one Monday request and marks them `applied` (the map follows). A row Monday refuses on its own is marked `failed` and doesn't block the rest; one that only met a busy Monday (rate limit, complexity budget, timeout) stays proposed for the next call (`retryLater`); rows the map has meanwhile caught up with are `skipped`.

## 11. Setting it up and checking it

This is the order to follow on a new environment. What we actually did, with dates and numbers, is in §13.

1. In Quo, turn on call recording and AI call summaries for every number the team calls from.
2. `POST /api/quo/setup` with `x-map-secret: <MAP_EDIT_SECRET>` on the production URL. It creates the one webhook (or keeps a matching one; rotates it if the stored key isn't its own), stores the `whsec_` key in sync_config `QUO_WEBHOOK_KEYS` and its id in `QUO_WEBHOOK_ID`, and answers the mode in force. On Vercel it always registers the production address. No Vercel variable to add: the key lives in the database, behind the same server secret as listing edits.
3. Shadow: the daily check above, compared with what the team logged by hand. The plan said two or three days; we ran about an hour (§13) because the first hour already matched what the team did.
4. Live: set `QUO_LOG_MODE` to `live`. To limit it first, set `QUO_LIVE_USERS` to one person for a day, then clear it. We went live for everyone at once.
5. Backfill: scan, report, apply (§10). Not run yet.

Health: `contact_events` rows arrive within seconds of a call or text; `state` is `shadow`/`done`/`unmatched`/`ignored`, and `retry` rows say what failed in `error`. Quo's side: `GET https://api.quo.com/webhooks/<id>/events` (header `Quo-Api-Version: 2026-03-30`) lists deliveries and their answers.

## 12. Known limits and what's next

- **Unconfirmed on real laptops:** whether the Quo desktop app fills the composer from `openphone://message`. If it opens empty, the number is on the clipboard. Check on a Mac and a Windows laptop with Quo installed and record the result here.
- The hints rely on the window losing focus; a browser that keeps focus while an external app opens would show a hint it didn't need. Harmless, but tell the user it's safe to ignore.
- Not built: a "blacklist from the claim board" flow (separate brief).
- The contact log can't tell a person from voicemail on an outgoing call Quo marks answered (above). Dates are compared with the map's copy of Monday, which is seconds behind; a date typed in Monday in those seconds could be overwritten by an older call.
- Owner said only reads what the summary says outright; facts in a call Quo didn't summarise, or summarised vaguely, are not there.

## 13. Go-live record (29 Oct 2026)

**Change, same day:** the Monday notes were switched off after the first emails reached people who follow the items. The date still moves, and the notes can come back with `QUO_MONDAY_NOTES=on`. Notes posted before the change stay in Monday.

| When (UTC) | What happened |
|---|---|
| 28 Oct | Quo recording and AI summaries confirmed on for every number. |
| 29 Oct | #18 merged. |
| 29 Oct, before the shadow hour | `POST /api/quo/setup` run on production: Quo webhook `47649` created, signing key stored. Mode `shadow`. |
| 29 Oct, shadow hour | 2 answered calls, 40 texts and 2 call summaries arrived. 16 properties matched, 15 numbers on no property, 0 errors. Owner said read *available in December* as Dec 1. A one-hour comparison with what the team logged by hand was enough; no day-long pilot (`QUO_LIVE_USERS`) was used. |
| 29 Oct, 15:04:41 | `QUO_LOG_MODE` set to `live` for everyone. |
| 29 Oct, 15:04 to 15:46 | 17 calls and texts arrived: 15 logged (`done`), 2 calls on no property (`unmatched`); 6 summaries (4 saved, 2 unmatched). No `retry` or `failed` rows. Notes landed in Monday once each (checked on one property: *📞 Dani called the owner · 2 min*), and Last Contact Date moved to Oct 29 on every property that had an older date. |

To stop it at any time: `QUO_LOG_MODE = 'shadow'` (records only) or `'off'` (ignores events); effective within 5 seconds, no deploy.

Still to do: the backfill (§10) and the Mac and Windows check of the Text button (§12).

