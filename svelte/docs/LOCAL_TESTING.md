# Local testing

Run the full automated suite from `svelte/`:

```bash
cd svelte
bun install
bun run test:local
```

That single command:

1. Copies QA clips into `tests/fixtures/media/` (no Mac paths required)
2. Starts the dev server on `:5174` if it is not already running
3. Runs **60 unit tests** + **production build**
4. Runs **6 Chrome gates in a visible window** (headed by default) and writes JSON (+ optional PNG) to `.artifacts/`

## Local QA media (your machine)

For real clips + Redline.wav from `~/Downloads/archive (2)`:

```bash
cd svelte
bash scripts/link-qa-media.sh   # symlinks 8 mp4s + redline.wav into tests/fixtures/media/
bun run dev --host 127.0.0.1
# open http://127.0.0.1:5174/?qa=1&qaAutoplay=1
```

On refresh, `?qa=1` auto-loads song + 8 clips into the rack (same as manual upload, but persistent for dev).

`test:local` uses `link-qa-media.sh` automatically when `~/Downloads/archive (2)` exists; otherwise it falls back to bundled tiny fixtures.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Bun** | `curl -fsSL https://bun.sh/install \| bash` |
| **Chrome or Chromium** | macOS: Google Chrome; Linux: `chromium-browser` |
| **Optional: ffmpeg** | Only if bundled QA clips missing — `setup-qa-media.sh` generates them |

Check setup:

```bash
bun run verify:setup
```

## Browser gates

| Script | Artifact | What it checks |
|--------|----------|----------------|
| `bun run verify:ui` | `ui-report.json`, `ui-smoke.png` | WebGPU probe clears, core UI labels present |
| `bun run verify:playback` | `playback-report.json`, `playback-full.png` | 8/8 clips ready, video time advances |
| `bun run verify:interaction` | `interaction-report.json` | Buttons/sliders clickable, no JS errors |
| `bun run verify:stutter` | `stutter-report.json` | Free-run video delta p95 gate |
| `bun run verify:audio` | `audio-report.json` | SoundTouch worklet registered, Essentia status |
| `bun run verify:beat` | `beat-report.json` | Beat phase/BPM transport advances |

Run browser gates only (dev server auto-starts):

```bash
bun run verify:browser
```

## Useful flags

```bash
# Skip unit tests / build (browser only, server still auto-starts)
SKIP_UNIT=1 SKIP_BUILD=1 bun run test:local

# Force headless (CI / no display)
HEADLESS=1 bun run test:local

# Capture PNGs from each gate
SCREENSHOT=1 bun run test:local

# Shorter stutter sample
STUTTER_MS=6000 bun run verify:stutter

# Dev server already running — scripts detect and reuse it
bun run dev   # terminal 1
bun run verify:browser   # terminal 2
```

## Interactive QA (manual)

```bash
bun run dev
open 'http://localhost:5174/?qa=1&qaAutoplay=1'
```

Debug hook in DevTools console:

```js
window.__BSP_QA__.snapshot()
await window.__BSP_QA__.waitForClips(8)
```

## From repo root

```bash
bun run test:svelte          # full local suite
bun run test:svelte:browser  # browser gates only
bun run dev:svelte           # dev server
```

## What still needs your eyes/ears

Automated gates do **not** replace:

- Uploading **your** clips via CLIP / drag-drop / bulk
- Listening to **your** mp3 + SoundTouch TMP/KEY by ear
- 60s knob/drag/swap session without freeze
- Screen recording for the PR

See the ship gate checklist in [`README.md`](README.md).
