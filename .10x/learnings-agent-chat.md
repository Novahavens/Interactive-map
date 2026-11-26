# Learnings — agent chat (26 Nov 2026)

- `globals.css` locks page scroll (`html, body { overflow: hidden }`). A dev preview taller than the screen must scroll inside its own `h-dvh overflow-y-auto` box, and Playwright's `fullPage` screenshot then captures only the viewport: grow the viewport to the box's `scrollHeight` instead.
- React dev mode double-mounts: an unmount cleanup that aborts the in-flight request kills the first `open` call. Defer the abort one tick and skip it if the component re-mounted.
- Stop and "claim changed" abort on purpose; only a timeout or a network failure should become the error state. Track `timedOut` separately from `signal.aborted`, and ignore any answer whose controller is no longer the current one.
- Speech: feature-detect after mount (keep `supported=false` on the server so the markup matches), check `document.permissionsPolicy.allowsFeature("microphone")` for the Monday iframe, and treat `not-allowed` as "hide the mic for the session". Tests inject a fake `webkitSpeechRecognition` with `addInitScript`.
- Radix Sheet's `onCloseAutoFocus` must `preventDefault()` and focus the bubble by id, because the sheet is opened from a bubble that may have re-rendered.
- Playwright is installed globally only (`$(npm root -g)/playwright`, `NODE_PATH`); `require("playwright")` from a script outside the repo needs the full path.
