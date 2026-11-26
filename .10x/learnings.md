# Learnings

## Design — map agent UI (26 Nov 2026)
- Google's zoom control sits bottom-right of the map today, exactly where the chat bubble goes. Move it (`zoomControlOptions.position = RIGHT_TOP`) when the agent flag is on, and keep the bubble 24 px up so the attribution strip stays readable.
- Render the bubble and chat window inside the map's `div.relative` in `MapApp.tsx`, not `fixed`. That is what keeps them off the docked panel for free. On phones the bubble must follow `sheetSnap` (68 px, `50dvh + 12px`, hidden when expanded or when the property panel overlay is open).
- The floating `MapKey` is `max-w-[calc(100%-24px)]` and wraps. With a seventh entry it collides with the bubble at 360 px and with the open chat on desktop. It needs the `short` labels and a narrower max-width; with the panel docked at 1024 px the map is only 304 px wide, so the chat covers nearly all of it.
- `FitRow` already has an unused amber `warn` state ("!"). Stretch uses it; no new colour or component. Likewise the radius picker's segmented look serves the sort toggle and Mine / All.
- Outside pins must be their own unclustered layer and be removed (not dimmed) when filtered off, so flags-off and filter-off both give today's map. Use `.nh-pin--outside` + `.nh-src`; z-index 400–500.
- Speech-to-text needs `allow="microphone"` on the Monday iframe and does not exist in Firefox: feature-detect, hide the mic, never show a dead button. `Esc` should close the chat only when focus is inside it, so it does not fight the panel and drawer.

## Foundation — map agent shared layer (26 Nov 2026)
- `npx shadcn add` fails in this repo: it sees `deno.lock` and tries `deno add`. Write primitives by hand from the new-york source with the unified `radix-ui` import.
- Unit tests run lib files with Node's type stripping: only `import type` from siblings works without an extension, a value import needs `./file.ts` (tsconfig now allows it), and constructor parameter properties (`constructor(private x)`) do not run at all.
- The Search Chat webhook answers only when its search is done (up to ~2 min) and its answer has no `next` field and no sub-item or property id: after an add, read the ids back from the database (`map_claim_context`).
- The webhook has no undo action and whitelists actions, so `apply`/`revert` cannot be sent directly. Undo = the message "Go back to version N"; it creates a new version and re-runs the search.
- The workflow's "add" does not refuse a home with no address: it adds a sub-item without a PROPERTY DATABASE link. The map refuses first (409 `no_address`).
- A Monday claim item maps to the search system three ways: `search_claims.claim_ref` (Claim Process Board; `typed_matches.claim_ref` is this item id), `nearsite_claims.monday_item_id` (Nearsite Claims board 18438016194), and `nearsite_claims.handoff_detail->>'item_id'` (after handoff). Resolve once per request.
- Outside homes carry no score yet (`search_run_results.score` is empty) and most Furnished Finder homes have no coordinates. Only a handful of claims have `typed_matches`. UI must cope with both being empty.
- `nearsite_matches.stretch` mostly means "far", not "over budget": a stretch amount exists only when the rent is above the cap.
- Validating SQL without applying it: send `begin; <file>; do $$ … raise exception 'ROLLBACK-TEST %' … $$; rollback;` through the connector and read the result from the error; then confirm in `pg_proc` that nothing stayed.
