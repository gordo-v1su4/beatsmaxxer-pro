# Beat Surfer Pro

<p align="center">
  <img src="docs/beat-surfer-pro.webp" alt="Beat Surfer Pro — eight module FX previews and PGM monitor running live clips" width="100%" />
</p>

Browser-based audio-reactive video FX rack with a broadcast-style program monitor. Load clips into eight modules, cut them on the beat, and drive shader effects from live rhythm analysis — all in one self-contained HTML build.

`#vj` `#beat-sync` `#webgpu` `#webcodecs` `#threejs` `#react` `#vite` `#bun` `#realtime-video` `#shader-fx` `#audio-reactive` `#music-video` `#program-monitor` `#singlefile`

## Why this stack works

Most browser VJ toys either (a) play one clip at a time, or (b) melt when you push eight high-bitrate sources plus GPU shaders. Beat Surfer Pro is built around the opposite constraint: **keep every clip hot, keep the cut clean, keep the timeline on the music.**

| Layer | Tech | Why it matters |
|-------|------|----------------|
| UI | React 19 + Tailwind CSS 4 | Hardware-rack layout that stays readable under live tweaking |
| Build | Vite 8 (Rolldown) + Bun | Fast HMR in dev; one self-contained HTML file for shipping via `vite-plugin-singlefile` |
| 3D / FX | Three.js WebGL shaders | Per-module wet previews with ping-pong feedback (stutters, ramps, focus pulls) |
| Decode | Shared HTMLVideo / WebCodecs pipeline | One decode lane per clip shared by preview + PGM — no double-decoder tax |
| Rhythm | Essentia `/analyze/fast` + Web Audio fallback | Server BPM/beat grid when available; realtime onset fallback when offline |
| Transport | Quantized PGM rail | Ableton-style launch: arm a channel, cut lands on the next bar |

What makes it feel different from a generic “audio visualizer”:

- **Eight concurrent clips**, not one. Shared decode + staggered startup keep pressure down.
- **Beat-locked cuts** on the left rail (1BT–8BR, swing/dotted feel), not click-and-pray.
- **Module FX that matter** — TRANSITION, SPEEDRAMP, TAPDELAY, TIMESAMPLER, plus camera rack (PUNCH ZOOM / HANDHELD / DRIFT CAM / RACK FOCUS).
- **Program monitor above the rack** so what you cut is what you see, with ON AIR tallies.
- **Ships as a single HTML file** — drop it anywhere static hosting works.

## Stack

- React 19
- Vite 8 + `vite-plugin-singlefile`
- Tailwind CSS 4
- Three.js
- Web Audio API + Essentia rhythm service
- Bun for local workflow

## Local Development

```bash
bun install
bun run dev
```

Dev server: `http://localhost:5174`.

## Build

```bash
bun run build
```

Production output lands in `dist/` as a single self-contained HTML file.

## Preview Production Build

```bash
bun run preview
```

## Project Structure

```text
src/
  App.tsx                   App shell and top-level state
  audio/
    AudioContext.tsx        React context for transport and audio controls
    AudioEngine.ts          Web Audio engine and realtime analysis
  components/
    TopBar.tsx              Transport, BPM, upload, and session actions
    PresetBrowser.tsx       Preset list and macro controls
    EffectModule.tsx        Module UI and Three.js visualizers
    MainViewer.tsx          PGM monitor and left-rail source switcher
    Knob.tsx                Reusable rack-style knob control
  media/                    Clip registry, shared decode owners, program runtime
```

## Notes

- Use Bun for installs and scripts.
- Path alias `@/` maps to `src/`.
- See [`docs/vite-8-notes.md`](./docs/vite-8-notes.md) for Vite 8 reference notes.
