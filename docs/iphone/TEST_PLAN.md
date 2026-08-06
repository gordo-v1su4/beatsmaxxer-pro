# iPhone Test and Acceptance Plan

## 1. Testing principle

Beat Surfer Pro is not considered working because a screen launches or a shader compiles. Verification follows the complete user-visible path: import, prepare, play, perform, record, replay, export, save, and reopen.

The simulator is appropriate for domain logic and most SwiftUI checks. Decode, Metal/wgpu interop, timing, memory, thermal behavior, haptics, Photos, and final export require a physical iPhone.

## 2. Planning-package verification

Before app implementation begins:

- Every link in `docs/iphone/README.md` resolves.
- The wireframe contains all six required screen modes.
- Primary controls respond to mouse, touch emulation, and keyboard activation.
- The visual fits 390×844, 393×852, and 430×932 portrait viewports.
- The visual fits 844×390, 852×393, and 932×430 landscape viewports.
- No control or label overlaps, clips, or becomes unreachable.
- All essential wireframe hit targets are at least 44 CSS pixels in the reference rendering.
- The three static concepts exist, open successfully, and agree with the product geometry.
- Git diff contains only planning documents and mockup assets.

## 3. Automated implementation tests

### Domain and persistence

- Round-trip every V1 contract.
- Reject unknown future schema versions without mutation.
- Stable event ordering for equal sample frames.
- Atomic-save failure at create, write, sync, and replace stages.
- Last-valid manifest recovery.
- Project duplicate/delete and referenced-asset rules.
- Temporary import/export cleanup is idempotent.

### Clock and scheduler

- Beat↔sample-frame conversions across all supported BPM values.
- Quarter, half, one, and two-beat quantization.
- Boundary behavior exactly on, immediately before, and immediately after a beat.
- Queue, cancel, late-ready, immediate-cut, restart, pause, seek, and resume.
- Manual BPM/downbeat correction invalidates and rebuilds scheduled mapping.
- Three-minute clock comparison remains within 20 ms.

### Media preparation

- H.264 and HEVC in `.mov` and `.mp4`.
- Landscape, portrait, rotated metadata, variable frame rate, and HDR input.
- Proxy is 720p maximum, 30 fps, H.264, and SDR.
- Original source remains unchanged.
- Clip audio is excluded from performance/export.
- Cancellation leaves no promoted partial asset.
- Low-space calculation precedes copy.

### Deck and renderer

- Valid/invalid deck state transitions.
- Current and queued lanes cannot be evicted.
- Prewarm is bounded and disposable.
- Ready cut has no black frame.
- Late source moves to the next allowed boundary and emits a warning.
- Every effect default, range, bypass, preset, and seed.
- Live and offscreen effect outputs match within documented GPU tolerance.
- Normal decode/render path reports zero CPU video-plane bytes.

### Takes and export

- Record every action type with sample frame and sequence.
- Parameter coalescing preserves the 30 fps result.
- Interrupted take recovers to last complete action.
- Replay matches the recorded decisions within one frame.
- Export frame count equals duration×30 fps.
- Output contains one video track and one AAC song track.
- A/V sync is within one output frame.
- Cancel/retry never promotes an incomplete file.

## 4. SwiftUI and accessibility tests

- Project creation, import, Prepare, Live, Takes, and Export journeys.
- Portrait and landscape snapshot tests at every reference size.
- Repeated rotation during playback, queue, effect hold, and take recording.
- VoiceOver labels include slot, media, state, and action.
- Complete core workflow without gesture-only actions.
- Dynamic Type through accessibility large on non-Live screens.
- Live bounded scaling retains all controls and VoiceOver values.
- Reduced Motion removes pulses without removing state.
- State remains understandable in grayscale and increased contrast.
- Every actionable target is at least 44×44 points.

## 5. Physical-device matrix

Minimum matrix:

- User's current iPhone on the target iOS release.
- iPhone 13/A15-class baseline on the minimum supported iOS release.
- A large-screen iPhone for 430×932 layout verification.

Representative media set:

- Eight 4K HEVC portrait phone clips.
- Eight 1080p H.264 landscape clips.
- Mixed portrait/landscape, VFR, and HDR sources.
- One three-minute 44.1 kHz song and one 48 kHz song.
- Known-BPM analysis fixtures at slow, medium, and fast tempos.
- Corrupt, truncated, unsupported, and zero-duration files.

## 6. Interruption and failure scenarios

- Photos permission denied, limited, and later expanded.
- Files picker cancelled.
- App backgrounded during copy, analysis, live play, take recording, and export.
- Incoming call/Siri interruption.
- Speaker, wired, Bluetooth, and route-loss changes.
- Device rotation during every transport state.
- Memory warning while prewarming.
- Serious and critical thermal state handling.
- Insufficient import and export storage.
- Force quit during manifest save, media copy, take recording, and export.
- Missing original, proxy, thumbnail, or song at reopen.
- Decoder or renderer failure while a clip is queued.

## 7. Release thresholds

- PGM sustains 30 fps on the A15 baseline during the representative three-minute set.
- SwiftUI interaction remains responsive at 60 Hz during normal performance.
- No normal-path decoded frame passes through Swift, FFI serialization, or CPU pixel storage.
- No black frame occurs on ready quantized cuts.
- Ready cuts present within two display refreshes of the scheduled boundary.
- Audio drift remains below 20 ms over three minutes.
- Export A/V sync remains within one 30 fps frame.
- A three-minute export completes within six minutes on the A15 baseline.
- Memory reaches a bounded steady range during a ten-minute loop.
- Normal three-minute use does not reach critical thermal state.
- Incomplete operations recover or fail explicitly.
- No crash, hang, silent project corruption, or orphaned large temporary file is accepted.

## 8. TestFlight acceptance journey

An invited tester who has not seen the developer tools must be able to:

1. Install and launch the TestFlight build.
2. Create a project.
3. Choose a song and correct its beat if requested.
4. Add and trim eight clips.
5. Enter Live and understand current versus queued clips.
6. Record a three-minute take with multiple cuts and effects.
7. Replay the take.
8. Export and save/share the final video.
9. Reopen the project after terminating the app.

The journey passes only when it completes without developer intervention and the final visible video is inspected for content, effects, timing, and audio sync.
