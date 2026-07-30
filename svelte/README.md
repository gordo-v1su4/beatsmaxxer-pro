# Beat Surfer Pro — Svelte + WebGPU

<p align="center">
  <img src="../docs/beat-surfer-pro.webp" alt="Beat Surfer Pro UI with live clips and beat-synced PGM" width="100%" />
</p>

Browser-only rewrite: **SvelteKit 5** shell + **WebGPU-only** render engine. No Three.js, no WebGL fallback — progressive WGSL shader port behind a single `WebGpuEngine` loop.

## Commands

```bash
bun install
bun run dev          # http://localhost:5174
bun run build        # single-file production build → build/
bun run check        # svelte-check
bun run test         # vitest (57+ unit tests)
bun run verify:ui    # headless browser smoke + screenshot
bun run link-qa      # symlink QA clips + Redline mp3
```

From repo root: `bun run dev:svelte`

## QA mode

```
http://localhost:5174/?qa=1&qaAutoplay=1
```

Requires QA fixtures via `bun run link-qa` (clips from `~/Downloads/archive (2)`, Redline @ 133 BPM).

## Architecture

| Piece | Location |
|-------|----------|
| UI + stores | `src/lib/components/`, `src/lib/stores/` |
| WebGPU engine | `src/lib/rendering/webgpu/WebGpuEngine.ts` |
| WGSL registry | `src/lib/rendering/webgpu/shaders/` |
| WebCodecs + hot deck | `src/lib/media/`, `src/lib/runtime/decks/` |
| Audio + Essentia | `src/lib/audio/` |
| PGM beat cuts | `src/lib/runtime/pgm/PgmDirector.ts` |
| Module catalog | `src/lib/modules/catalog.ts` |

## FX LIB + rack

See [`docs/MODULES.md`](docs/MODULES.md).

- **FX LIB** (left): BEAT FX · CAMERA · FILM/TEXTURE — drag onto rack slots
- **PGM SOURCE** (retractable): Ableton-style queued cuts, RAND hop, 1BT–8BR quantize
- **Module chevron**: collapse to preview strip; full row collapse frees vertical space
- **Layout floor**: `--app-min-width` ~1425px; horizontal scroll below; mobile wrap @ 960px

## Stack highlights (for contributors)

- **Svelte 5** runes + stores — no legacy `$:` soup
- **WebGPU / WGSL only** — capability gate, no silent downgrade
- **Vite 8** Rolldown + Oxc, Tailwind CSS 4
- **Vitest** for transport, timesampler, PGM stress paths
- **Single-file build** via `vite-plugin-singlefile`

## Cutover checklist

- [x] All rack modules render WebGPU previews (unified FX WGSL + external video texture)
- [x] Video pool — HTMLVideo per module, importExternalTexture per frame
- [x] PGM prewarm on queued cut
- [x] PresetBrowser + 4 macro faders
- [x] 16-step beat sequencer → PGM cuts
- [x] MIDI timeline strip + clear
- [x] Essentia dev proxy (`/__api` → hosted analysis)
- [x] Single-file build (`bun run build` → `build/`)
- [x] 57 unit tests + UI verify smoke
- [ ] Full WebCodecs decode lane (PlaybackCoordinator wired to canvas)
- [ ] Per-module WGSL parity with React GLSL (ping-pong feedback, idle graphics)
- [ ] 38s RAND 1BT stress — 0 white flashes acceptance run
