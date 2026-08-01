# CLAUDE.md

This file provides guidance when working with Beat Surfer Pro — the **SvelteKit 5 + WebGPU-only** rewrite in `svelte/`.

## Commands

```bash
bun install              # from repo root (delegates to svelte/)
bun run dev              # Dev server at http://localhost:5174
bun run build            # Production build → svelte/build/ (single HTML file)
bun run preview          # Preview production build
bun run test             # vitest unit tests
bun run test:local       # Full local suite (unit + build + browser gates)
bun run link-qa          # Symlink 8 archive MP4s + Redline for local QA
```

QA URL: `http://localhost:5174/?qa=1&qaAutoplay=1`

## Architecture

**Audio Analysis → Parameter System → Effect Modules → WebGPU Canvases**

### Audio Layer (`svelte/src/lib/audio/`)

- **`AudioEngine.ts`** — Web Audio engine. Silent transport when no song loaded (no demo drum loop). Essentia rhythm analysis, SoundTouch KEY/PITCH/TEMPO, realtime FFT/bass onsets, BPM estimation, beat phase (0–1).
- **`essentia.ts`** — Hosted Essentia API client via dev proxy `/__api/analyze/*`.
- **`soundtouch.ts`** — `@soundtouchjs/audio-worklet` pitch/tempo processing.

### Render Layer (`svelte/src/lib/rendering/webgpu/`)

- **`WebGpuEngine.ts`** — Single rAF loop for all module previews + PGM. WebGPU-only; no Three.js/WebGL fallback.
- **`VideoTextureCache.ts`** — Uploads video frames via `copyExternalImageToTexture` (works in Cursor IDE browser where `importExternalTexture` fails).
- **`shaders/moduleFx.wgsl.ts`** — Unified WGSL with per-module effect modes + idle test-card graphics.
- **`PgmPresenter.ts` / `DeckPresenter.ts`** — PGM monitor and module preview presenters.

### Media Layer (`svelte/src/lib/media/`)

- **`VideoPool.ts`** — Shared HTMLVideoElement pool, one decode lane per module.
- **`loadRackClips.ts`** — TopBar CLIPS bulk load into rack slots.
- **`PlaybackCoordinator.ts`** — Frame cache and decode scheduling.

### UI Layer (`svelte/src/lib/components/`)

- **`TopBar.svelte`** — Transport, BPM, Essentia badge (RHY·OK), KEY/PITCH/TEMPO, CLIPS upload, presets.
- **`EffectModule.svelte`** — Module rack cell with embedded WebGPU preview canvas.
- **`MainViewer.svelte`** — Broadcast PGM monitor with beat-quantized cuts.
- **`ModulePalette.svelte`** — FX LIB sidebar; drag modules onto rack slots.
- **`PgmRail.svelte`** — PGM source switcher (1BT–8BAR quantize).

### App State

- **`stores/rack.ts`** — Module order, params, video layers, bypass/mute.
- **`stores/pgm.ts`** — PGM source selection and cut queue.
- **`runtime/pgm/PgmDirector.ts`** — Beat-locked cut execution.
- **`modules/catalog.ts`** — 18 FX modules registered for palette + shaders.

### QA (`svelte/src/lib/qa/`)

- **`loadQaMedia.ts`** — Auto-loads manifest clips + audio on `?qa=1`.
- **`bspQa.ts`** — `window.__BSP_QA__` hooks for acceptance scripts.

## Module Definitions

See [`svelte/docs/MODULES.md`](svelte/docs/MODULES.md) for the full catalog. Core rack modules:

| Module | Accent | Key behavior |
|--------|--------|--------------|
| TRANSITION | Green | 16 move types, beat-quantized interval |
| SPEEDRAMP | Amber | Log-space rate curve remapped to beat cycle |
| TAPDELAY | Cyan | Bass-accent stutter repeats |
| TIMESAMPLER | Yellow | Slice jumps on beat interval |
| PUNCH ZOOM / HANDHELD / DRIFT CAM / RACK FOCUS | Camera row | Beat-synced camera FX |

## Tech Stack

SvelteKit 5, Vite 8, Tailwind CSS 4, WebGPU/WGSL, Bun. Production build outputs a single self-contained HTML file. Path alias `$lib/` maps to `svelte/src/lib/`.

## Known Limitations

- WebGPU required — no silent WebGL downgrade (`CapabilityGate.svelte` blocks unsupported browsers).
- No persistence — params and uploads are not saved to localStorage.
- Ship gate manual items remain — see [`svelte/README.md`](svelte/README.md) checklist.
