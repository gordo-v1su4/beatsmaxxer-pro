# Beatsmaxxer Pro — domain context

Browser-native **audio-reactive video FX rack** with a beat-quantized **PGM** (program monitor). One SvelteKit 5 + WebGPU engine; three runtime surfaces (see [Platforms](#three-platforms)).

**Product north star:** Cable Guy–style VST plugins for video — modular effects, instant visual feedback, beat-quantized cuts, effortless perform UX. Realtime and visually cool; zero-flash PGM switches are the top reliability bar.

**Toolchain:** `bun` for JS/TS. **WebGPU/WGSL only** at runtime — no WebGL, Three.js, or alternate renderer fallback. (`fxlab` uses WebGL2 + SwiftShader headless for CI shader sheets only.)

## Glossary

| Term | Meaning |
|------|---------|
| **Rack** | Eight stable slot IDs (`top-0`…`top-3`, `bottom-0`…`bottom-3`); each slot owns one `HTMLVideoElement` and clip file |
| **Module** | Catalog effect (18 WGSL `effectMode`s) assigned to a slot; hot-swapping a module does not reload the slot's video |
| **PGM** | Program monitor — one canvas (`pgm`) showing the on-air slot through the selected module's shader |
| **PgmDirector** | Beat-quantized PGM cuts via `AudioEngine.configurePgmSchedule()` — not rAF promotion |
| **Slot ID** | Stable media owner (`top-0`, etc.); do not confuse with module ID |
| **MobileShell** | Phone UI (`svelte/src/lib/mobile/`) — one stage canvas, not the full rack |
| **AppLoop** | Single rAF driver for `WebGpuEngine` + transport |
| **Essentia** | Offline rhythm analysis (hosted API); Web Audio is live fallback |

Avoid: calling the rack "channels" interchangeably with "modules" without saying which owns the video.

## Three platforms

One bundle; two switches:

1. **`detectRuntime()`** — `'web'` (browser) or `'tauri'` (desktop Windows app, WebView2)
2. **`isMobileShell`** — full rack vs `MobileShell` (viewport / `?mobile=1`)

| # | Surface | Host | UI | Key policy |
|---|---------|------|-----|------------|
| 1 | Desktop Windows app | Tauri + WebView2 | Full rack | 60fps previews, `interactive` audio, persistent video texture copy |
| 2 | Web app | Chrome/Edge desktop | Full rack | 30fps previews, `importExternalTexture` path |
| 3 | Mobile web | Chrome on phone | MobileShell | 1 canvas, `playback` audio, lifecycle/HTTPS critical |

**Not three codebases.** Rust in `desktop/` is shell only (window, `.env`, Essentia HTTP, updater) — not a native GPU compositor.

Canonical map: [`research/webgpu-peers/PLATFORMS.md`](research/webgpu-peers/PLATFORMS.md).

## Runtime ownership

| Concern | Owner |
|---------|--------|
| GPU submission | `WebGpuEngine` |
| Cadence | `AppLoop` |
| Beat-quantized PGM | `PgmDirector` |
| Clips / videos | `MediaRuntime`, `VideoPool` |
| Audio + schedule | `AudioEngine` |
| Shell pick | `+page.svelte` + `mobileEnv.ts` |
| Tauri policy | `desktopPerformance.ts`, `shouldUsePersistentVideoTexture()` |

Full detail: [`svelte/docs/ARCHITECTURE.md`](svelte/docs/ARCHITECTURE.md).

## Active research (WebGPU peers)

Work lives under [`research/webgpu-peers/`](research/webgpu-peers/):

- **Committed:** `analyses/`, `IMPLEMENTATION-BACKLOG.md`, `PLATFORMS.md`, `RESEARCH-STATUS.md`
- **Local only:** `repos/` (gitignored clones) — run `clone-peers.ps1` locally

**Continue here:** [`docs/agents/continuity.md`](docs/agents/continuity.md).

## Branches

- **`main`** — web + shared engine; desktop shell on separate branch until promoted
- **`cursor/desktop-tauri-*`** — do not merge into `main` until promoted (`AGENTS.md`)
