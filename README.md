# Beat Surfer Pro

<p align="center">
  <img src="docs/beat-surfer-pro.webp" alt="Beat Surfer Pro — beat-synced PGM monitor, FX rack, and live clip previews" width="100%" />
</p>

Browser-native **audio-reactive video FX rack** with a broadcast-style program monitor. Load clips into eight modules, cut on the beat, and drive shader effects from live rhythm analysis — **SvelteKit 5 + WebGPU only** (no React, no Three.js fallback).

`#vj` `#beat-sync` `#webgpu` `#svelte` `#vite` `#bun` `#realtime-video` `#shader-fx` `#audio-reactive` `#music-video` `#program-monitor` `#singlefile`

## Quick start

```bash
bun install          # installs svelte/ deps via postinstall hook — or: cd svelte && bun install
bun run dev          # http://localhost:5174
bun run test         # vitest
bun run test:local   # full local suite (unit + build + browser gates)
bun run build        # single-file → svelte/build/
```

### QA mode (auto-load 8 clips + song)

```bash
bun run link-qa      # symlink 8 MP4s + Redline from ~/Downloads/archive (2)
bun run dev
open 'http://localhost:5174/?qa=1&qaAutoplay=1'
```

On every refresh, `?qa=1` auto-loads Redline + 8 rack clips via [`svelte/src/lib/qa/loadQaMedia.ts`](svelte/src/lib/qa/loadQaMedia.ts).

## Stack

| Layer | Tech |
|-------|------|
| UI | SvelteKit 5 + runes |
| Render | **WebGPU only** (WGSL) — the sole `AppLoop` rAF drives `WebGpuEngine` |
| Decode | 8 slot-owned `HTMLVideoElement` pipelines in a shared pool; PGM reuses one |
| Rhythm | Essentia hosted analysis + Web Audio fallback |
| Audio FX | SoundTouch.js (KEY / PITCH / TEMPO) |
| Build | Vite 8 + Bun → single HTML via `vite-plugin-singlefile` |

## Project structure

```text
svelte/src/
  routes/+page.svelte       Main rack layout
  lib/audio/                AudioEngine, Essentia, SoundTouch
  lib/rendering/webgpu/     WebGpuEngine, WGSL registry, frame-local external-video bindings
  lib/runtime/pgm/          Beat-quantized PGM director
  lib/modules/catalog.ts    FX module catalog (18 modules, drag-from-palette)
  lib/components/           TopBar, EffectModule, PgmRail, ModulePalette…
  lib/qa/                   QA auto-load + window.__BSP_QA__ hooks
docs/                       Architecture notes, hero screenshot
```

## Docs

- [`svelte/README.md`](svelte/README.md) — Svelte app quick start and documentation index
- [`svelte/docs/ARCHITECTURE.md`](svelte/docs/ARCHITECTURE.md) — runtime ownership and render/media data flow
- [`svelte/docs/SHIP_PLAN.md`](svelte/docs/SHIP_PLAN.md) — implemented work versus required release evidence
- [`svelte/docs/LOCAL_TESTING.md`](svelte/docs/LOCAL_TESTING.md) — browser acceptance gates
- [`svelte/docs/MODULES.md`](svelte/docs/MODULES.md) — register new effects
- [`CLAUDE.md`](CLAUDE.md) — module param reference

## Requirements

- **Chrome / Edge 113+** or **Safari 18+** with WebGPU enabled
- **Bun** for installs and scripts
