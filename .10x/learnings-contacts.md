# Learnings — pillar F (contacts)

- Headless Chromium freezes input after a click navigates to a custom scheme (`openphone://`). In browser tests, record the href and `preventDefault()` in an init script; the component's click handler still runs.
- `tests/browser/contact-actions.mjs` reads real `/api/properties` from the dev server. To run it without the database, put a tiny proxy in front of the dev server that answers `GET /api/properties` and `/api/properties/:id` with fictional JSON. With a dummy Maps key Google throws page errors (`InvalidKeyMapError`, `setAttribute` of undefined) that the test counts; stub `maps.googleapis.com` to see a clean run.
- A Radix `DropdownMenuItem asChild` around an `<a>` keeps real links (middle-click, copy link) and still gives arrow/Home/Esc keyboard handling; the global link colour wins unless the item sets `text-ink!`.
- Use `aria-disabled` (not `disabled`) for Find phone when it is off or busy, so the button stays focusable and its reason in `aria-describedby` is read.
- Dates such as "Checked Nov 26" depend on the device time zone: render them after mount on the dev page, and pin `timezoneId` in Playwright.
- Two `next dev` servers must not share one worktree's `.next`; and `next build` rewrites `.next` under a running dev server, so run the browser tests before the build.
