# Learnings — outside panel and submit status (26 Nov 2026)

- The root font is 14 px, so Tailwind's `h-5` is 17.5 px and `h-10` is 35 px. When the spec gives pixels (20 px dot, 20 px skeleton), write `h-[20px]`.
- `body` does not scroll in this app. A dev preview page needs its own `h-dvh overflow-y-auto`, and Playwright's `fullPage` screenshot comes out mostly blank: screenshot elements instead.
- `OutsideHome` says `hasPhone` but carries no number, and no "other claims" list. So the panel cannot open a text or show the "already on another claim" confirm by itself.
- `SubmitStatus.reason` is free text from the database, not a code. Map the codes you know and show the rest as a sentence.
- Playwright is not in `node_modules`. In an `.mjs` test, `createRequire(import.meta.url)("playwright")` finds the global one; a bare `import("playwright")` does not.
- A `.tsx` file cannot import `tests/fixtures/map-agent.mjs` (`allowJs` is off): copy what the preview page needs into typed consts. The browser test can import the fixture directly.
