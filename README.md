# Beat Surfer Pro

<p align="center">
  <img src="docs/beat-surfer-pro.webp" alt="Beat Surfer Pro — beat-synced PGM monitor, FX rack, and live clip previews" width="100%" />
</p>

Browser-native **audio-reactive video FX rack** with a broadcast-style program monitor. Load clips into eight modules, cut on the beat, and drive shader effects from live rhythm analysis — shipped as a single self-contained HTML file.

**Active rewrite:** [`svelte/`](./svelte/) — SvelteKit 5 + **WebGPU-only** render path (no Three.js fallback). The original React + WebGL build remains in [`src/`](./src/) for reference.

`#vj` `#beat-sync` `#webgpu` `#webcodecs` `#svelte` `#vite` `#bun` `#realtime-video` `#shader-fx` `#audio-reactive` `#music-video` `#program-monitor` `#singlefile`

## Why this stack

Most browser VJ tools either play one clip at a time or melt when you push eight high-bitrate sources plus GPU shaders. Beat Surfer Pro is built around the opposite constraint: **keep every clip hot, keep the cut clean, keep the timeline on the music.**

| Layer | Tech | Why it matters |
|-------|------|----------------|
| **UI shell** | SvelteKit 5 + runes | Hardware-rack layout, collapsible FX library + PGM source rail, drag-to-slot module swapping |
| **Render** | **WebGPU only** (WGSL) | One `WebGpuEngine` rAF loop — progressive shader port, no dual WebGL/WebGPU paths |
| **Decode** | WebCodecs + hot-deck lifecycle | One decode lane per clip shared by preview + PGM |
| **Rhythm** | Essentia hosted analysis + Web Audio fallback | Server BPM/beat grid when available; realtime onset fallback offline |
| **Transport** | Quantized PGM director | Ableton-style launch: arm a channel, cut lands on the next bar |
| **Build** | Vite 8 (Rolldown) + Bun | Fast HMR; `vite-plugin-singlefile` → one HTML artifact |

### Progressive by design

- **WebGPU-first** — capability probe gates the experience; no silent WebGL downgrade.
- **Shader registry** — new FX modules register in `catalog.ts` and appear in FX LIB before assignment.
- **Contracts layer** — `engine/contracts.ts` keeps audio, media, and render boundaries explicit for contributors.
- **Beat-synced everything** — PGM cuts, stutters, slice jumps, and transition intervals share one transport clock.

What makes it feel different from a generic “audio visualizer”:

- **Eight concurrent clips**, not one — shared decode + staggered startup.
- **Beat-locked cuts** on the PGM rail (1BT–8BR, swing/dotted feel).
- **Cinema-grade module FX** — transitions, speed ramps, stutter delay, slice sampler, plus camera + film texture rack (punch zoom, handheld, VHS, camcorder, lens bulge, halation…).
- **Program monitor above the rack** with ON AIR tallies and queued-cut blink.
- **Ships as a single HTML file** — drop it anywhere static hosting works.

## Quick start

### Svelte + WebGPU (recommended)

```bash
cd svelte
bun install
bun run dev          # http://localhost:5174
bun run test         # vitest
bun run verify:ui    # browser smoke + screenshot
bun run build        # single-file → build/
```

QA mode with bundled fixtures:

```bash
cd svelte && bun run link-qa
open 'http://localhost:5174/?qa=1&qaAutoplay=1'
```

From repo root: `bun run dev:svelte`

### Legacy React + WebGL

```bash
bun install
bun run dev          # http://localhost:5174 (root Vite app)
bun run build        # dist/index.html (single file)
```

## Layout notes

The rack is designed for **~1425px minimum width** (four 272px module columns + side rails). Below that, the shell **scrolls horizontally** instead of clipping knobs. Under **960px**, a **mobile layout** stacks side panels and wraps modules 2×2.

- Collapse modules (↑ chevron) → preview-only strips; rows shrink for extra rack space.
- Retract **FX LIB** or **PGM SOURCE** left rails when you need room.

## Project structure

```text
svelte/src/
  routes/+page.svelte       Main rack layout
  lib/audio/                AudioEngine, Essentia rhythm API
  lib/rendering/webgpu/     WebGpuEngine, WGSL registry
  lib/runtime/pgm/          Beat-quantized PGM director
  lib/modules/catalog.ts    FX module catalog (palette + rack)
  lib/components/           TopBar, EffectModule, PgmRail, ModulePalette…

src/                        Legacy React + Three.js app
docs/                       Architecture notes, hero screenshot
```

## Docs

- [`svelte/docs/MODULES.md`](./svelte/docs/MODULES.md) — register new effects, drag-from-palette
- [`docs/vite-8-notes.md`](./docs/vite-8-notes.md) — Vite 8 reference
- [`CLAUDE.md`](./CLAUDE.md) — full module param reference (React era)

## Requirements

- **Chrome / Edge 113+** or **Safari 18+** with WebGPU enabled
- **Bun** for installs and scripts
