# Learnings — map layer (26 Nov 2026)
- The root font size is 14 px, so `h-7` is 24.5 px, not 28. Compare pill heights with each other in tests, not with a fixed number.
- This Chromium reports (and draws) `border: 1.5px` as 1 px at every device pixel ratio. Don't assert `1.5px` from computed style.
- Fixtures mix scored and unscored outside homes. Keep the cap order and the stacking order on one rule (scored first, then by rank), or the 50 kept and the pins drawn on top disagree. `pinWeight` gives scored homes 450–500 and unscored ones 400–449.
- Pin builders are plain DOM, so a dev preview page can mount them without Google Maps or a key; the browser test runs fully offline.
- Port 3101 was taken by the main checkout's dev server; check `/proc/<pid>/cwd` before killing anything and use a free port.
- `npm run build` can fail with a `next/font` "reading '1'" error when many builds fetch Google Fonts at once; a retry passes. Stop your own `next dev` first: build overwrites `.next`.
