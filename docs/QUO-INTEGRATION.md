# Quo integration — technical reference

How the property map talks to Quo (formerly OpenPhone): the read-only **contact history** on the owner card, and the **Call / Text** buttons that open Quo on the user's own device. For the user-facing description see the README (*Using the map → 2 · Find the right home → Tap a property*).

Last updated: 27 Oct 2026 · Owner: Fazal Abed (fazal@novahavens.com) · Shipped in [#15](https://github.com/Novahavens/Interactive-map/pull/15) (contact history) and [#16](https://github.com/Novahavens/Interactive-map/pull/16) (Call / Text).

Words used below: **E.164** is the international phone format `+1 918 740 9628` written as `+19187409628`. A **deep link** is a URL with a custom scheme (`openphone://…`) that the operating system hands to the app that registered it. **Rail** is the property panel on the right of the desktop map; **sheet** is the same panel sliding up on a phone; **drawer** is a collapsed section inside it. **PM** is a property manager. **Inbox** is a Quo phone number shared by teammates. The Quo API spec is at https://www.quo.com/docs; Vercel environment variables and logs are under *Settings → Environment Variables* and *Logs* for the `nova-havens-map` project.

## 1. What it does, in one paragraph

Every property's panel has a Contacts card with the owner's and the landlord/PM's phone numbers. The map reads Quo once, server-side, to show a digest of calls and texts with those numbers (*Last call Oct 24 · William · 3 min · 3 calls · 1 unanswered · 4 sent · 1 reply*, plus the last text). Next to each number, **Call** and **Text** open the Quo app on whatever device the user is holding, signed in as them, so the call or text goes out from the Quo number they have selected in their app and shows up in the same history. The map itself never places a call or sends a message.

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
| `QUO_API_BASE` | Local tests only | `http://127.0.0.1:3099/v1` points the route at the mock Quo |

Key rotation, no downtime: generate a new key in Quo (the old one keeps working), replace the value in Vercel for Production and Preview, redeploy, open a property with calls and check the drawer, then revoke the old key in Quo. A revoked key hides the drawer and logs `Quo … returned 401` once; nothing else in the map is affected. Quo's API needs the Business plan and an owner or admin to create the key; on a lower plan there is no *API* page and the drawer stays off.

## 6. Security and privacy

- The key is server-only and never reaches the browser. The browser only ever calls the map's own route with a property id.
- The route never accepts a phone number from the caller; it looks up the property's own numbers, so the map can't be used to query arbitrary numbers against Quo.
- The last text's first 90 characters are shown to anyone who can open the map. The map URL has no login (it's embedded in Monday); if that's too much, hide the preview by returning `null` from `preview()` in `lib/contact.ts`.
- Nothing is written to Quo. The buttons hand off to the Quo app; the user confirms the call or sends the text there.
- The reporter name in `localStorage` stays on the device and is only used to sign the draft.

## 7. Tests

| Command | Covers |
|---|---|
| `npm run test:unit` | `tests/unit/contact.test.mts` (phone parsing, answered/missed, counts, truncation, preview) and `tests/unit/quo-links.test.mts` (platform detection, URL encoding, draft text) |
| `node tests/api/contact-route.mjs serve` then the app with `QUO_API_KEY=test-key QUO_API_BASE=http://127.0.0.1:3099/v1`, then `BASE=… node tests/api/contact-route.mjs` | The route against a mock Quo: auth header, exact `participants` encoding, pagination, both inboxes, cache, 429 retry, 401 → hidden, 500 → 502, per-IP 429 |
| `BASE=… node tests/browser/contact-digest.mjs` | The drawer in every state, desktop and phone, light and dark |
| `BASE=… node tests/browser/contact-actions.mjs` | The buttons on a laptop and an iPhone: hrefs per platform, clipboard, draft with and without a remembered name, company names, both hints, copy-on-tap, touch sizes |

`BASE` is the URL of a running build of the app (`npm run build && npx next start -p 3012` → `BASE=http://localhost:3012`), started with `SUPABASE_URL` and `SUPABASE_KEY` because the browser tests read real property records; they mock the claims, health and contact routes, need no Quo key, and write nothing. Headless Chromium freezes input after an unanswered custom-scheme navigation, so `contact-actions.mjs` stops the links from navigating and checks the hrefs, clipboard, draft and hints instead; real browsers don't freeze.

After changing the draft wording: update the expected strings in `tests/unit/quo-links.test.mts` and `tests/browser/contact-actions.mjs`, run `npm run test:unit`, then the browser test as above.

## 8. Known limits and what's next

- **Unconfirmed on real laptops:** whether the Quo desktop app fills the composer from `openphone://message`. If it opens empty, the number is on the clipboard. Check on a Mac and a Windows laptop with Quo installed and record the result here.
- The hints rely on the window losing focus; a browser that keeps focus while an external app opens would show a hint it didn't need. Harmless, but tell the user it's safe to ignore.
- Not built: an AI one-line summary of the conversation (placeholder in the panel), and a "blacklist from the claim board" flow (separate brief).
