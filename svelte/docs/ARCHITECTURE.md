# Architecture

Beat Surfer Pro is a browser-native SvelteKit application with one rendering backend: **WebGPU**. It does not ship a WebGL, Three.js, or alternate renderer fallback.

This document describes the current runtime under `svelte/src/`. See [SHIP_PLAN.md](SHIP_PLAN.md) for release status and [LOCAL_TESTING.md](LOCAL_TESTING.md) for test commands.

## Runtime ownership

| Responsibility | Owner | Entry point |
|---|---|---|
| Application cadence | `AppLoop` | [`src/lib/runtime/AppLoop.ts`](../src/lib/runtime/AppLoop.ts) |
| Semantic transport time | `AudioTimeline` | [`src/lib/transport/AudioTimeline.ts`](../src/lib/transport/AudioTimeline.ts) |
| Audio playback and analysis state | `AudioEngine` | [`src/lib/audio/AudioEngine.ts`](../src/lib/audio/AudioEngine.ts) |
| Canvas bindings and GPU submission | `WebGpuEngine` | [`src/lib/rendering/webgpu/WebGpuEngine.ts`](../src/lib/rendering/webgpu/WebGpuEngine.ts) |
| Clip registration and replacement | `MediaRuntime` | [`src/lib/runtime/media/MediaRuntime.ts`](../src/lib/runtime/media/MediaRuntime.ts) |
| Live video elements | `VideoPool` | [`src/lib/media/VideoPool.ts`](../src/lib/media/VideoPool.ts) |
| Beat-quantized PGM selection | `PgmDirector` | [`src/lib/runtime/pgm/PgmDirector.ts`](../src/lib/runtime/pgm/PgmDirector.ts) |

## WebGPU-only render path

`WebGpuEngine` acquires one shared `GPUDevice`. Every preview and the PGM monitor render through WGSL pipelines. If WebGPU initialization fails, the capability gate reports that failure; the app does not switch to another renderer.

Each rendered video frame follows this path:

```text
HTMLVideoElement
  -> GPUDevice.importExternalTexture() for the current JavaScript task
  -> WGSL texture_external binding
  -> module FX pass into the feedback write texture
  -> feedback ping-pong swap
  -> blit pass into the canvas swapchain texture
```

The engine imports and binds the `GPUExternalTexture` together inside `encodeBinding()`. It never caches an external texture or its bind group across tasks. When the source is absent, not ready, or cannot be imported, the engine uses the idle/test-card pipeline instead.

The shared WGSL program has an explicit effect mode for each of the 18 catalog modules. Each canvas owns a feedback pair. Timeline generation and fixed-step indices determine whether feedback advances or resets before the final blit.

## Stable canvas slots and module hot-swap

Rack canvases use slot IDs (`top-0` through `top-3` and `bottom-0` through `bottom-3`) rather than module IDs. Svelte keys each rack row by the stable slot ID.

Those same eight slot IDs are the media ownership boundary:

- the slot owns the local file, object URL, `HTMLVideoElement`, decoder state, clip status, and cached seek frame;
- the catalog module owns WGSL effect selection, parameters, bypass/mute state, and MIDI behavior;
- changing a module assignment never moves, reloads, or duplicates the slot's video;
- production media registration rejects sources outside the eight stable slot IDs.

`WebGpuCanvas` calls `attachCanvas()` when the canvas mounts and `detachCanvas()` when it is destroyed. If drag-and-drop changes the module assigned to an existing slot, its reactive effect calls `setCanvasModule(canvasId, moduleId)`. The engine updates the binding in place instead of reconfiguring the GPU canvas.

The PGM monitor is intentionally different:

- its stable canvas ID is `pgm`;
- `PgmDirector` and immediate PGM controls call `setPgmLiveModule(moduleId, sourceId)` with the selected rack slot;
- `renderAll()` applies the selected module effect while reusing that slot's existing video element and decoder;
- if the effect assigned to the on-air slot changes, PGM keeps the slot on air and adopts its replacement effect.

Do not route PGM source changes through rack-slot `setCanvasModule()`. The dedicated PGM source keeps beat-quantized cuts independent from rack layout changes.

## One timeline and one animation loop

`audioTimeline` is the only application `AudioTimeline` instance. It binds to the active `AudioContext` and derives transport position from `AudioContext.currentTime`. Play, pause, seek, loop-wrap, source, and playback-rate changes re-anchor or advance its generation.

`AppLoop` is the sole production owner of `requestAnimationFrame`. Each frame it calls `audioTimeline.publishFrame()`. Ordered subscribers then receive the same immutable `TimelineFrame`, including:

- audio-context time and transport position;
- beat position, phase, and BPM;
- playback rate and playing state;
- generation and queued discontinuity events;
- fixed-step index, phase, and deterministic seed.

`AudioEngine` updates audio, beat, timesampler, and PGM scheduling from that frame. `AppLoop` updates controlled video time, shader parameters, the sequencer, and finally calls `WebGpuEngine.renderAll(frame)`. `WebGpuEngine.start()` and `stop()` are compatibility no-ops; they do not create a second loop.

## Media lifecycle

Clips are created lazily when a user or QA path assigns a file or URL. `ClipRegistry` owns object URLs, while `MediaRuntime` coordinates state publication and `VideoPool` element ownership.

A clip replacement is transactional:

1. Stage the registry entry and mark the slot loading.
2. Prepare a candidate `HTMLVideoElement` without replacing the active element.
3. Prewarm the candidate until it has a decoded frame.
4. Reject stale candidates by generation.
5. Commit the candidate, publish the clip, and mark the slot ready.
6. Release the replaced element and object URL.

`MediaRuntime` serializes replacements **per stable slot**. Bulk rack loading starts different slot assignments together; it is not a global serial decoder queue. Clearing a slot or disposing the app invalidates pending candidates, aborts prewarm work, detaches video elements, releases object URLs, and clears published clip state.

The eight-video release proof uses the same production ownership model. It loads eight distinct real MP4s concurrently, keeps exactly eight video elements throughout the session, renders PGM as a ninth presentation of one selected slot, and then hot-swaps every catalog effect without changing the original eight media identities.

## Physical-browser release proof

Automated unit, build, and generic browser gates do not prove the release. The headed eight-video gate requires:

- eight distinct real MP4s loaded together through the visible `CLIPS` control;
- exactly eight live `HTMLVideoElement` identities before, during, and after PGM cuts and effect swaps;
- `Redline (Remastered).mp3` loaded through `SONG -> ANALYZE`, with Essentia route provenance, advancing audio time, and non-zero audio energy;
- at least 30 seconds of simultaneous motion, decode cadence, dropped-frame, drift, frame-time, and GPU-error telemetry;
- PGM reuse of the selected rack slot rather than a ninth decoder;
- per-animation-frame evidence while every catalog WGSL effect is swapped through a row-valid stable slot;
- no test-card frame, source substitution, decoder churn, canvas replacement, external media host, console error, or GPU error;
- PNG evidence plus a named physical observer attesting that audio was audible and unacceptable lag was not observed.

[`scripts/capture-eight-video-proof.sh`](../scripts/capture-eight-video-proof.sh) writes `.artifacts/eight-video-proof/report.json` and PNG evidence. [`scripts/verify-eight-video-proof.sh`](../scripts/verify-eight-video-proof.sh) independently verifies the report, source/build digests, fixture metadata, PNG hashes, and all runtime thresholds.

The base eight-video/PGM run has passed on the documented local Chrome/Apple-Metal envelope. A fresh headed run of the all-catalog hot-swap extension remains required after any media, timeline, renderer, or shader change.

## Startup and shutdown

[`src/routes/+page.svelte`](../src/routes/+page.svelte) performs startup in this order:

1. probe WebGPU and initialize the engine;
2. start transport display polling, PGM scheduling, and `AppLoop`;
3. install the QA hook;
4. optionally load QA media and start playback.

On destroy it stops `AppLoop`, PGM scheduling, and display polling, then disposes `MediaRuntime` and `WebGpuEngine`. Canvas components separately detach their own bindings when Svelte destroys them.
