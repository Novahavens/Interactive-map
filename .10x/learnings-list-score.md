# Learnings — list-score

- Radix `ToggleGroup type="single"` moves focus with the arrows but does not select. A `radiogroup` must select as it moves, so `SortToggle` handles `onKeyDown` itself. It also sends `""` when you press the option that is already on: ignore that, or the list loses its order.
- Compare ids as text. `MatchScore.propertyId`, `Pin.monday_item_id` and `OutsideHome.propertyItemId` can come in as string or number. `sortResults` uses `String()` on all of them before it removes duplicates.
- Never sort with `a - b` on distances that may be missing. `Infinity - Infinity` is `NaN`, and the sort then breaks without an error. Use a `cmp` that handles `Infinity`.
- Most Furnished Finder homes have no coordinates. Their row must not call `onHover`, because there is no pin to light up. In Nearest they go last under a divider.
- `npm run build` can fail once with `next/font` "Cannot read properties of null (reading '1')" while fetching Google fonts through the proxy. A plain retry passed. The build also overwrites the `.next` folder that a running `next dev` in the same worktree is using.
- A `"use client"` dev page that calls `notFound()` in production is prerendered with status 404 (see `.next/server/app/dev/<slug>.meta`), so it does not ship.
