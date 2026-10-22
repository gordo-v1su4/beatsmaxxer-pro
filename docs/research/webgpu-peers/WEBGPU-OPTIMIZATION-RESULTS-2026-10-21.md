# Immediates and shared texture bindings experiment

Branch: `codex/webgpu-immediates-shared-textures`. Tested 2026-10-21 on Windows with an NVIDIA Blackwell adapter in Codex @Browser. These are local engineering measurements, not a cross-device release claim.

## Changes

- Optional 64-byte immediates carry beat/audio/timeline values. Integer timeline fields retain their raw u32 bits. Each binding retains its own parameter writer; the remaining uniform data uploads only when its consumed values change.
- A real validation-scoped binding probe checks whether an owned RGBA texture view can occupy an external-texture binding. Supported devices share the shader and pipeline layout between imported video and owned/cached textures; unsupported devices retain the original separate shaders.
- The splash retains its original uniform shader. Persistent video copies, cut covers, seek handling and feedback lifetime remain in place.
- QA URLs can disable either feature independently: `?qa=1&fxImmediates=0&fxSharedTextures=0`. Omit a disabling parameter to use capability detection. These switches only apply in QA mode.

## Real GPU differential check

Import `/scripts/verify-fx-optimizations.browser.ts` from the local Vite server and call `verifyFxOptimizations()` in a browser development session. It compiles every effect for all four configurations, renders a deterministic owned RGBA input and feedback texture, and compares readback pixels. Test resources are destroyed afterward.

| Configuration | Effect pipelines | Modes checked | Maximum channel difference from baseline |
| --- | ---: | ---: | ---: |
| Baseline | 40 | 20 | 0 |
| Immediates only | 40 | 20 | 0 |
| Shared texture bindings only | 20 | 20 | 0 |
| Both | 20 | 20 | 0 |

No GPU validation errors. This verifies one deterministic parameter/input state per mode, not every control combination, imported-video color space, or every browser. Live playback separately exercised both external and cached video paths.

PR review follow-up (2026-10-22): the GPU differential script now renders two consecutive states per mode, changing only immediate fields for the second draw. It asserts that each immediates configuration skips all 20 second-draw uniform uploads and compares those pixels against the corresponding buffer-only states. All four configurations passed again with maximum channel difference 0 and no validation errors on the same NVIDIA adapter. This covers stale uniform-buffer values instead of allowing a full upload to mask a missing immediate rewrite.

## Live Beatsmaxxer playback samples

Four separate 10-second samples used the included 12-clip QA rack, a fresh page, the same output viewport, and one active test renderer. Another Chrome test tab had been closed before these measurements. Both optimizations preserve automatic capability fallback.

| Configuration | Uniform uploads | Bytes uploaded | Immediate updates | rAF samples | rAF median / p95 | Largest gap | Audio transport advance |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Both | 980 | 156,800 | 4,462 | 497 | 16.7 / 33.4 ms | 33.6 ms | 10.019 s |
| Baseline | 4,455 | 712,800 | 0 | 489 | 16.7 / 33.4 ms | 33.5 ms | 10.021 s |
| Immediates only | 1,230 | 196,800 | 4,661 | 561 | 16.7 / 33.3 ms | 33.5 ms | 10.021 s |
| Shared bindings only | 4,669 | 747,040 | 0 | 563 | 16.7 / 33.3 ms | 33.5 ms | 10.021 s |

All four samples reported zero GPU validation errors. Different frame counts mean raw upload totals are not equal-work throughput measurements. The strong demonstrated benefits are fewer uniform queue writes and half as many effect pipelines. The samples do not establish a frame-rate improvement or rule out longer intermittent freezes. rAF timings are browser callback cadence, not GPU pass timing or physical display scanout.

The user reported lag during development. The initial extra Chrome tab recorded Vite/Svelte hot-update runtime errors and duplicate Mediabunny loading; a full reload recovered it. That observation does not establish the cause of later playback pauses. No shader or playback strategy should be blamed solely from the report.

## Startup watchdog follow-up

The previous watchdog used a fixed loading deadline and terminated readiness observation after timeout. The revised watchdog measures lack of shader progress, pauses its deadline while hidden, and can report a slow state while continuing to watch for recovery. It still requires every pipeline and a subsequent rendered frame. Unit regressions cover an active startup lasting beyond its original deadline, late completion after a stall, hidden tabs, cancellation and failed readiness. A genuine stall remains covered with a reload option.

## Frame Lab reference

The sibling `frame-lab` repository was inspected and its existing local benchmark launched on port 5173. Initial reference runs used its unchanged renderer. Two-minute, eight-deck, Cuts & Timing runs used bundled Redline clips, MIDI vocals/synth/bass, four-repeat stem patterns, straight groove, 100% density and program switching on triggers.

Frame Lab's `beatsmaxxer` backend name means its HTML-video strategy, not this branch's full effect renderer. Those reference runs isolate playback-strategy behavior. The user then explicitly requested four controlled GPU-bank configurations and persistent evidence fields, implemented on the sibling branch `codex/webgpu-variable-benchmarks`.

The saved eight-deck GPU-bank winner (Mix onsets, straight groove, 92.1% on-time, 17.9 ms cut p95, no missed cuts) supplies the experiment controls. All new runs use the same versioned `pulse-v1` effect, 30 seconds, current fingerprints, and 720p resident sources. This controlled effect is not the full Beatsmaxxer shader catalog.

| GPU-bank configuration | Cut p95 | Render encoding CPU p95 | Missed cuts | Loop stalls >100 ms | Worst-deck freeze time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 19.2 ms | 0.200 ms | 0 | 0 | 0 s |
| Immediates only | 18.7 ms | 0.100 ms | 0 | 0 | 0 s |
| Shared bindings only | 18.2 ms | 0.200 ms | 0 | 0 | 0 s |
| Both | 19.3 ms | 0.200 ms | 0 | 0 | 0 s |

No GPU validation errors. Immediates enabled: zero uniform writes, 16,254 immediate updates per run. Baseline: 14,456 uniform writes; shared only: 14,448. Single short previews do not establish statistical performance improvements. The combined configuration did not demonstrate a speed win. Frame Lab's presenter already has one pipeline, so only Beatsmaxxer's own shader test establishes the 40-to-20 pipeline reduction.

The sibling documentation `docs/gpu-renderer-variable-test.md` records the protocol and evidence filenames. Feature flags, fingerprints, CPU measurements and raw cut/frame observations are retained in JSON, CSV exports, repeat controls and the comparison table; historical results without flags are labeled Not recorded.
