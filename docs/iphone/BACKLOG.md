# iPhone Implementation Backlog

This backlog begins only after the planning and visualization package is approved. Each story is a bounded task and must be implemented from a task packet using the template in `task-packets/README.md`.

## Working rules

- One story per change unless its dependencies explicitly say otherwise.
- Public contract changes require a dated entry in `DECISIONS.md` first.
- No polished UI implementation begins before the zero-copy physical-device gate passes.
- Every story reports changed files, tests, evidence, remaining risks, and the next eligible story.
- Web and desktop behavior must remain unchanged unless a story explicitly names shared code and its regression tests.

## IPH-00 — Planning baseline

**Outcome:** an approved, durable, internally consistent specification.

- **IPH-001 — Dedicated branch:** Create `codex/iphone-app` from approved main commit `9ffd58a`. Done when the clean branch and base SHA are recorded.
- **IPH-002 — Planning documents:** Add product, architecture, backlog, testing, and decision documents. Done when every linked document resolves and agrees on MVP scope.
- **IPH-003 — Interactive wireframe:** Model the required screens and primary states without real media behavior. Done when it works at all reference sizes and by keyboard.
- **IPH-004 — Polished concepts:** Produce Portrait Live, Landscape Live, and Prepare/Import images. Done when all three are stored with reproducible prompts and inspected for layout consistency.
- **IPH-005 — Planning reconciliation:** Update dimensions and behavior from the approved mockups. Done when the documents, wireframe, and concept images no longer conflict.

## IPH-10 — Apple toolchain and empty shell

**Dependencies:** IPH-00 approved.

- **IPH-101 — SwiftUI shell:** Create an iOS 18 SwiftUI application using `com.gordo.beatsurferpro`. Done when it installs and launches on the user's physical iPhone.
- **IPH-102 — Configurations:** Add Debug, physical-device Release, and TestFlight build configurations without checked-in signing secrets. Done when configuration intent is documented and build settings can be inspected.
- **IPH-103 — Rust XCFramework task:** Add a repository task that builds device and simulator slices and packages an ignored XCFramework. Done when a clean Mac checkout can reproduce it.
- **IPH-104 — Typed bridge proof:** Send one typed command Swift→Rust and one event Rust→Swift. Done when simulator and device tests prove queue/main-actor behavior.
- **IPH-105 — Metal host view:** Host an empty `CAMetalLayer` in SwiftUI and preserve it across rotation. Done when layer size, scale, and lifecycle events are logged correctly.

## IPH-20 — Domain model and persistence

**Dependencies:** IPH-10.

- **IPH-201 — Versioned contracts:** Implement `ProjectManifestV1`, `MediaAssetV1`, `AnalysisResultV1`, `ActionEventV1`, and `PerformanceTakeV1`. Done when round-trip and invalid-version fixtures pass.
- **IPH-202 — Project reducer:** Express every project mutation as a typed command over immutable prior state. Done when reducer tests cover create, rename, asset assignment, rack changes, takes, and exports.
- **IPH-203 — Atomic persistence:** Implement write-new, sync, replace, and last-valid recovery. Done when forced failures at each stage preserve a loadable manifest.
- **IPH-204 — Project lifecycle:** Implement create, list, rename, duplicate, and confirmed delete. Done when managed files and manifest references remain consistent.
- **IPH-205 — Migration harness:** Add V1 fixtures and a no-op migration runner ready for V2. Done when unsupported future versions fail without mutation.

## IPH-30 — Media import and preparation

**Dependencies:** IPH-20.

- **IPH-301 — System pickers:** Add PhotosPicker and Files import with limited-library handling. Done when denial and cancellation return explicit non-error states.
- **IPH-302 — Managed copy:** Copy selected assets with progress, cancellation, hashes, and temporary names. Done when interrupted copies are cleaned safely.
- **IPH-303 — Inspection:** Validate container, codec, duration, orientation, dimensions, frame rate, color metadata, and available space. Done when each failure maps to actionable copy.
- **IPH-304 — Thumbnail/proxy:** Create still thumbnails and 720p30 H.264 SDR proxies. Done when landscape, portrait, VFR, and HDR fixtures normalize correctly.
- **IPH-305 — Eight clip slots:** Implement assign, replace, clear, reorder, and non-destructive trim. Done when referenced-take warnings work.
- **IPH-306 — Storage cleanup:** Remove abandoned temporary imports without touching referenced media. Done when cleanup is idempotent.

## IPH-40 — Audio clock and song analysis

**Dependencies:** IPH-20.

- **IPH-401 — Audio session:** Configure media playback, routes, and interruption callbacks. Done when speaker, wired, and Bluetooth changes are observable.
- **IPH-402 — Transport:** Play, pause, stop, and seek one managed song through `AVAudioEngine`. Done when transport state is deterministic after rapid commands.
- **IPH-403 — Clock anchors:** Publish sparse audio sample-time anchors to Rust. Done when three-minute drift remains under 20 ms.
- **IPH-404 — Local analysis:** Produce onsets, BPM, beats, confidence, and broad sections from mono PCM. Done when known-BPM fixtures meet the test tolerances.
- **IPH-405 — Progress/cancellation:** Report named stages and cancel without partial promotion. Done when restarting analysis produces one current result.
- **IPH-406 — Manual correction:** Add numeric BPM, tap tempo, and downbeat offset. Done when corrections persist and regenerate the beat map.

## IPH-50 — Zero-copy physical-device spike

**Dependencies:** IPH-10 and IPH-40. **Stop/go gate.**

- **IPH-501 — Apple-platform decoder boundary:** Compile the existing decoder for iOS without breaking macOS. Done when both target builds pass.
- **IPH-502 — Retained decoded frame:** Decode one proxy into an IOSurface-backed `CVPixelBuffer`. Done when lifetime and release are proven under sanitizers/instrumentation.
- **IPH-503 — Native presentation:** Import the surface into wgpu/Metal and present through the hosted layer. Done when counters show no CPU video-plane copy.
- **IPH-504 — Two-lane cut:** Decode current and incoming sources and execute a scheduled cut. Done when no black frame appears.
- **IPH-505 — Instrumentation:** Record decode latency, queue depth, frame age, dropped presentation, copy count, and memory. Done when a diagnostics snapshot exposes every metric.
- **IPH-506 — Stress proof:** Loop mixed clips for ten minutes on the baseline iPhone. Done when PGM holds 30 fps and memory is bounded.

## IPH-60 — Compositor and effect subset

**Dependencies:** IPH-50 passes.

- **IPH-601 — Shared renderer boundary:** Separate reusable shader/effect behavior from browser and desktop surfaces. Done when existing tests remain green.
- **IPH-602 — Current/incoming composite:** Implement cut and transition compositing. Done when live and offscreen paths produce matching fixture frames.
- **IPH-603 — Eight mobile effects:** Implement the locked effect catalog. Done when every effect compiles, bypasses, and renders on the baseline device.
- **IPH-604 — Parameter contracts:** Limit each effect to one primary and up to two secondary normalized parameters. Done when defaults and ranges are fixture-tested.
- **IPH-605 — Deterministic randomness:** Seed procedural/noise behavior. Done when repeated replay hashes match within documented GPU tolerance.
- **IPH-606 — Safe bypass:** Convert unsupported shader/device failures into visible bypass state. Done when playback continues.

## IPH-70 — Hot deck and quantized scheduling

**Dependencies:** IPH-40, IPH-50, and IPH-60.

- **IPH-701 — Deck state machine:** Implement cold, warming, warm, hot, failed, and disposed states. Done when invalid transitions are rejected.
- **IPH-702 — Lane allocator:** Map eight logical slots over current, incoming, and prewarm lanes. Done when current/queued sources cannot be evicted.
- **IPH-703 — Quantization:** Support quarter, half, one, and two-beat boundaries. Done when boundary tests cover seeks and manual tempo changes.
- **IPH-704 — Cut commands:** Implement queue, cancel, immediate cut, delayed-ready cut, and restart. Done when all produce explicit events.
- **IPH-705 — State/haptics events:** Publish current, queued, warming, ready, late, and failed states. Done when Swift can render them without querying engine internals.
- **IPH-706 — Prewarm policy:** Prewarm the most likely candidate without memory growth. Done when pressure and thermal changes disable it safely.

## IPH-80 — SwiftUI product interface

**Dependencies:** IPH-20, IPH-30, and stable IPH-70 contracts.

- **IPH-801 — Projects/new project:** Implement recent projects, empty state, creation, rename, duplicate, and delete. Done when UI tests cover every branch.
- **IPH-802 — Import/Prepare:** Implement song status, eight clip rows, correction sheet, and rack summary. Done when partial preparation remains usable.
- **IPH-803 — Portrait Live:** Implement the fixed geometry in `PRODUCT_SPEC.md`. Done when all baseline-size snapshots pass.
- **IPH-804 — Landscape Live:** Implement split PGM/control geometry and rotation continuity. Done when state survives repeated rotation.
- **IPH-805 — Clip/effect sheets:** Implement trim, replace, remove, parameter, reset, preset, and accessible gesture equivalents. Done when all actions are labeled.
- **IPH-806 — Takes/Export UI:** Implement take list, replay, settings summary, progress, completion, and failure. Done when interrupted states are explicit.
- **IPH-807 — Accessibility:** Add VoiceOver, Dynamic Type policy, reduced motion, contrast, and switch-control paths. Done when the core flow completes without gestures.

## IPH-90 — Performance takes

**Dependencies:** IPH-70 and IPH-80.

- **IPH-901 — Take lifecycle:** Start, stop, cancel, name, and persist takes. Done when invalid start conditions explain themselves.
- **IPH-902 — Action recording:** Record all transport, clip, quantization, effect, and interruption events. Done when simultaneous-event ordering is stable.
- **IPH-903 — Parameter coalescing:** Reduce drag frequency while preserving the 30 fps visual result. Done when replay comparison passes.
- **IPH-904 — Proxy replay:** Replay a take through the live engine. Done when actions match within one output frame.
- **IPH-905 — Recovery:** Recover an interrupted take to its last complete action and label it. Done when forced termination fixtures pass.

## IPH-100 — Deterministic export

**Dependencies:** IPH-60 and IPH-90.

- **IPH-1001 — Fixed-step renderer:** Render offscreen at 1080p30 from sample time. Done when requested frame count is exact.
- **IPH-1002 — Original-source replay:** Resolve take events against original clip media and trims. Done when proxies are not read by the export path.
- **IPH-1003 — Writer:** Encode H.264 and AAC with the project aspect ratio. Done when the output opens in Photos and QuickTime.
- **IPH-1004 — Operation lifecycle:** Add storage estimate, progress, cancellation, retry, and temporary cleanup. Done when cancellation leaves no promoted output.
- **IPH-1005 — Validation:** Check duration, frame count, playable tracks, and A/V sync. Done when invalid output cannot be marked complete.
- **IPH-1006 — Delivery:** Save to Photos/Files and share. Done when permission denial keeps the completed local export available.

## IPH-110 — Lifecycle and resilience

**Dependencies:** IPH-70 through IPH-100.

- **IPH-1101 — Interruptions:** Pause safely for calls, Siri, routes, and backgrounding. Done when each writes a take marker if recording.
- **IPH-1102 — Resume:** Establish a fresh audio anchor and resolve stale queued actions. Done when no clock jump occurs.
- **IPH-1103 — Memory pressure:** Drop prewarm work before current/incoming. Done when playback survives a simulated warning.
- **IPH-1104 — Thermal adaptation:** Reduce preview/prewarm at serious thermal state and preserve recovered take at critical. Done when state is visible.
- **IPH-1105 — Failure matrix:** Handle low storage, corrupt media, unsupported codec, decoder loss, and renderer loss. Done when no case becomes a silent blank PGM.
- **IPH-1106 — Diagnostics:** Export device/media/timing counters without media or secrets. Done when privacy review passes.

## IPH-120 — Private TestFlight release

**Dependencies:** all MVP epics.

- **IPH-1201 — Full verification:** Run unit, integration, UI, accessibility, physical-device, and export suites. Done when release thresholds pass.
- **IPH-1202 — Device matrix:** Test the user's phone plus an A15-class baseline. Done when results are attached to the release record.
- **IPH-1203 — Privacy metadata:** Add usage descriptions and privacy manifest. Done when archive validation reports no missing declarations.
- **IPH-1204 — TestFlight build:** Configure App Store Connect and upload a signed build. Done when processing completes.
- **IPH-1205 — Invited-tester journey:** Install, create, perform, export, and share without developer intervention. Done when diagnostic feedback is collected.
- **IPH-1206 — Release triage:** Fix only crash, corruption, sync, unusable flow, and acceptance-gate failures; move feature requests to post-MVP.

## Later epics

- Auto-performance generation that outputs the same `PerformanceTakeV1` event log.
- Public App Store onboarding, support, privacy policy, and listing.
- Longer sessions, expanded effects, 4K/HDR/60 fps, and clip audio.
- Android platform layer after engine contracts and export behavior stabilize.
