# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install       # Install dependencies
bun run dev       # Dev server at http://localhost:5174
bun run build     # Production build → dist/ (single HTML file via vite-plugin-singlefile)
bun run preview   # Preview production build
```

No lint or test commands are configured.

## Architecture

Beat Surfer Pro is a browser-based audio-reactive effects rack with realtime 3D visualization. The data flow is:

**Audio Analysis → Parameter System → Four Effect Modules → Three.js Canvases**

### Audio Layer (`src/audio/`)

- **`AudioEngine.ts`** — Web Audio API engine. Synthesizes a fallback drum loop; analyzes uploaded audio in real-time for RMS amplitude, bass/high energy, 8-band FFT, BPM estimation (onset detection), and beat phase (0–1). Single source of truth for all audio state.
- **`AudioContext.tsx`** — React context wrapping AudioEngine. Polls engine state via `requestAnimationFrame` and exposes controls (`play`, `stop`, `setBPM`, `tapTempo`, `loadAudioFile`).
- **`MidiParser.ts`** — Parses `.mid` files into note-on events with absolute timestamps; converts tick times to seconds using a tempo map.

### UI Layer (`src/components/`)

- **`TopBar.tsx`** — Transport controls: play/stop, BPM display, tap tempo, audio file upload, randomize, clear.
- **`PresetBrowser.tsx`** — 11 hardcoded presets; 4 macro knobs (macro1–4, range 0–100) with color-coded sliders.
- **`EffectModule.tsx`** — The core component. Renders one of four modules (SHAPER, DOWNSAMPLER, TAPDELAY, TIMESAMPLER) including: parameter knobs, bypass/mute, video/MIDI upload slots, and two embedded Three.js canvases (FX preview at 100% wet + mixed output) driven by audio analysis + module params. Each canvas has ping-pong feedback buffers for real video trails; with no clip loaded, an in-shader animated test card is the source.
- **`Knob.tsx`** — Reusable SVG rotary knob; drag-to-adjust; supports xs/sm/md/lg sizes.

### App State (`src/App.tsx`)

Owns all application state: `moduleParams` (per-module parameter maps), `macros` (4 values), video/MIDI layer refs, and the `MODULES` and `PRESETS` constants. Layout is: TopBar → [left rail | PresetBrowser | 4 EffectModules | right rail] → BottomStrip (IN/OUT connectors).

### Module Definitions

| Module | Accent | Key Params |
|--------|--------|-----------|
| SHAPER | Green (`#22c55e`) | algo, offset, freq, clip, amount, mix, in, out |
| DOWNSAMPLER | Amber (`#f59e0b`) | jitter, crushType, rate, bits, mix, in, out |
| TAPDELAY | Cyan (`#38bdf8`) | type, velCrv, end, start, filterSlider, time, feedback, mix, in, out |
| TIMESAMPLER | Yellow (`#eab308`) | mode (LOOP/REV/PONG/RAND), size, repeats, chance, rate, mix, in, out |

### Tech Stack

React 19, Vite 8 (Rolldown + Oxc), Tailwind CSS 4, Three.js, Bun. Production build outputs a single self-contained HTML file. Path alias `@/` maps to `src/`.

### Known Limitations

- No persistence — params, macros, and uploaded files are not saved to localStorage/IndexedDB.
- Preset names are hardcoded strings; no save/load mechanism.
- No test framework or linter configured.
- Vite 8 emits a non-critical `inlineDynamicImports` deprecation warning at build time (not from this repo's config).
