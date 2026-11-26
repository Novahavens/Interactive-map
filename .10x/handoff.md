# Foundation handoff — for the six UI engineers

Everything below is on branch `claude/map-agent`. Don't edit these shared files; if a contract is wrong, tell the coordinator.
Shapes live in `lib/types.ts` (bottom section). Ready-made payloads for all of them: `tests/fixtures/map-agent.mjs`.

## 1. Feature switches
Keys (`FeatureKey`, `lib/feature-keys.ts`): `outside` `bestMatch` `chat` `addOutside` `submit` `mine` `nearsite` `findPhone` `templates`.

In the browser:
```ts
import { featuresOn } from "@/components/property/health";   // Promise<Record<FeatureKey, boolean>>, all false on failure
import { NO_FEATURES, type FeatureKey } from "@/lib/feature-keys";
const [features, setFeatures] = useState(NO_FEATURES);
useEffect(() => { featuresOn().then(setFeatures); }, []);
```
`featuresOn()` shares the one `/api/health` request per page. Render nothing new while a flag is false: flags off must look exactly like today.

Server only: `features()` / `featureOn(key)` from `@/lib/features`.

Switch on locally (`.env.local`):
```
MAP_FEATURES=all            # or a comma list: outside,bestMatch,mine
MAP_EDIT_SECRET=<anything locally>   # needed by every feature except "mine"
MAP_CHAT_URL=…  MAP_CHAT_TOKEN=…     # chat, addOutside
MAP_PHONE_URL=…                      # findPhone (MAP_PHONE_TOKEN optional)
```
The SQL functions are not in the database yet, so with flags on the read routes answer 502 `db_error` locally. Build against the fixtures (mock the routes), as the browser tests do.

## 2. Routes
All errors are `ApiError { error, code }`. Ids: claim and property ids are digits; listing ids are uuids.

| Route | Flag | Answers | Off |
|---|---|---|---|
| `GET /api/claim/[claimId]/outside` | `outside` | `OutsideResponse` (cache 15 s) | `{ enabled:false, searchId:null, versionNo:null, run:null, homes:[] }` |
| `GET /api/claim/[claimId]/scores` | `bestMatch` | `ScoresResponse` (cache 15 s) | `{ enabled:false, scores:[] }` |
| `GET /api/claim/[claimId]/submit-status` | `submit` | `SubmitStatusResponse` (no-store) | `{ enabled:false, options:[], counts:{ready:0,submitted:0} }` |
| `GET /api/claims/nearsite?fresh=1` | `nearsite` | `NearsiteClaimsResponse` (60 s server cache; `fresh=1` skips it) | `{ enabled:false, claims:[] }` |
| `POST /api/claim/[claimId]/ask` | `chat` | `AskResponse`. Body `AskRequest`. 400, 413 (>4 KB), 429 (30/IP/10 min), 502 `agent_error`/`db_error` | 200 `{ ok:false, say:"The agent is switched off.", … }` |
| `POST /api/claim/[claimId]/add-outside` | `addOutside` | `AddOutsideResponse`. Body `{ listingId, user? }`. 201 added, 200 `alreadyOnClaim`, 404, **409 `no_address`**, 429, 502, 504 `timeout` | 503 `feature_off` |
| `GET /api/properties/[id]/find-phone` | `findPhone` | `PhoneLookup` (latest saved, 90 days) | `{ state:"off", … }` |
| `POST /api/properties/[id]/find-phone` | `findPhone` | `PhoneLookup`. Body `{ by? }`. 404, 429, 502 `lookup_error` | `{ state:"off", … }` |
| `GET /api/properties/[id]/outreach` | `templates` | `OutreachResponse { enabled, outreach: OutreachStatus \| null }` | `{ enabled:false, outreach:null }` |

Things to know:
- **Outside homes** come fitting-first, then by rank. `lat/lng` are null for most Furnished Finder homes (list row only, no pin). `precision`: `exact` | `approx` | `area` (dashed) | null. `fits:false` homes carry `excludedBy` (`rent`, `beds`, `distance`, `available_late`, `no_price`, `no_location`). `score` is null today for every outside home (the search does not score them yet): rank is what orders them. `inPropertyDb` + `propertyItemId` means the home may also be a normal pin: don't draw it twice. `searchId:null` = the agent has not searched this claim yet (offer "open" in the chat).
- **Scores**: only claims the matcher has scored have any (few today): an empty list is normal, fall back to Nearest. `stretchBy` is dollars over the cap, null when the stretch is about distance.
- **Chat**: the server keeps no transcript. Keep `ChatMessage[]` in component state; show `say`. A call can take up to ~100 s (the search runs inside it): show the running state while the request is pending. `running:true` in the answer means it is still going: re-read `/outside` after a while. After any `ok:true` answer, re-read `/outside`. `summary` = homes that fit and how many are new. Actions: `open` (first thing when the chat opens), `message` (needs `message`, ≤1000 chars), `reject` / `more_like` (need `listingId`), `undo`. Send `user` (the name remembered on the device) when you have it.
- **Undo** goes back one search version and starts a new search (it counts against the daily search budget). Undo twice returns to where you were. With nothing to undo it answers `"There is no earlier search to go back to."` without calling the agent.
- **Add outside**: on 409 `no_address` show the message and point to the "Ask for the address" template. With `MONDAY_DRY_RUN=1` it answers `{ ok:true, dryRun:true, propertyId:null, subitemId:null }` and sends nothing. After 201, re-read the claim and `/outside` (`onClaim` flips).
- **Submit status** is read-only here: there is no route that changes it. States `todo` → `ready` → `submitted`, or `blocked` with `reason`. Options without a row are `todo`.
- **Nearsite claims**: `mondayItemId` is the item on the Nearsite Claims board, not the Claim Process Board; the outside/scores/ask routes accept it as `claimId`. `/api/claim/[claimId]` (Monday read) is built for the Claim Process Board, so open a Nearsite claim on the map from its own `lat/lng` and needs.
- **Find phone**: GET first. `state:"not_found"` with `lookedUpAt:null` = never looked (idle). POST runs the lookup (can take 30 s). Saving a found number on the property is the existing Edit form's job, not this route.
- **Mine / All** needs no route: filter `ActiveClaim.accountManager` / `NearsiteClaim.assignedTo` against the name remembered on the device.

## 3. Helpers
- `lib/text-templates.ts`: `TEXT_TEMPLATES` (`availability`, `address`, `rate`, each with a `label`) and `templateText(key, { to, address, from, beds, city, moveIn })` → the text for `quoMessageUrl(phone, text)`. Pure, same tone as `draftText`.
- `lib/map-agent.ts` (pure): mappers, `cleanText`, `UUID_RE`, `ID_RE`. Server code; UI should not need it.
- `lib/agent-chat.ts` (server only): `askAgent`, `addOutsideHome`.

## 4. shadcn primitives (in `components/ui`, same style as `button.tsx`)
`toggle`, `toggle-group`, `tabs`, `tooltip`, `textarea`, `badge`, `popover`, `scroll-area`, `dropdown-menu`. Written by hand to the shadcn new-york source (the CLI fails in this repo because of `deno.lock`). No new npm packages: all from `radix-ui`. Portalled content uses `z-50`.

## 5. Fixtures (`tests/fixtures/map-agent.mjs`)
`HEALTH_ON` / `HEALTH_OFF`, `FEATURES_ON` / `FEATURES_OFF`, `CLAIM_ID`, `LOSS`, `HOME` (ids by case), `OUTSIDE` (8 homes) / `OUTSIDE_EMPTY` / `OUTSIDE_OFF`, `SCORES` (6) / `SCORES_OFF`, `SUBMIT_STATUS` / `SUBMIT_STATUS_OFF`, `NEARSITE_CLAIMS` (5) / `NEARSITE_CLAIMS_OFF`, `ASK.{open,message,reject,moreLike,undo,nothingToUndo,running,answer,off,rateLimited,failed}`, `CHAT_MESSAGES`, `ADD_OUTSIDE.{added,already,dryRun,noAddress,off}`, `PHONE.{found,foundLow,notFound,idle,off,rateLimited}`, `OUTREACH.{sent,replied,none,off}`, `RAW` (database-side shapes, for mapper tests only). All fictional.

```js
await page.route("**/api/health", (r) => r.fulfill({ json: HEALTH_ON }));
await page.route("**/api/claim/*/outside", (r) => r.fulfill({ json: OUTSIDE }));
```

## 6. Database (for the DevOps and QA steps)
`supabase/migrations/20261126_map_agent.sql`, additive, **not applied**. Functions: `map_claim_refs`, `map_claim_context`, `map_outside_homes`, `map_claim_scores`, `map_submit_status`, `map_nearsite_claims`, `map_outreach_status`, `map_phone_lookup_guard` / `_save` / `_get`; table `map_phone_lookups`. All take the server secret first. Check after applying: `tests/sql/map-agent-rollback.sql`.
Measured on the live data in a rolled-back transaction: `map_outside_homes` for a 63-home claim about 9 ms warm (about 500 ms the first time on a cold cache); 46 ms for the largest run (182 homes).

## 7. What differs from the brief
- Two extra SQL functions (`map_claim_refs`, `map_claim_context`) and one extra route (`/api/properties/[id]/outreach`, so `map_outreach_status` has a caller).
- The Search Chat workflow has no "undo" action and no "address unknown" refusal. Undo is sent as the message "Go back to version N-1" (the workflow's own revert). The 409 `no_address` is decided by the map before calling the workflow, with the workflow's own rule; left alone, the workflow would add a sub-item with no property behind it.
- `add-outside` answers 503 `feature_off` when off (it has no `enabled` field to carry).
- The phone webhook gets `x-map-secret` from its own optional `MAP_PHONE_TOKEN`, not the database secret.
- `tsconfig.json` gained `allowImportingTsExtensions` so `lib/text-templates.ts` can import `./quo-links.ts` and still run under `node --test`.
