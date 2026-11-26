# Handoff — pillar A, map layer (outside pins + key entry)

Flag: `outside` (the coordinator decides; none of these components read flags themselves). Leave every new prop out and the map and the key render exactly as today.

## `components/MapCanvas.tsx` — new optional props
| Prop | Type | What it does |
|---|---|---|
| `outside` | `OutsideHome[]` | Homes to draw as outside pins. Pass `pinnableOutside(homes, { drawnPropertyIds }).homes` (see below). Homes without lat/lng are skipped; at most 50 are drawn. Own unclustered layer, z-index 400–500. |
| `selectedOutsideId` | `string \| null` | `listingId` of the selected outside home (focus ring, z 4000). |
| `hoveredOutsideId` | `string \| null` | `listingId` hovered in the list or on the map (lift + ink ring, z 3500). Pans to it when off screen if `panToHovered`. |
| `outsideHidden` | `boolean` | The key's Outside pill is off: markers removed (`map = null`), not dimmed. |
| `onSelectOutside` | `(listingId) => void` | Pin clicked. |
| `onHoverOutside` | `(listingId \| null) => void` | Pointer enters / leaves a pin; also `null` on zoom. |
| `zoomTopRight` | `boolean` | Moves Google's zoom control to RIGHT_TOP (pass `true` when the `chat` flag is on). |
| `avoid` | `{ right; bottom } \| null` | Pixels covered by the open chat window (spec: `{ right: 384, bottom: 0 }` on lg+ while open). Radius fit pads by it; a selected pin (ours or outside) under it is panned clear once. |

Note: the spec names the list `outsideHomes`; the prop is `outside`. Rail filters (pets / photos / priced) dim outside pins like ours.
Also now exported (for the preview page only): `buildLossPin`, `buildPropertyPin`, `buildAttachedPin`.

## `components/MapKey.tsx` — new optional props
- Rail: `outsideCount?: number`, `outsideHidden?: boolean`, `onToggleOutside?: () => void`. Pill `[Z][F] Outside n` after "Do not use" renders only when `outsideCount` and `onToggleOutside` are both given; disabled at 0.
- Floating: `outsideCount?`, `outsideHidden?` (struck through + ", hidden"), `short?` (phones: `On claim (n)`, `Grouped`, `Outside (n)`, key stops 84 px short of the map's right edge), `chatOpen?` (lg+ with chat open: stops 396 px short and wraps; under 200 px glyphs only, labels `sr-only` + `title`). The key measures the map width itself (the offsetParent of its absolute wrapper), so the wrapper must stay a direct child of the map's `div.relative`.

## `lib/outside-pins.ts` (pure, unit-tested)
`pinnableOutside(homes, { drawnPropertyIds?, cap? }) → { homes, capped }` (drops no-coords, `onClaim`, and homes already drawn as our pin; scored first by score, then by rank; cap 50). `capped > 0` → show `Showing the best 50 outside homes on the map.` Also `sourceName`, `sourceLetter`, `outsideChipText`, `outsidePinLabel`, `outsidePassesFilters`, `outsideZIndex`, `pinWeight`, `OUTSIDE_PIN_CAP`.
CSS in `app/globals.css` (appended): `.nh-pin--outside`, `.nh-src`, `.nh-src--sm`, `.nh-src--none`, `.nh-src--overlap`, `.nh-chip--line` — usable by the row / panel pillars.

## Wiring in `MapApp.tsx`
State: `outsideHidden` (bool), `selectedOutsideId`, `hoveredOutsideId`. Pass `outside={features.outside && claim ? pinnableOutside(homes, { drawnPropertyIds: new Set(pins.map(p => p.monday_item_id)) }).homes : undefined}`, `zoomTopRight={features.chat}`, `avoid={chatOpen && lg ? { right: 384, bottom: 0 } : null}`. Rail key: `outsideCount={homes.length}` (only with flag + claim). Floating key: `outsideCount`, `outsideHidden`, `short={!lg}`, `chatOpen={chatOpen && lg}`. Selecting an outside pin opens `OutsidePanel` (other pillar). After add-to-claim, re-read `/outside`; `onClaim` drops it from this layer.

## Not done / open
- Chromium here snaps the 1.5 px outline to 1 px; the CSS is as specified.
- Checked on the preview page (`/dev/map-layer`) with stand-ins, not on a real Google map (no Maps key locally).
