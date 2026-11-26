# Learnings

## Design — map agent UI (26 Nov 2026)
- Google's zoom control sits bottom-right of the map today, exactly where the chat bubble goes. Move it (`zoomControlOptions.position = RIGHT_TOP`) when the agent flag is on, and keep the bubble 24 px up so the attribution strip stays readable.
- Render the bubble and chat window inside the map's `div.relative` in `MapApp.tsx`, not `fixed`. That is what keeps them off the docked panel for free. On phones the bubble must follow `sheetSnap` (68 px, `50dvh + 12px`, hidden when expanded or when the property panel overlay is open).
- The floating `MapKey` is `max-w-[calc(100%-24px)]` and wraps. With a seventh entry it collides with the bubble at 360 px and with the open chat on desktop. It needs the `short` labels and a narrower max-width; with the panel docked at 1024 px the map is only 304 px wide, so the chat covers nearly all of it.
- `FitRow` already has an unused amber `warn` state ("!"). Stretch uses it; no new colour or component. Likewise the radius picker's segmented look serves the sort toggle and Mine / All.
- Outside pins must be their own unclustered layer and be removed (not dimmed) when filtered off, so flags-off and filter-off both give today's map. Use `.nh-pin--outside` + `.nh-src`; z-index 400–500.
- Speech-to-text needs `allow="microphone"` on the Monday iframe and does not exist in Firefox: feature-detect, hide the mic, never show a dead button. `Esc` should close the chat only when focus is inside it, so it does not fight the panel and drawer.
