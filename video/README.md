# 🎬 Property Map — launch video

A 77-second launch + tutorial video for the Nova Havens Property Map, built with [HyperFrames](https://hyperframes.heygen.com) (HTML → MP4). It teaches the four-step flow — **Pick · Find · Add · Send** — using real screen recordings of the app with fictional demo data.

Rendered video: [`docs/video/property-map-launch.mp4`](../docs/video/property-map-launch.mp4)

## Running order

| Time | Scene | What's on screen |
|---|---|---|
| 0:00 | Hook | "A family just lost their home…" typed on |
| 0:06 | Problem | 15,700-property count-up over blurred app footage |
| 0:12 | Title | Loss pin drops, properties pop in, *Property Map* — lands on the music's lift |
| 0:16 | 01 Pick | ⌘K keycaps → claims drawer → search → map jumps to the loss |
| 0:26 | 02 Find | Radius 15 mi, *Pets allowed*, prices on pins |
| 0:37 | 03 Add | Fit checks, move-in total, **Add to claim** → pin turns black |
| 0:50 | 04 Send | Summary preview → **Email** → copied + logged |
| 1:04 | Phone | Three phone screens, light and dark |
| 1:09 | Outro | Pick · Find · Add · Send, URL, "Open it from any claim in Monday" |

## How it's made

| Piece | Source |
|---|---|
| Composition | `src/index.template.html` → `python3 build.py` → `index.html` (inlines the caption groups from `captions.json`) |
| Screen footage | `capture/record.mjs` drives the app (production build on `localhost:3000`) with Playwright, mocks every API with `capture/demo-data.mjs`, and records a CDP screencast at 1.5× with a visible cursor → `assets/clips/*.mp4` |
| Voiceover | `npx hyperframes tts … -v af_heart` (local Kokoro model) → `audio/vo/*.wav`; word timings from `npx hyperframes transcribe` → `transcripts/` → `captions.json` |
| Music | "Advertime" from FreePD (CC0) — see `audio/music/CREDITS.md`. Carved under the voice with `hyperframes-audio/scripts/carve.mjs`, plus a volume envelope |
| Fonts | The app's own Geist / Geist Mono (`assets/fonts/`, SIL OFL) |
| Brief | `BRIEF.md` — the agreed message, audience and choices |

## Edit and re-render

```bash
cd video
python3 build.py              # after editing src/index.template.html or captions.json
npx hyperframes check         # lint + runtime + layout + contrast
npx hyperframes preview       # Studio: scrub, click to edit, trim on the timeline
npm run render                # → renders/property-map-launch.mp4
```

- **Change a line of narration:** regenerate its WAV with `npx hyperframes tts`, re-run `transcribe`, update `audio/vo/script.tsv` and the line's start in `make_captions.py` (and its `<audio>` `data-start`), run `python3 make_captions.py`, then `build.py`.
- **Re-record footage:** `npm run build && npm start` in the repo root (with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set), then `node capture/record.mjs <out-dir> [pick|find|add|send|hero]` (needs `playwright-core` and a Chromium; the script points at `/opt/pw-browsers`, change `executablePath` for your machine).
- If you re-run the voiceover carve, merge its `data-automation` lanes with the music's existing **volume** lane — the carve writes a second attribute and only the first one is honoured.
