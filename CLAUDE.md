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

- **`TopBar.tsx`** — Transport controls: play/stop, BPM display, tap tempo, audio file upload, randomize, clear, FX HOLD (freezes every shader preview via the `shaderCtl` registry exported from EffectModule).
- **`PresetBrowser.tsx`** — 11 hardcoded presets; 4 macro knobs (macro1–4, range 0–100) with color-coded sliders.
- **`EffectModule.tsx`** — The core component. Renders the four main modules (TRANSITION, SPEEDRAMP, TAPDELAY, TIMESAMPLER) plus exports `CompactModule` for the second row of camera effects (PUNCH ZOOM, HANDHELD, DRIFT CAM, RACK FOCUS). Each module has an embedded Three.js FX-preview canvas (100% wet) with ping-pong feedback buffers; with no clip loaded, the source is an in-shader test card whose lower zone is a per-module, param-reactive idle graphic (tap lines, film-strip ticks, MIDI piano roll, feathered bullseye, horizon grid, map grid with X landmarks, depth-plane shapes). Module headers drag-to-reorder within their row; the chevron collapses a module's controls. Videos are shared per-module (`sharedVideos` registry) so the FX preview and PGM monitor stay frame-synced; a `moduleClocks` registry mirrors the driver instance's remapped clock to followers. TAPDELAY stutters fire when FFT bass-onset strength crosses an ACCENT SENS threshold (MIDI notes override); TIMESAMPLER is an Ableton Simpler-style slice sampler — the clip is split into N equal sections and the playhead jumps between slice starts every JMP beats, with accents/MIDI punching random slices.
- **`MainViewer.tsx`** — Broadcast-style program monitor above the module rows. Eight PGM source buttons with Ableton-style launch quantize: clicking arms a channel (blinks) and the cut lands on the next bar; RAND auto-hops channels every bar. ON AIR tally shows on the active module's header.
- **`Knob.tsx`** — Reusable SVG rotary knob; drag-to-adjust; supports xs/sm/md/lg sizes.

### App State (`src/App.tsx`)

Owns all application state: `moduleParams` (per-module parameter maps), `macros` (4 values), video/MIDI layer refs, and the `MODULES` and `PRESETS` constants. Layout is: TopBar → [left rail | PresetBrowser | 4 EffectModules | right rail] → BottomStrip (IN/OUT connectors).

### Module Definitions

| Module | Accent | Key Params |
|--------|--------|-----------|
| TRANSITION | Green (`#22c55e`) | type (16 moves: whip L/R, push U/D, wipe, roll, zoom, glitch, tilt, spin, zoom-out, bars, iris, slice, flash, defocus), interval (7 zones: 1BT–8BAR), duration, amount, trig (fire counter), mix, in, out |
| SPEEDRAMP | Amber (`#f59e0b`) | len (7 cycle zones: 1BT–8BAR), spdMin/spdMax (rate range knobs, 0.25×–4×; the curve midline is always 1×, top half sweeps to MAX, bottom half to MIN in log space), bzY0/bzX1/bzY1/bzX2/bzY2/bzY3 (speed-curve bezier points, set via 12 drawn shape-preset buttons incl. LATE±/EASE±/INV-S/SLAM), mix, in, out |
| TAPDELAY | Cyan (`#38bdf8`) | type, velCrv, end (accent sens), start, filterSlider, time, feedback, feel (0 straight / 1 swing / 2 dotted — reshapes each stutter repeat), scratchMode, scratchDepth, mix, in, out |
| TIMESAMPLER | Yellow (`#eab308`) | mode (FWD/REV/PONG/RND slice order), size (jump interval 1/16–1BAR), slices (4/8/16/32 Simpler-style sections), accent (per-jump HIT: 0 LUM exposure pop / 1 RGB split / 2 OFF), chance (accent sens — bass hits punch random slices), rate, mix, in, out |
| PUNCH ZOOM | Coral (`#fb7185`) | dir, amt, snap, mix |
| HANDHELD | Violet (`#a78bfa`) | hand, impact, sway, mix |
| DRIFT CAM | Teal (`#2dd4bf`) | spd, drift, nudge, mix |
| RACK FOCUS | Cream (`#e2c08d`) | amt, pulse, soft, xeye (X-EYE toggle: two 50/50-opacity copies separate and reconverge instead of blurring), mix — the pull envelope always returns to sharp (0) each cycle |

TAPDELAY and TIMESAMPLER additionally have numbered one-tap presets (1/2/3, `MODULE_PRESETS`) rendered in their MIX strip — each sets every param of the module at once (e.g. "swung triplets", "bar march").

BPM: auto-estimated from bass onsets (octave-folded into 90–180); typing a value in the TopBar display or tapping tempo locks it (BPM·M), clicking the badge unlocks auto-detect.

### Tech Stack

React 19, Vite 8 (Rolldown + Oxc), Tailwind CSS 4, Three.js, Bun. Production build outputs a single self-contained HTML file. Path alias `@/` maps to `src/`.

### Known Limitations

- No persistence — params, macros, and uploaded files are not saved to localStorage/IndexedDB.
- Preset names are hardcoded strings; no save/load mechanism.
- No test framework or linter configured.
- Vite 8 emits a non-critical `inlineDynamicImports` deprecation warning at build time (not from this repo's config).
