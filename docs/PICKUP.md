# Beat Surfer Pro Pickup Handoff

Date: 2026-07-24

## Current checkpoint

- Branch: `main`
- Code checkpoint before this document: `8975da0 fix: align video validation to display time`
- Durable plan: `.omx/ultragoal/goals.json`
- Audit trail: `.omx/ultragoal/ledger.jsonl`
- Goal status: G001-G006 complete, G007 in progress, G008 pending.
- Do not mark G007 complete. Native-browser playback acceptance still fails.

The source, typecheck, unit tests, build, and secret scan passed at the code
checkpoint. The Vite build still reports the known `inlineDynamicImports`
deprecation warning.

## What works

- The TimeSampler PGM canvas displays real video pixels.
- The main image is upright.
- The compatibility renderer can recover and display frames after switching and
  seeking.
- The diagnostic counters and bounded drift history are available for native
  browser QA.

## What does not work

Normal main-screen playback is not smooth or acceptable in the native browser.
The latest full-reload 10-second run reported:

- `dropped=104`
- `presented=830`
- approximately 11.13% dropped-frame ratio
- all drops classified as `steady-drift`
- zero late frames

The required drop ratio is at most 1%. Earlier seek-settling changes produced an
even worse result of approximately 23.75%. Do not continue adjusting timing
tolerances or adding corrective seeks around this fallback path.

## Root architectural issue

The current implementation combines two problems:

1. `src/media/BrowserProgramRenderer.tsx` forces the normal PGM path into the
   `html-video-webgl2` compatibility renderer instead of treating fallback as an
   explicit QA or capability decision.
2. `src/components/EffectModule.tsx` uses the global
   `sharedVideos[moduleId]` pool. A module preview and the PGM
   `ThreeVisualizer` can therefore acquire the same `HTMLVideoElement`.
   Play, pause, seek, and `currentTime` changes from one surface can mutate the
   other surface.

This matches the observed behavior: more than one React surface is driving media
state, while the fallback correction loop repeatedly seeks the same underlying
video. React itself is not the playback clock; the ownership boundary is wrong.

## Non-negotiable playback ownership

- Normal PGM playback must not silently use a fallback renderer.
- A fallback may be enabled only through an explicit forced-QA/capability mode.
- Every visible player surface has independent runtime state.
- The PGM owns a separate video/presentation instance and never reuses or
  mutates a preview element.
- Each preview is independent of every other preview.
- React selects and configures stable media owners. High-frequency playback
  state and the audio-master clock stay outside React rendering.
- Inactive previews should be poster-only or paused.
- Use Bun for all repository commands.
- Use the native in-app browser for browser QA. Do not leave audio playing in a
  second browser.

## Reference implementations

Use these local projects before changing the ownership model:

- FreeCut clock:
  `/Users/robertspaniolo/Documents/Github/freecut/src/runtime/player/clock/Clock.ts`
  keeps the clock independent of React, supports the AudioContext hardware
  clock, and exposes event-driven updates.
- FreeCut source assignments:
  `/Users/robertspaniolo/Documents/Github/freecut/src/runtime/player/video/VideoSourcePool.ts`
  tracks explicit clip assignments and creates overflow lanes for simultaneous
  consumers instead of blindly reusing a busy element.
- MasterSelects layer ownership:
  `/Users/robertspaniolo/Documents/Github/MasterSelects/src/services/layerPlaybackManager.ts`
  gives each active layer its own `LayerCompState`, runtime owner ID, playback
  anchor, media element, synchronization, and cleanup.

For Beat Surfer Pro, visible preview and PGM owners must remain separate even
when their source URL is identical.

## First implementation task on resume

1. Remove `sharedVideos[moduleId]` as the ownership mechanism for visible
   players. Introduce stable owner IDs such as `preview:<moduleId>` and
   `pgm:<moduleId>`, each resolving to a distinct media instance and state.
2. Make normal TimeSampler PGM use its independent React-selected player or
   direct presentation path.
3. Gate `BrowserProgramRenderer` compatibility fallback behind an explicit URL
   option such as `qaFallback=html-video-webgl2`; never enter it silently.
4. Let a stable generation play normally. Seek only for an intentional
   discontinuity, jump generation, scrub, or clip change. Do not seek on every
   animation frame to correct drift.
5. Add tests proving preview and PGM owners have different elements and that
   changing `currentTime`, `paused`, or generation on one does not affect the
   other.
6. Then repeat native full-reload QA and the 60-second metrics run before
   continuing G007.

Do not spend another iteration tuning RVFC fallback timing until ownership is
fixed. Do not widen the acceptance tolerance and do not share a visible media
element across owners.

## Resume commands

```sh
cd /Users/robertspaniolo/Documents/Github/beat-surfer-pro
git status --short
git log --oneline -12
bun run check
bun test
bun run build
bun run dev --host 127.0.0.1 --port 5174
```

Open only the native in-app browser at:

`http://127.0.0.1:5174/?qa=sample-media&qaAutoplay=0&qaPgm=timesampler`

Read this file, `.omx/ultragoal/goals.json`, and the tail of
`.omx/ultragoal/ledger.jsonl` before editing.

## Recent playback commits

- `8975da0` align video validation to display time
- `055d37b` settle seeks on post-seek video frames
- `4b3af9e` gate RVFC timing by display freshness
- `7806ba5` exercise every-beat video recovery
- `9d087ac` expose bounded drift diagnostics
- `959566d` accept symmetric HTML frame phase
- `150f856` align HTML fallback frame timing
- `9b79e81` render HTML fallback pixels correctly
- `8c70d3e` cap decoded-frame presentation interval

The local server and audio were stopped at handoff.
