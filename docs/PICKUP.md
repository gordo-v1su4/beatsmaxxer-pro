# Beat Surfer Pro Pickup Handoff

Date: 2026-07-29

## Current checkpoint

- Branch: `main`
- Last commit: `0b37337 fix: eliminate white flash at video loop seams; simplify PGM cut to standby canvas`
- Dev server: `http://localhost:5173/?qa=test-media&qaAutoplay=1`
- QA media fixtures: 8 real Higgsfield clips (`clip1–8.mp4`) + `redline.wav` audio, symlinked into `tests/fixtures/media/`
- The `tsconfig.json` has a pre-existing `TS5103: Invalid value for '--ignoreDeprecations'` error unrelated to any of this work. `bun run check` always fails on that line. Do not treat it as a regression.

## What was done this session

Two fixes shipped in `0b37337`:

### 1. White flash at video loop seams (the main bug)

**Symptom:** When a video clip reached its end and looped back to frame 0, a white screen held for 2–3 seconds before video resumed. User observed this on all 8 modules during real-video playback with RAND 1BT swing cutting between them.

**Root cause:** The `ThreeVisualizer` ping-pong feedback render targets capture each output frame and feed it back into the next. When a `<video>` element with `loop=true` wraps from end to start, the `VideoTexture` briefly reads garbage/white. The feedback loop captured that white and **held it for seconds** because white (`1.0`) is legal shader output that never decays. The code itself documents this failure mode at `EffectModule.tsx` lines 411–413: *"garbage reading as 1.0 is a legal white, and the feedback loop then holds the whiteout for seconds."*

**Why the first attempt failed:** The initial fix checked `video.seeking` and `video.readyState < HAVE_CURRENT_DATA` to detect the gap. But browser native `<video loop>` does NOT set `seeking=true` or drop `readyState` — it silently restarts while `readyState` stays at `HAVE_ENOUGH_DATA (4)`. The gap detector never fired.

**The fix** (`EffectModule.tsx`, render loop ~line 895):

1. Track `video.currentTime` across frames via `lastVideoTimeRef`.
2. Detect a **backwards jump** — `currentTime` drops to less than 50% of its previous value (loop wrap from ~duration back to ~0).
3. On wrap: enter a **gap-hold** — freeze the feedback loop by copying the last valid output frame to screen without running the shader (`copyMat` → no `mat` render, no ping-pong flip). The feedback buffers keep the last good frame.
4. Stay frozen until `requestVideoFrameCallback` fires (the `videoFrameSeqRef` cadence counter advances past the value captured at wrap time), confirming a **fresh decoded frame** has arrived from the post-loop video.
5. Only then resume normal rendering with `needsUpdate=true`. The first post-loop frame is real footage, never garbage.

Two new refs added: `lastVideoTimeRef` (tracks `currentTime`), `lastVideoCadenceOnWrapRef` (non-null = holding a gap freeze, stores the rVFC sequence at wrap time). Both reset to initial values when a new `videoUrl` attaches (in the video `useEffect` ~line 1043).

**Verification:** 38 seconds of real-video playback, 8 Higgsfield clips loading, RAND 1BT swing cutting through all 8 modules. Result: **0 white flashes** (threshold: avg luma > 205, max channel > 245). FPS steady 52–63 (avg 58), no downward drift. Long tasks max 72ms. Before the fix, the white held for 2+ seconds on every loop.

### 2. Standby-canvas PGM cut (the earlier refactor)

**Symptom:** Module swaps (Ableton-style hard cuts) were blanking the program monitor.

**What changed** (~100 lines removed across `App.tsx`, `MainViewer.tsx`, `BrowserProgramRenderer.tsx`):

Removed the `overlapPgmSource` crossfade system entirely: `overlapPgmSource` state, `overlapTimerRef` timeout, the `overlap` prop, `overlapStartedAtRef`, `previousOverlapRef`, the overlap `useEffect`, and the `crossfadeAlpha` render logic in `BrowserProgramRenderer`.

Replaced with a single **standby canvas** in `MainViewer`:
- Keyed by target module id, so when the cut lands and it becomes live, React reuses the same `ThreeVisualizer` instance — no remount, no blank.
- Serves both the queue-blink prewarm and the post-cut hold.
- `standbyWarm` state tracks whether `onFirstFrame` has fired.
- On cut: `liveSource` holds the outgoing picture until the standby fires `onFirstFrame`, then promotes instantly (hard frame-tight cut).
- 1200ms stall fallback: if the incoming clip never produces a frame, `liveSource` promotes anyway to avoid stranding the program on a stale source.

**Verification:** 32 cuts driven programmatically (sequential 1→8, rapid A/B between TRANSITION↔TIMESAMPLER, cross-row TRANSITION↔RACK FOCUS). Result: cut latency **33–117ms (mean ~66ms)**, zero cut failures, zero cut blanks, zero fallback- timeouts. All 8 modules were on the `native-static` Three.js canvas path (no WebCodecs) during testing.

## Architecture findings

### Render pipeline

The app has two render paths:

1. **`ThreeVisualizer`** (`EffectModule.tsx`) — paints every module preview AND the PGM output when no promoted WebCodecs clip exists. Uses a `THREE.WebGLRenderer` with ping-pong feedback render targets. Each effect module has a hand-written GLSL fragment shader (~200–400 lines). Shared via `mediaOwnerRegistry.acquireHtmlVideo()` so preview and PGM share one decode lane per module.

2. **`BrowserProgramRenderer`** (`BrowserProgramRenderer.tsx`) — the WebCodecs/WebGPU pipeline. Decodes video frames via `VideoDecoder`, presents via WebGPU or WebGL2 canvases. Has a `MultiClipPlaybackRuntime` that manages clip roles (pgm/prewarm/overlap), cadence tracking via `requestVideoFrameCallback`, circular time distance for looping, and seek correction.

**Current fallback state:** In the tested browser (headless Chrome / DevTools MCP), `BrowserProgramRenderer` reports `"fallback":{"path":"native-static","reason":"live-renderer-unavailable"}`. This means WebGPU is unavailable and ALL rendering falls through to `ThreeVisualizer`'s WebGL path. The WebCodecs pipeline code exists and is wired but is not active in this environment. Fixing the WebGPU fallback is a separate concern — see "Future: lower cut latency" below.

### Module system (current)

8 modules in 2 rows, all hardcoded:

- **Row 1 (beat effects):** `transition`, `speedramp`, `tapdelay`, `timesampler`
- **Row 2 (camera effects):** `punch`, `shake` (HANDHELD), `orbit` (DRIFT CAM), `focus` (RACK FOCUS)

Each module has:
- A `ModuleType` union member (hardcoded in `App.tsx` line 11: `'transition' | 'speedramp' | ...`)
- A `ModuleConfig` entry with `id`, `name`, `shortName`, `accentColor`, `params`
- A hand-written GLSL fragment shader dispatched from `getFragmentShader(type)` (`EffectModule.tsx` line 1900) — a giant `if (type === 'transition') return ...; if (type === 'speedramp') return ...;` chain, each returning ~200–400 lines of shader code
- A control panel component dispatched via `if (id==='transition') <TransitionControls/>` pattern (inline in `EffectModule.tsx`)
- Per-module state: `moduleParams`, `bypassed`, `muted`, `videoLayers`, `midiLayers` — all keyed by `ModuleType`

Drag/drop already exists **within rows** (`reorderModules` — drag a module in front of another in the same row). But there is no way to swap modules between rows, add new modules, or drag from a palette.

### Cut latency analysis

**Current measured latency: 33–117ms (mean ~66ms).** This is near the browser floor for the current architecture:

- **16ms (1 frame) is the theoretical minimum** (one rAF tick).
- **We get 2 frames (~33ms) minimum** because: the standby canvas needs one rAF to render its first frame, then `onFirstFrame` fires, then React promotes `liveSource` → next rAF paints the promoted source. That's 2 render cycles minimum.
- To go sub-16ms, you'd need to swap GPU textures directly without going through React's render cycle — which is what the WebCodecs/WebGPU path (`BrowserProgramRenderer`) was designed for, but it's currently falling back to `native-static` because WebGPU is unavailable.
- **The perceived latency was dominated by the 2-second white freeze, not the cut itself.** With the white freeze fixed, 66ms mean feels instant for a VJ tool.

---

## Future: modular drag/drop palette from a sidebar

### What the user wants

A left-side menu/palette of available modules. User can drag modules from the palette onto the rack to swap them in/out while playback is running. Essentially: the rack becomes configurable at runtime instead of hardcoded to 8 fixed modules.

### Can the architecture support it?

**Yes — the rendering layer is already module-agnostic.** The cut system, standby canvas, feedback loop, audio sync, and video pipeline all key by module ID, not by module type. The work is mostly in the **configuration and type layers.**

### What's already there (doesn't need to change)

- `standbyTarget` keyed by module ID — already works with any ID
- `ThreeVisualizer` takes any `type` string and fetches its shader — already generic
- `mediaOwnerRegistry.acquireHtmlVideo(ownerId, videoUrl)` — already works with dynamic IDs
- Drag/drop within rows (`reorderModules`) — already works
- Per-module params/bypass/mute/clip/midi — already keyed by ID

### What's hardcoded and would need to change

| current (hardcoded) | needed (dynamic) | effort |
|---|---|---|
| `ModuleType` is a fixed union: `'transition' \| 'speedramp' \| ...` (App.tsx line 11) | becomes `string` (dynamic ID from registry) | Medium — touches every `Record<ModuleType, T>` in the app |
| `MODULES` / `MODULES_B` hardcoded arrays (App.tsx lines 35–111) | loaded from a registry/config file or directory scan | Small |
| `getFragmentShader(type)` is a 600-line `if/switch` chain (EffectModule.tsx line 1900) | becomes a `Map<string, string>` — shader source registered per module | Medium — mechanical refactor of existing code |
| Control panels dispatched via `if (id==='transition') <TransitionControls/>` (inline in EffectModule.tsx) | each module defines its own `controls.tsx` component, registered alongside its shader | Medium — extract existing inline components |
| `moduleRecord<T>()` builds `Record<ModuleType, T>` from `ALL_MODULES` (App.tsx line 130) | becomes `Record<string, T>` initialized from the dynamic registry | Small — mostly type changes |
| Row membership is fixed (`orderTop` = MODULES, `orderBottom` = MODULES_B) | rows are just ordered lists of any module IDs; a module can be in either row or none | Small |
| No palette/sidebar UI exists | new component: lists available modules, drag onto rack slot, swap | Medium — new UI but drag/drop mechanics already exist in `reorderModules` |

### Recommended approach (not a full runtime plugin system)

Loading external shaders at runtime is a security risk. The sane version:

1. **Module manifest:** each module is a concept with (a) a `shader.glsl` file or inline string, (b) a config object (`name`, `shortName`, `accentColor`, `defaultParams`), (c) optionally a `controls.tsx` component for its parameter UI panel. A build step or a central `modules/registry.ts` file registers them into a `Map<string, ModuleDefinition>`.

2. **Palette UI:** left sidebar lists all registered modules. Drag a module card onto a rack slot → that slot's module ID changes → `setOrderTop` / `setOrderBottom` update → the standby canvas + `ThreeVisualizer` render the new module on next rAF. The cut flow handles the visual swap (prewarm → promote on `onFirstFrame`).

3. **The cut system doesn't care about module identity.** `selectPgmSource(next)` just sets `pgmSource` to any ID. `MainViewer`'s `standbyTarget` is computed from `incoming` (which is `modules.find(m => m.id === pgmSource)`). All of this already works with any ID.

### Effort estimate

- **60% type-system refactoring:** kill the `ModuleType` union, replace with `string`, update all `Record<ModuleType, T>` sites. Mechanical but touches many files.
- **30% palette UI + drag/drop swap:** new sidebar component, drop targets on rack slots, swap logic (one module replaces another in a row). The drag mechanics exist — just needs to swap instead of reorder.
- **10% shader registry:** extract `getFragmentShader` from the `if/switch` chain into a `Map<string, string>`. Mechanical.

### When to do it

The 8 hardcoded modules are working well. The shaders (~200–400 lines each of hand-written GLSL) are the hard creative part, not the plumbing. A plugin system without more shaders to plug in is just infrastructure with nothing to install. **Recommendation: add 3–5 more modules first (just extend the union — 10 minutes of work per module), then build the palette when you have 12–15 modules and users actually want to choose.** The palette makes sense once there are more modules than rack slots (8 slots, 8 modules = ratio 1:1, nothing to choose).

---

## Future: fixing the WebGPU fallback for sub-16ms cuts

The `BrowserProgramRenderer` WebCodecs/WebGPU pipeline is designed to present decoded video frames from GPU memory — no React render cycle involved, theoretically enabling sub-16ms (1-frame) cuts. It's currently falling back to `native-static` with `"reason":"live-renderer-unavailable"`. The pipeline code exists and is complete (clip roles, cadence tracking, circular time, seek correction, `MultiClipPlaybackRuntime`).

To investigate:
- Check if WebGPU is available in the target browser (`navigator.gpu`)
- Check `BrowserProgramRenderer`'s renderer initialization path — where does it decide to fall back?
- The `MultiClipPlaybackRuntime.present()` path (line 334) handles `webcodecs-webgpu` / `webcodecs-webgl2` differently from `native-static` — the WebCodecs path leases frames from the coordinator and presents decoded frames directly
- If WebGPU works, cut latency drops from 66ms to potentially 16ms (1 frame)

This is a separate task from the module palette.

---

## Resume commands

```sh
cd /Users/robertspaniolo/Documents/Github/beat-surfer-pro
git status --short
git log --oneline -12
bun run dev -- --port 5173 --strictPort
```

Open Chrome at:
`http://localhost:5173/?qa=test-media&qaAutoplay=1`

QA media is symlinked from `~/Downloads/archive (2)/` (8 Higgsfield clips) and `~/Music/.../Redline.wav` into `tests/fixtures/media/`. The manifest at `tests/fixtures/media/manifest.json` points at `clip1–8.mp4` and `redline.wav`.

## Recent commits

- `0b37337` eliminate white flash at video loop seams; simplify PGM cut to standby canvas
- `394db32` Improve eight-clip decode pressure, PGM cuts, and README.
- `ee25c85` restore UI responsiveness under dev QA media load
- `8c88fcf` WebGPU WGSL sampler, QA rhythm stub, and video-ready guards
- `126e811` silence ANGLE uninitialized-variable warnings in effect shaders
- `e655b7b` stabilize Gems QA playback and verify in headless browser