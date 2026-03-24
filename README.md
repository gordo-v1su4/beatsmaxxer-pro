# Beat Surfer Pro

Beat Surfer Pro is a browser-based audiovisual prototype built with React, Vite, Tailwind CSS 4, and Three.js. The interface mimics a hardware effects rack: you can browse presets, tweak macro controls, upload audio, tap tempo, and drive four visual effect modules from live audio analysis.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Three.js
- Bun for local workflow

## What It Does

- Renders a rack-style interface with four effect modules: `SHAPER`, `DOWNSAMPLER`, `TAPDELAY`, and `BUBBLEGRAINS`
- Analyzes live playback data including BPM, beat phase, amplitude, bass energy, high-frequency energy, and 8-band FFT data
- Lets you upload your own audio track or fall back to an internal synthesized drum loop
- Lets you upload video clips per module and run shader-driven visual effects against them
- Includes preset browsing, macro controls, randomize, clear, transport controls, and tap tempo

## Local Development

This repo should be run with Bun.

```bash
bun install
bun run dev
```

The Vite dev server is configured for `http://localhost:5174`.

## Build

```bash
bun run build
```

The app uses `vite-plugin-singlefile`, so the production build is bundled for simple static hosting from `dist/`.

## Preview Production Build

```bash
bun run preview
```

## Vite Reference

- See [`docs/vite-8-notes.md`](./docs/vite-8-notes.md) for the current Vite 8 reference links, migration notes, and repo-specific follow-ups.

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
    Knob.tsx                Reusable rack-style knob control
```

## Notes

- Use Bun for installs and scripts even though the repo currently also contains a `package-lock.json`.
- The default package name in `package.json` is still `react-vite-tailwind`, so the app branding and package metadata are not fully aligned yet.
