# Map agent UI — design spec (26 Nov 2026)

Mock: `.10x/specs/mock.html` (open in a browser; **Theme** button flips `data-theme`). All data in this spec and the mock is fictional.
Every feature sits behind its own flag (default off). Flag off = the piece is not rendered and today's UI is unchanged, except Find phone, which renders a disabled "Not set up yet" state when its *button* flag is on and its *provider* flag is off.

Rules that hold everywhere:
- Status colours stay green circle / yellow diamond / red square. Outside homes use **ink only** (outline + letter). No fourth colour.
- Every state has text or a glyph as well as colour. Touch targets 44 px on coarse pointers (reuse the existing `[@media(pointer:coarse)]:h-[44px]` pattern).
- Tokens only (`--ink`, `--line2`, `--ok-*` …), so light and dark are the same markup.

---

## 1. Layout maps

### Desktop (lg+)

```
┌ header: [Claims 18]  Nova Havens / Claims / Ramirez family ……………………………… [Refresh] ┐
├── rail w-80 ────────┬── map (flex-1) ──────────────────────────┬── panel w-[400px] ──┤
│ search              │                              [+/−] zoom  │ header              │
│ radius              │   pins: ● ◆ ■  ✓  (7)                    │  [Z From Zillow]    │
│ filters             │   NEW outside pins  [Z $3.1k] [F ≈ $2.8k]│ Fit against this    │
│ key pills           │                                          │ claim               │
│  ● ◆ ■ [ZF Outside] │                  ┌─ AgentChat 360×520 ─┐ │  NEW MatchScore     │
│ The family needs    │                  │ head · Undo · ×     │ │  NEW Stretch row    │
│ Claim information   │                  │ messages (log)      │ │ Contacts            │
│  "3 ready · 2 sub." │                  │ result summary      │ │  NEW FindPhone      │
│ count  [Best|Near]  │                  │ suggestion chips    │ │  NEW Text ▾ + status│
│ ┌ results <ul> ───┐ │                  │ prompt box  🎤 ↑    │ │ Notes & links       │
│ │ ResultRow       │ │                  └─────────────────────┘ ├─────────────────────┤
│ │ NEW OutsideRow  │ │ ┌ MapKey (narrowed) ┐          (bubble)◯ │ PanelFooter         │
│ └─────────────────┘ │ └ + Outside entry ──┘   bottom-6 right-3 │  NEW SubmitStatus   │
└─────────────────────┴──────────────────────────────────────────┴─────────────────────┘
```

### Phone (< lg, 360 px)

```
 chat closed                         chat open (modal bottom sheet)
┌──────────────────────────┐        ┌──────────────────────────┐
│ header                   │        │ header (under scrim)     │
│ map              [+/−]   │        ├──────────────────────────┤
│   pins                   │        │ Housing agent  [Undo][×] │
│                          │        │ messages                 │
│ ┌ MapKey ──────┐         │        │ result / running status  │
│ │ short labels │   (◯)   │ ← 68px │ suggestion chips         │
│ └──────────────┘ bubble  │        │ prompt box        🎤  ↑  │
├── ResultsSheet bar 56px ─┤        └──────────── 88dvh ───────┘
└──────────────────────────┘
```

Claims drawer (left sheet, 360 px): `title → Tabs [Claims n | Nearsite n] → toolbar [Mine|All] [Test claims] [Refresh] → name line → search → list`.

---

## 2. Components

### New

| Name / file | Purpose | Props | States |
|---|---|---|---|
| `AgentBubble` `components/AgentBubble.tsx` | Round button that opens/closes the chat | `{ open: boolean; onToggle(): void; running: boolean; newCount: number; sheetSnap?: SheetSnap; hidden?: boolean }` | closed, open (chevron-down), running (spinner ring), badge (`newCount > 0`), hidden |
| `AgentChat` `components/AgentChat.tsx` | Chat window: log, chips, prompt box | `{ open: boolean; onClose(): void; claim: { id: string; name: string; frv: number \| null } \| null; selectedHome: { id: string; name: string } \| null; messages: ChatMessage[]; status: AgentStatus; canUndo: boolean; onSend(text: string, via: "typed" \| "voice" \| "chip"): void; onStop(): void; onUndo(): void; onRetry(): void; onOpenClaims(): void; modal: boolean }` where `type AgentStatus = { kind: "idle" } \| { kind: "running"; startedAt: number } \| { kind: "error"; message: string }` | no claim, empty, idle, running, error, listening, mic blocked |
| `SortToggle` `components/SortToggle.tsx` | "Best match \| Nearest" (shadcn `toggle-group`, single) | `{ value: "match" \| "nearest"; onChange(v): void; matchDisabledReason?: string; loading?: boolean }` | match, nearest, match disabled, scores loading |
| `OutsideRow` `components/OutsideRow.tsx` | List row for an outside home | `{ home: OutsideHome; score: MatchScore \| null; selected: boolean; hovered: boolean; onSelect(id: string): void; onHover(id: string \| null, from?: HoverSource): void }` | exact, area only, list only, new, on this claim |
| `OutsidePanel` `components/OutsidePanel.tsx` | Panel body for a home not in our database | `{ home: OutsideHome; score: MatchScore \| null; needs: ClaimNeeds \| null; claim: PanelFooterProps["claim"]; attached: boolean; onAttached(id: string, subitemId: string): void; onClose(): void }` | loading (8 skeleton bars), ready, load error, listing gone |
| `MatchScore` `components/MatchScore.tsx` | Score card on top of "Fit against this claim" | `{ score: MatchScore \| null; loading?: boolean }` | loading, ready, none (renders nothing) |
| `SubmitStatus` `components/property/SubmitStatus.tsx` | 3-step line in the footer for homes on the claim | `{ state: SubmitState \| null; loading?: boolean }` | to do, ready, submitted, blocked ×2, loading, unknown |
| `FindPhone` `components/property/FindPhone.tsx` | Lookup when Contacts has no number | `{ propertyId: string; enabled: boolean; name: string \| null; address: string \| null; onSaved(phone: string): void }` | idle, searching, found, not found, off, error, saving |
| `TextTemplates` `components/property/TextTemplates.tsx` | Menu on the Text button + status line | `{ number: string; shown: string; templates: TextTemplate[]; outreach: OutreachStatus \| null; onPick(t: TextTemplate \| null): void }` | closed, open, no templates (plain Text link as today) |
| `SourceBadge` (in `components/StatusDot.tsx`) | The Z / F letter square | `{ source: "zillow" \| "furnished_finder"; size?: "sm" \| "md"; listOnly?: boolean }` | filled, list-only (dashed) |

Types (short form, `lib/types.ts`):

```ts
type OutsideSource = "zillow" | "furnished_finder";
interface OutsideHome { id: string; source: OutsideSource; name: string; address: string | null;
  lat: number | null; lng: number | null; approximate: boolean; bedrooms: number | null; bathrooms: number | null;
  monthly_rate: number | null; furnished: boolean | null; pet_status: string | null; distance_miles: number | null;
  url: string; isNew: boolean; contactName: string | null; contactPhone: string | null; checkedAt: string | null }
interface MatchScore { homeId: string; score: number /* 0–100 */; band: "strong" | "fair" | "weak";
  why: string /* ≤ 90 chars */; stretch: { amount: number; frv: number } | null }
interface ChatMessage { id: string; role: "user" | "agent"; text: string; at: string;
  result?: { homes: number; isNew: number; searchId: string } }
type SubmitState =
  | { step: "todo" | "ready" | "submitted"; approvedBy: string | null; at: string | null }
  | { step: "blocked"; reason: "claim_closed" | "already_submitted"; at: string | null };
type PhoneLookup = { status: "found"; phone: string; source: string; confidence: "high" | "medium" | "low" }
  | { status: "not_found"; checkedAt: string } | { status: "off" };
interface TextTemplate { key: "availability" | "address" | "rate"; label: string; body: string }
interface OutreachStatus { askedAt: string; repliedAt: string | null }
```

### Modified

| File | Exact change |
|---|---|
| `MapApp.tsx` | Replace the caption `green first, then nearest` with `<SortToggle>` in the count row. Mix `OutsideRow`s into `resultRows`. Render `<AgentBubble>` + `<AgentChat>` **inside the map `div.relative`** (so they can never sit over the docked panel). Pass `chatOpen` to the floating key wrapper (see §5). `countLabel` gains ` · 12 outside` when there are any. |
| `MapCanvas.tsx` | New props `outsideHomes: OutsideHome[]`, `outsideHidden: boolean`, `avoid: { right: number; bottom: number } \| null`. New `buildOutsidePin()` and a third, unclustered marker layer. When the agent flag is on: `zoomControlOptions.position = RIGHT_TOP`. `fitBounds` and the pan-to-selected check use `avoid` as right/bottom padding. |
| `MapKey.tsx` | Rail variant: one more toggle pill **Outside n** after "Do not use" (new props `outsideCount`, `outsideHidden`, `onToggleOutside`). Floating variant: one more plain entry `Outside listing (n)`; new prop `short` (phones) uses the labels `On claim (n)`, `Grouped`, `Outside (n)`. |
| `ResultRow.tsx` | Optional `score?: MatchScore`: adds a leading score chip. No other change. |
| `lib/chips.ts` | `scoreChip(score)` → `{ key: "score", label: "Match 82 · Strong", tone }` (strong = `ok`, fair = `info`, weak = `muted`); `outsideChips(home, score)` → source (new `line` look), `New` (`info`), `≈ Area only` / `List only` (`muted`), `Stretch +$150` (`amber`). `ChipTone` unchanged; add optional `line?: boolean` to `Chip`. |
| `StatusChips.tsx` | Apply `nh-chip--line` when `c.line`. |
| `components/property/fit.tsx` | `computeFit` takes an optional `stretch`. When set, the "Within FRV" row becomes state `warn` (the amber "!" that already exists and is unused), title `Stretch · $150 over`. |
| `PanelFooter.tsx` | Props `outside?: { addressKnown: boolean }` and `submit?: SubmitState \| null`. Outside home posts to `/api/claim/[id]/add-outside`. Helper line and blocked note per §3.4. Attached state renders `<SubmitStatus>` under the "On this claim" banner. |
| `PropertyPanel.tsx` | `<MatchScore>` as the first child of "Fit against this claim". `<FindPhone>` where `owner_phone` / `landlord_phone` is empty. |
| `ContactActions.tsx` | Text becomes a menu trigger when templates exist (`<TextTemplates>`); outreach line under the number row. Call unchanged. |
| `ActiveClaimsDrawer.tsx` | shadcn `tabs` (Claims / Nearsite) under the header. Toolbar gains Mine / All; "Show test claims" is relabelled **Test claims** so the row fits 360 px. Count line per claim. |
| `ClaimBrief.tsx` | Prop `submitCount?: { ready: number; submitted: number }`, shown right-aligned in the "Claim information" summary row. |
| `ResultsSheet.tsx` | No layout change. `MapApp` reads `sheetSnap` to place the bubble. |
| `lib/quo-links.ts` | `draftText` accepts a template body. |
| `globals.css` | New classes in §4 and §5. |

Reused as is: `Section`, `FitRow`, `LinkChip`, `KeyFacts`, `StatusChips`, the segmented-control look of the radius picker (for SortToggle and Mine / All), the amber / bad / ok note boxes from `PanelFooter`, `.nh-skeleton`, Radix `Sheet` (phone chat, drawer), `readReporterName()`.

---

## 3. Features

### 3.1 Outside homes
- **Where:** pins (§4), rows in the same `<ul>`, one key entry.
- **Row:** `SourceBadge` in the dot slot · name (address, or `≈ Near Maple Ridge` when area only, or the listing title when list only) · `3 bd · 2 ba · furnished` · rent · distance (`4.0 mi`, `≈ 5 mi`, or `no pin`). Chips in this order: score, source, New, location, Stretch. One "why" line under the chips for the top 3 outside rows only.
- **List only** (no coordinates): badge is dashed, chip `List only`, title attribute `This listing has no map location`. Hover does not touch the map. In **Nearest** these sit last under a divider `No map location (3)`. In **Best match** they sort by score like any other row.
- **Key = filter:** rail pill `Outside 12`, `aria-pressed`, title `Zillow and Furnished Finder listings that are not in our database yet. Click to hide.` Off: pins hidden and rows removed (outside pins are hidden, not dimmed, so the map goes back to exactly today's view).
- **Cap:** the map draws at most 50 outside pins (highest score first). Above that, a line under the count row: `Showing the best 50 outside homes on the map.`
- **States:** loading → 3 skeleton rows after our rows + spinner in the floating key (existing). Empty → nothing extra in the list; the key pill shows `Outside 0` and is disabled. Error → one line in the list, `Couldn't load outside listings. Try again` (button). No claim open → feature is absent.
- **A11y:** row is a `button` with `aria-pressed`; accessible name `905 Larkspur Ln, outside listing from Zillow, $3,100, match 77, new`. Pin label in §4.

### 3.2 Best match
- **Toggle:** `role="radiogroup"` `aria-label="Sort homes"`, arrow keys move. Default **Best match** when a claim is open and scores loaded, else **Nearest**. Choice kept in `localStorage["nh-sort"]`.
- **Best match** order: score, highest first; ties by distance. Red (do not use) homes always last. Homes already on the claim are not pulled to the top.
- **Nearest** keeps today's order ("green first, then nearest"); that phrase moves to the Nearest option's `title`.
- **Copy:** bands `Strong` (75–100), `Fair` (50–74), `Weak` (0–49). Chip `Match 82 · Strong`.
- **Panel card (`MatchScore`):** `82 / 100`, band chip, 4 px ink bar (`role="img"` `aria-label="Match score 82 out of 100"`), then `Why: Right size, pets ok, 2.1 mi from the loss address. $150 over the FRV.`
- **Stretch:** fit row, amber "!", title `Stretch · $150 over`, text `$3,350/mo is $150 above the FRV of $3,200. Ask before you offer it.` Row chip `Stretch +$150`. Over the stretch limit the row stays as today's red "Within FRV" failure.
- **States:** loading → `Scoring homes for this claim…` under the count row, list stays in Nearest order until scores land (no reshuffle mid-read: apply on arrival only if the user has not scrolled). No claim → Best match disabled, `Pick a claim to sort by best match.` Error → `Couldn't score these homes. Showing nearest first.` + `Try again`.

### 3.3 Agent chat
See §5 for size and position.
- **Empty (claim open):** agent line `Tell me what the family needs, or tap a suggestion.` + chips.
- **No claim:** `Pick a claim first. The agent searches for one claim at a time.` + button `Open claims`. Prompt box disabled.
- **Send:** Enter sends, Shift+Enter adds a line. Textarea grows 1–5 lines, then scrolls. Max 500 chars.
- **Chips:** `Within 10 miles` · `Show unfurnished` · `Cheaper` · `More like this one` (only when a home is selected; sends `More like 1418 Juniper Ct`). A chip sends at once. Chips are disabled while a search runs.
- **Mic:** shown only if `window.SpeechRecognition || window.webkitSpeechRecognition` exists. Tap to start, tap again to stop; text lands in the box, the person still presses Send. Listening: box border turns ink, placeholder `Listening… speak now`, helper `Tap the mic to stop`, button `aria-pressed="true"`. Permission refused: hide the mic for the session and show once `The microphone is blocked here. You can still type.`
- **Running (20–90 s):** status card `Searching Zillow and Furnished Finder…`, thin bar, `0:34 · usually under 90 seconds. You can keep using the map.`, button `Stop`. Send is disabled; typing is allowed. Bubble shows a spinner ring so the search is visible with the chat closed. After 120 s: treat as error.
- **Result:** agent message + summary card `12 homes · 4 new` · `Map and list updated` · `Undo`. Pins and list update when the card appears; the map refits to the results (respecting `avoid`). Closed chat: bubble badge shows the number of new homes until opened.
- **Undo:** restores the previous search's homes, pins, list and map view; agent line `Back to the search before: 9 homes within 15 miles.` Disabled when there is no earlier search. History is per claim, in memory, max 10.
- **Stop:** `Search stopped. Nothing changed on the map.`
- **Error:** `The search didn't finish. Nothing changed on the map.` + `Try again` (resends the last message).
- **A11y:** bubble `button`, `aria-label="Ask the housing agent"` / `"Close the housing agent"`, `aria-expanded`, `aria-controls`. Window `role="dialog"` `aria-label="Housing agent"`. Log `role="log"` `aria-live="polite"`. Running card `role="status"`. Each message starts with a visible `You` / `Agent` label (not colour alone).

### 3.4 Add outside home to claim
- Same `PanelFooter`, same button `Add to claim`, same "Adding to: Ramirez family · Dana Whitfield" line and "already on another claim" confirm.
- Helper line (replaces the "One sub-item…" line for outside homes): `Also saves this home to our database. Starts as “To Do”.`
- Adding: `Adding to claim…` (existing). Done: banner `On this claim`, line `Added Nov 26 by Dana · saved to our database · Monday →`. The pin turns into the black "on this claim" pin; the row keeps its source chip.
- **Blocked — address unknown:** amber note `Ask the landlord for the address first. We can't add a home without a street address.` Button disabled. Under it a shortcut `Text: Ask for the address` (opens that template; hidden when there is no number).
- Error: existing red box, `Not added. <reason>`.

### 3.5 Submit status
- Three steps in the footer of any home on the claim: `To Do` → `Ready to Submit` → `Option Submitted`. Current step is a filled ink dot with its number; done steps show ✓; later steps are hollow. `<ol aria-label="Submit status: Ready to Submit, step 2 of 3">`.
- Line under it: `Approved by Theo Brandt · Nov 25` / `Submitted Nov 26 · approved by Theo Brandt`. No approver yet: no line.
- Blocked replaces the steps with a red note + ban icon: `Blocked: claim closed. This home can't be submitted.` / `Blocked: already submitted. This home was sent on Nov 20.`
- Loading: one skeleton bar, 20 px. Unknown / error: steps hidden, existing line `Sub-item created · “To Do” · open on Monday →` stays.
- Claim card count: `3 ready · 2 submitted` in the "Claim information" row and under each claim in the drawer. Zero of both with options: `0 ready · 0 submitted`. No options: `No options yet`.
- Read-only in this release (see Q1).

### 3.6 Mine / All
- Segmented control in the drawer toolbar, `role="radiogroup"` `aria-label="Whose claims"`. Default **All** until a name is known, then **Mine**; choice kept in `localStorage["nh-claims-scope"]`.
- Match: `localStorage["nh-reporter-name"]` vs `accountManager`, case-insensitive, trimmed; a typed first name alone matches the first word.
- Name line under the toolbar: `Showing 5 claims for Dana · Change name`.
- **No name remembered** and Mine pressed: inline form in place of the name line. Label `Your name, as it is on Monday`, input, `Save`, helper `Remembered on this device only. Showing all claims until then.` Enter saves; focus moves to the search box.
- Empty: `No claims with Dana as account manager.` + `Show all`.
- The header count stays the count of all claims.

### 3.7 Nearsite tab
- Tabs `Claims 18` | `Nearsite 6` (shadcn `tabs`; arrow keys switch). Description line: `Nearsite claims that are still open.` Search box applies to the open tab.
- Row: name · city · `4 bd · 2 ba · budget $3,600/mo` (`budget not set`) · `Fee group B · 3 homes found`. Right side: days left, then owner or `Free for all`, then the button.
- Days left chip: `Due today` (bad, outlined), `2 days left` (amber, ≤ 5), `9 days left` (muted). Sort: soonest first.
- **Free for all:** outlined chip `Free for all` + button `Pick up`. Owned: account manager tag + button `Open`. Both open the claim on the map (same as picking a claim today). Mine / All applies: Mine = mine + free for all.
- Loading `Loading Nearsite claims…`. Empty `No open Nearsite claims.` Error: existing red box. Off: no tabs row at all.

### 3.8 Find phone
Shown in Contacts only when that contact has no number.

| State | Copy | Controls |
|---|---|---|
| Idle | `No phone number yet` | `Find phone` |
| Searching | `Looking for a number…` / `Takes up to 30 seconds.` | button disabled, `role="status"` |
| Found | `(918) 555-0142` + `Public records · likely right (high)` | `Call`, `Text`, `Save to listing`, `Not right` |
| Not found | `No number found.` / `Checked Nov 26. Try the listing page, or text through the listing site.` | `Try again` (once per day) |
| Off | `No phone number yet` / `Not set up yet.` | `Find phone` disabled, `aria-disabled`, reason in `aria-describedby` |
| Error | `Couldn't look that up. Nothing was saved. Try again in a minute.` | `Find phone` |

Confidence words: high `likely right`, medium `may be right`, low `a guess: check before you call`. `Save to listing` uses the existing edit route and shows the existing saved banner. `Not right` returns to Idle and the number is not saved. Nothing is written until Save.

### 3.9 Text templates and outreach status
- The Text button gets a small chevron and opens a shadcn `dropdown-menu`: `Ask availability`, `Ask for the address`, `Confirm the rate`, separator, `Blank text`. Each item shows the first line of the message in muted text. Picking one does exactly what Text does today (copy the number, open Quo) with that draft.
- Bodies (`{first}` = contact first name, `{from}` = remembered name, `{addr}` = address or "your listing"):
  - Ask availability: `Hi {first}, is {addr} still available from Dec 8? It's for a family placed by their insurance, about 6 months. Thanks, {from} at Nova Havens`
  - Ask for the address: `Hi {first}, could you send the street address of {addr}? We need it to offer the home to a family. Thanks, {from} at Nova Havens`
  - Confirm the rate: `Hi {first}, can you confirm $3,350 a month for {addr}, and what the deposit is? Thanks, {from} at Nova Havens`
- Outreach line under the number row, `aria-live="polite"`: `Asked Nov 24 · no reply yet` (muted) / `✓ Replied Nov 25` (ok ink + check icon). Nothing sent yet: no line.
- No templates flag: Text is the plain link it is today.

---

## 4. Outside pin and key entry

Markup (built in `MapCanvas.buildOutsidePin`):

```html
<div class="nh-pin nh-pin--outside [nh-pin--approx] [nh-pin--selected] [nh-pin--hover]" role="button"
     aria-label="905 Larkspur Ln, $3.1k, outside listing from Zillow, match 77[, approximate location]">
  <span class="nh-pin__chip">
    <span class="nh-src" aria-hidden="true">Z</span>
    [<span class="nh-pin__approx" aria-hidden="true">≈</span>]
    <span>$3.1k</span>
  </span>
  <span class="nh-pin__caret"></span>
</div>
```

```css
.nh-pin--outside .nh-pin__chip { border: 1.5px solid var(--ink); padding: 0 9px 0 6px; gap: 6px; } /* height 28, bg --surface: unchanged */
.nh-pin--outside .nh-pin__caret { border-top-color: var(--ink); }
.nh-pin--outside.nh-pin--approx .nh-pin__chip { border-style: dashed; }
.nh-pin--outside.nh-pin--selected .nh-pin__chip,
.nh-pin--outside.nh-pin--selected .nh-pin__caret { border-color: var(--focus); } /* caret: border-top-color */
.nh-src { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 16px;
  border-radius: 4px; background: var(--ink); color: var(--surface);
  font: 700 10px/1 var(--font-mono); }
.nh-src--sm { width: 14px; height: 14px; font-size: 9px; border-radius: 3px; }           /* key, panel header */
.nh-src--none { background: transparent; color: var(--muted); border: 1px dashed var(--line2); } /* list only */
.nh-chip--line { color: var(--ink); border-color: var(--line2); }                         /* source chip */
```

- **Letter:** `Z` Zillow, `F` Furnished Finder. Always uppercase, always on the ink square.
- **Hover / selected:** the existing `.nh-pin--hover` (scale 1.25, ink ring) and `.nh-pin--selected` (scale 1.06, 2 px focus ring) apply unchanged.
- **Filtered off:** marker removed (`map = null`), not dimmed.
- **z-index band:** `400 + round(score)` → **400–500** (above our 100–300, below attached 900 and clusters 1000+). Hover 3500, selected 4000 as today.
- **Not clustered with ours.** A cluster number means "homes in our database"; mixing would change what the number and the key say. Outside pins are their own plain layer, capped at 50.
- **After Add to claim:** the outside marker is removed and the home is drawn by the attached layer (black, check).
- **Key entry, rail:** same pill as the status pills (`h-7`, `44 px` touch), content `[Z][F] Outside 12`, the two `.nh-src--sm` squares overlap by 3 px. Off = existing off look (muted, line-through). `aria-pressed`.
- **Key entry, floating:** `[Z][F] Outside listing (12)`; phones `Outside (12)`.

---

## 5. Chat bubble and window

**Bubble** `.nh-agent-bubble`: 48 × 48, round, `background: var(--ink)`, `color: var(--bg)`, shadow `0 6px 20px rgba(0,0,0,.28)`. Icon 20 px (chat; chevron-down when open). Badge `.nh-agent-bubble__badge`: 18 px, surface fill, ink border, top-right.

Position (always a child of the map container, `position: absolute; z-index: 20`):

| Case | Bubble | Window |
|---|---|---|
| lg+, closed | `right: 12px; bottom: 24px` (24 clears Google's attribution strip) | — |
| lg+, open | same place, chevron | `.nh-agent`: `right: 12px; bottom: 84px; width: min(360px, 100% - 24px); height: min(520px, 100% - 96px)`; radius 14; **not modal** |
| < lg, sheet collapsed | `right: 12px; bottom: 68px` | — |
| < lg, sheet half | `bottom: calc(50dvh + 12px)`, 200 ms transition | — |
| < lg, sheet expanded, or property panel open | hidden | — |
| < lg, open | hidden | Radix `Sheet side="bottom"`: full width, `height: 88dvh`, radius 14 on top, scrim, **modal**; `Show on map` in the result card closes it |

Rules against other pieces:
- **Docked panel:** cannot overlap, because bubble and window live inside the map container.
- **MapKey (lg+):** while the chat is open the floating key gets `max-width: calc(100% - 396px)` and wraps. If that leaves under 200 px (map narrower than 600 px), the key shows glyphs only, labels `sr-only` + `title`.
- **MapKey (< lg):** always `max-width: calc(100% - 84px)` and the short labels, so it never runs under the bubble.
- **Zoom control:** moved to the top right (it sits bottom right today, exactly where the bubble goes).
- **Selected pin:** `MapCanvas` gets `avoid = { right: 384, bottom: 0 }` while the window is open on lg+. `fitBounds` pads by it; selecting a home that falls under the window pans it clear once (pan only, no zoom).
- **Error toast** (`top-3 left-3`) is unaffected.

Prompt box `.nh-prompt` (modelled on the common rounded AI prompt box, our tokens): 1 px `--line2` border, radius 16, padding `8px 8px 6px 12px`; borderless `textarea` on top (14 px, 1–5 rows); bottom row: hint `Enter to send` left, 32 px round icon buttons right (mic outlined, send filled ink; 44 px on touch). Focus ring on the container (`:focus-within` → 2 px `--focus`), not on the textarea.

Messages: `.nh-msg--me` right, ink fill, bg-colour text; `.nh-msg--agent` left, `--surface-muted` fill, 1 px `--line`. 13 px, radius 14, max width 86%. Result card `.nh-result`: full width, 1 px `--line2`.

Focus:
1. Open (click, Enter or Space on the bubble) → focus the textarea.
2. lg+: no focus trap; Tab order is bubble → window (Undo, Close, log, chips, textarea, mic, send) because the window follows the bubble in the DOM. The map and list stay usable.
3. **Esc** closes when focus is inside the window (or the phone sheet is open) and returns focus to the bubble. Esc elsewhere keeps doing what it does today.
4. Phone: Radix traps focus and restores it to the bubble on close.
5. A new agent message does not steal focus; the log announces it.
6. `prefers-reduced-motion`: no open/close animation, no bubble move transition.

---

## 6. Open questions (not blocking)

1. **Can a person change the submit step from the map?** Recommendation: no, read-only now. The step is set in Monday; the map shows it and who approved. Add a "Mark ready" button only after sign-in ships, so the approver is a real identity.
2. **Does "Pick up" on a free-for-all Nearsite claim assign it to me?** Recommendation: not yet. It opens the claim on the map; assignment stays in Monday until sign-in (a typed name is not strong enough to claim work).
3. **Where does Stretch end?** Recommendation: the back end decides and sends `stretch` (or not). UI default if it sends nothing: up to 10% over the FRV is Stretch, more is the red "above the FRV" row.
4. **Microphone inside the Monday iframe.** Speech needs the embedding iframe to allow `microphone`, and Firefox has no speech API. Recommendation: ship with the mic hidden wherever it is unsupported or blocked (as specified) and test in the real Monday view before promising voice.
