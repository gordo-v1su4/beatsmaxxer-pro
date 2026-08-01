# Ship plan

**Release status: BLOCKED.** The current code contains the WebGPU render path, shared audio timeline, media lifecycle, effect catalog, browser gates, and physical-proof harness. The repository does not contain the required `.artifacts/visual-proof/report.json` and PNG evidence, so none of those implementation claims constitute release proof.

This plan supersedes the stale status in [`../../docs/beat_surfer_ship_gate_1b8af462.plan.md`](../../docs/beat_surfer_ship_gate_1b8af462.plan.md). See [ARCHITECTURE.md](ARCHITECTURE.md) for runtime design and [LOCAL_TESTING.md](LOCAL_TESTING.md) for test commands.

## Current implementation

These items are present in the current source. A checked item means **implemented in code**, not physically browser-proven.

### Rendering and timing

- [x] WebGPU/WGSL is the only render backend; there is no WebGL or Three.js fallback.
- [x] Rack canvases use stable slot IDs and `setCanvasModule()` for in-place module reassignment.
- [x] PGM uses the stable `pgm` canvas and its dedicated `setPgmLiveModule()` source path.
- [x] Video sampling imports `GPUExternalTexture` at the render call site and binds it as WGSL `texture_external`.
- [x] Module FX render offscreen through feedback ping-pong textures, then blit to the canvas.
- [x] `audioTimeline` derives semantic transport time from `AudioContext.currentTime`.
- [x] `AppLoop` owns the sole production `requestAnimationFrame` loop and publishes one shared frame to runtime consumers.

### Media and controls

- [x] Clip replacement uses staged candidates, decoded-frame prewarm, generation invalidation, transactional commit, and old-source release.
- [x] Same-module replacements are queued; clear and dispose invalidate pending media work.
- [x] The normal media path creates video elements only when clips are assigned.
- [x] The top bar exposes BPM, key, pitch, tempo, volume, factory presets, undo, and redo.
- [x] Rack parameter history groups continuous gestures and multi-parameter preset changes into undoable operations.
- [x] Every catalog module exposes three named module presets in its rack controls.
- [x] The old side-rail `PresetBrowser` component is not mounted; presets remain available in the top bar and module controls.

### Effect catalog and deployment wiring

- [x] The catalog advertises 18 modules.
- [x] WGSL assigns one unique effect mode and explicit effect body to each catalog module.
- [x] The preset catalog provides 54 named module presets: three per module.
- [x] Root scripts delegate development, tests, build, and proof commands to `svelte/`.
- [x] `vercel.json` installs and builds `svelte/`, serves `svelte/build`, and routes analysis requests to the API function.

## Required release evidence

All items in this section remain open until the physical artifacts exist and the verifier accepts them.

- [ ] Capture `.artifacts/visual-proof/report.json` in a human-observed headed browser.
- [ ] Capture valid before/after PNG evidence for every manifest item.
- [ ] Exercise all 13 staged real MP4 files through the visible `CLIP` input with visible motion and valid cadence metrics.
- [ ] Attach and release real clips serially with `maxSimultaneousDecoded === 1` during proof capture.
- [ ] Play `Redline (Remastered).mp3` through `SONG -> LOCAL ONLY`; prove advancing media/context time and non-zero audio energy.
- [ ] Prove the renderer used a task-scoped external texture for each real clip rather than the idle/test-card path.
- [ ] Prove every module, all 54 presets, all 18 shader entries, and every enabled advertised control produce the intended non-black before/after change.
- [ ] Prove every captured subsystem observed the same `AudioContext.currentTime`-derived timeline frame and deterministic position.
- [ ] Record zero external analysis requests during the real-media phase.
- [ ] Record zero console, uncaught JavaScript, GPU, and capture errors.
- [ ] Meet automated frame cadence, dropped-frame, stalled-frame, and media-time tolerance thresholds.
- [ ] Record the physical operator's explicit `lagObserved: false` attestation while observing the headed session.
- [ ] Re-run verification without changing source, build output, fixture hashes, catalog inventory, or control inventory after capture.

## Production acceptance

The physical-proof report is necessary but does not replace final deployment checks.

- [ ] Verify the Vercel preview serves the current Svelte build.
- [ ] Verify the production analysis route and configured consent flow.
- [ ] Check the release in supported Chrome/Edge and Safari WebGPU environments.
- [ ] Attach the verified report, PNG set, and operator recording or review notes to the release or pull request.
- [ ] Merge or deploy only after every required evidence and production-acceptance item is complete.

## Verification snapshot

Documentation refresh validation on 2026-08-01:

- `bun run test`: 177 passed, 2 skipped; no failures.
- `bun run check`: 0 errors and 0 warnings.
- `bun run build`: completed and wrote the static site to `svelte/build`.
- Relative links in this document, [ARCHITECTURE.md](ARCHITECTURE.md), both README files, and their referenced local files resolve.
- Shell syntax checks pass for the local, capture, and physical-proof verification scripts.
- No browser was launched for this documentation task. `.artifacts/visual-proof/report.json` remains absent, so the physical proof status remains blocked.

## Stop condition

The ship gate passes only when the physical-proof verifier returns no blockers and the production-acceptance checklist is complete. A passing unit suite, successful build, headless browser run, staged real-media directory, or partially created browser profile does not satisfy this stop condition.
