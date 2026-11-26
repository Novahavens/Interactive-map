# Learnings — claims drawer

- `app/globals.css` gives every `[data-slot]` element an UNLAYERED `border-color: var(--line)`. It beats any Tailwind utility on shadcn primitives (tabs, toggle-group, command…), so `border-ink` on a `TabsTrigger` silently renders as the line colour. Use the important modifier (`data-[state=active]:border-ink!`).
- The root font is 14 px, so `h-11` is 38.5 px, not 44. Touch targets must be `h-[44px]` / `size-[44px]`.
- Tailwind 4 scans every file git does not ignore. Writing screenshots into `test-results/` (not ignored) while `next dev` runs triggers endless recompiles and random 500s ("Unexpected end of JSON input") in browser tests. Write screenshots outside the repo, or ignore the folder.
- The sheet's close button has no `data-slot`; reach it from `SheetContent` with `[&>button:last-child]:…` instead of editing `components/ui/sheet.tsx`.
- `/api/health` answers after the drawer is already open, so the tabs row appears late and the search input is remounted: re-focus the search box when the tabs arrive unless the person has moved focus.
- Nearsite `assignedTo` and Monday `accountManager` come as "First Last", "Last, First" or a comma list of several people; `lib/mine.ts` `ownerNames`/`nameMatches` handle all three, and a typed first name alone matches.
