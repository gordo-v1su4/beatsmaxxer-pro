# Native iPhone Architecture

## 1. Architecture objective

Provide responsive beat-scheduled performance and deterministic export on an iPhone without moving decoded video frames through JavaScript, Swift object graphs, JSON, or CPU byte arrays.

The architecture extends the repository's existing direction: Apple hardware decode, retained `CVPixelBuffer`/IOSurface frames, a native wgpu compositor, a small UI/control bridge, stable deck lanes, and one authoritative musical clock.

## 2. Planned repository boundaries

No directories in this section are created by the planning package. They describe the later implementation shape.

- `ios/BeatSurferPro/` — SwiftUI application, Apple lifecycle, audio session, importers, accessibility, and native view hosting.
- `crates/bsp-engine/` — project reducer, scheduler, hot-deck state, action log, replay, and diagnostics.
- `crates/bsp-render/` — wgpu compositor, effect graph, live surface rendering, and offscreen export rendering.
- `crates/bsp-decode/` — extend the present Apple decoder behind Apple-platform abstractions rather than macOS-only UI assumptions.
- Existing `svelte/` code remains the web product and is not embedded in the iPhone application.

## 3. Ownership model

### Swift owns

- SwiftUI navigation and view state.
- PhotosPicker and Files importers.
- Permission and privacy presentation.
- App lifecycle, orientation, safe areas, Dynamic Type, VoiceOver, and haptics.
- `AVAudioSession` and `AVAudioEngine`.
- `CAMetalLayer` hosting.
- Save to Photos, document export, and share sheet.
- Signing, entitlements, and TestFlight configuration.

### Rust owns

- Versioned project-domain state and persistence rules.
- Audio-sample-frame timeline and beat mapping.
- Quantized action scheduling.
- Logical clip-slot and physical decoder-lane state.
- Video decode orchestration and retained-frame lifetime.
- wgpu/Metal rendering and effects.
- Take recording and deterministic replay.
- Offscreen export-frame generation.
- Metrics and structured media-engine errors.

## 4. Bridge policy

Use UniFFI for ordinary commands, immutable snapshots, and structured events. Use a narrow C/Objective-C shim only for Apple object handles and Metal/IOSurface integration that cannot be expressed safely through UniFFI.

Hard rules:

- No decoded pixel planes cross the bridge.
- No per-frame JSON, callbacks, or Swift allocations.
- Engine snapshots are emitted at no more than 15 Hz.
- PGM rendering is native and independent of SwiftUI redraw cadence.
- Continuous parameter drags are coalesced before entering the engine.
- Bridge callbacks name their delivery queue; Swift converts UI changes to the main actor.

## 5. Authoritative time

`AVAudioEngine` sample time is the sole playback authority. Native or Rust implementation alone does not solve synchronization; all subsystems must follow the same clock.

- Project time is stored as integer audio sample frames.
- Beat positions map to sample frames using the persisted analysis result.
- Swift supplies start, pause, resume, seek, route-change, and interruption anchors.
- Rust schedules source and effect actions against those anchors.
- Display refresh time chooses which ready frame to present but cannot redefine musical time.
- Export advances through the same sample-frame timeline at a fixed frame cadence.

Events with the same sample frame are ordered by a monotonic sequence number.

## 6. Media preparation

### Song

1. Copy the chosen song into managed project storage.
2. Inspect duration and decode support.
3. Decode mono PCM for analysis.
4. Produce tempo, beat positions, onset strength, confidence, and broad structural sections.
5. Persist the analysis using `AnalysisResultV1` semantics.
6. Allow manual BPM, tap-tempo, and downbeat correction.

Analysis is local-first. A hosted Essentia adapter may be added later, but the MVP ships no secret API key and does not require a backend.

### Video clips

1. Copy the original into managed storage.
2. Validate container, codec, duration, orientation, dimensions, frame rate, color metadata, and space.
3. Generate a still thumbnail.
4. Normalize a 720p30 H.264 SDR performance proxy.
5. Persist original/proxy/thumbnail relative paths and content hash.

Supported MVP containers are `.mov` and `.mp4`; supported video codecs are H.264 and HEVC. Variable frame rate and HDR sources are normalized for live use. Clip audio is ignored.

## 7. Live decode and render flow

1. Decode the current and incoming performance proxies through AVFoundation/VideoToolbox.
2. Retain IOSurface-backed `CVPixelBuffer` frames.
3. Import those surfaces into Metal/wgpu without copying their video planes through CPU memory.
4. Composite current/incoming frames and the effect graph.
5. Present through one `CAMetalLayer`.

Eight logical clip slots map to three bounded physical lanes:

- Current/on-air lane.
- Incoming/transition lane.
- Prewarm candidate lane.

Pad thumbnails are static. A ready queued cut executes on its scheduled boundary. A late source is visibly delayed to the next allowed boundary instead of presenting black.

## 8. Effect graph

The mobile subset contains Transition, Speedramp, Tapdelay, Motion Streak, Punch Zoom, Film Grain, Light Leak, and VHS/CAM.

Each effect has:

- Stable effect ID and version.
- Bypass and activation mode.
- One primary and at most two secondary normalized parameters.
- Preset ID and default values.
- Optional deterministic random seed.

Preview and export use the same effect definitions. Unsupported shader/device behavior yields a structured safe-bypass result rather than terminating playback.

## 9. Persistent contracts

### `ProjectManifestV1`

- Schema and engine versions.
- Project UUID, title, creation/update timestamps.
- Maximum performance duration in sample frames.
- Managed song asset ID.
- Exactly eight ordered optional clip-slot IDs.
- Eight effect assignments and parameter states.
- Quantization selection.
- Analysis reference and manual corrections.
- Ordered take and completed-export IDs.

### `MediaAssetV1`

- Stable UUID and content hash.
- Managed original, proxy, and thumbnail relative paths.
- Codec and source metadata.
- Duration in sample frames.
- Orientation, dimensions, frame rate, and color mode.
- Non-destructive trim range.
- Preparation state and structured failure.

External absolute URLs are never the durable project identity.

### `ActionEventV1`

- Monotonic sequence number.
- Exact audio sample frame.
- Calculated beat index and phase.
- Versioned event type and typed payload.
- Optional deterministic seed.

### `PerformanceTakeV1`

- Take and project UUIDs.
- Engine version and audio sample rate.
- Start/end sample frames.
- Ordered actions.
- Final rack snapshot.
- Complete, recovered, or invalid state.

## 10. Command and event surface

Commands cover project load/unload, import/remove/trim, proxy preparation, song analysis/manual correction, transport, clip queue/cancel/immediate cut, quantization, effects, take recording/replay, and export start/cancel/retry.

Events cover engine snapshot, analysis/preparation progress, lane state, queued/cancelled/executed cut, late-cut warning, take state, export state, interruption, thermal/memory adaptation, and structured error.

UI code cannot reach internal decoder, renderer, or scheduler structures directly.

## 11. Performance take and export

Live recording stores decisions rather than encoded frames. Parameter drags are coalesced without changing the result at 30 fps. Random/noise effects store their seeds.

Export:

1. Loads original-quality source clips.
2. Replays the take against the sample-frame timeline.
3. Requests frames at a fixed 30 fps cadence.
4. Renders offscreen through the shared effect graph.
5. Writes 1080p H.264 plus AAC stereo song audio.
6. Validates duration, frame count, and A/V sync.
7. Atomically promotes the temporary output.

Cancelling or failing export removes only incomplete temporary output. Completed exports are immutable until the user deletes them.

## 12. Storage and recovery

Each project is a managed directory containing one manifest, song, clip originals, proxies, thumbnails, takes, and exports. Paths inside the manifest are relative.

- Manifest saves use write-new, fsync, and atomic replace semantics.
- Import and export write to temporary names before promotion.
- Launch cleanup removes abandoned temporary artifacts only after checking the manifest.
- Deleting a referenced clip requires confirmation and invalidates affected takes explicitly.
- The app estimates storage before import and export.

## 13. Lifecycle and adaptation

- Audio interruption pauses transport and records the interruption.
- Route changes establish a new audio anchor before resuming.
- Backgrounding pauses performance; the MVP does not perform live video in background.
- Memory pressure drops prewarm frames before current or incoming frames.
- Serious thermal state disables prewarm and reduces nonessential preview work.
- Critical thermal state stops recording safely and preserves the take as recovered.
- Renderer or decoder loss produces a recoverable engine state; it never silently advances through missing video.

## 14. Security and privacy

- No account or remote telemetry is required.
- No analysis secret is embedded in the binary.
- Photo access uses the system picker and limited-library support.
- Diagnostics contain state, device, codec, timing, and counters but no media payload.
- User media remains in app-managed local storage unless explicitly exported or shared.

## 15. Highest-risk gate

Before full interface implementation, a physical-device spike must prove:

- iOS build of the Apple decoder.
- Retained IOSurface-backed frames.
- Metal/wgpu import with zero CPU video-plane transfer on the normal path.
- Two-lane beat-scheduled switching with no black frame.
- Stable 30 fps PGM and bounded memory during a ten-minute loop.

Failure triggers an architecture review. It does not authorize silently replacing the design with a CPU-copy frame path.
