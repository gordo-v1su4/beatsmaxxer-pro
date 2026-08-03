# Desktop Native Video Status

Date: 2026-08-02

Branch: `cursor/desktop-tauri-e0e8`

Status: **checkpoint only — native ownership/decode architecture is working, but the current headed build fails the playback and visible-layout gates**

This is the current pickup document for the Tauri desktop work. The desktop
branch remains separate from `main`; promotion is still a deliberate review,
not an automatic merge.

## Product contract

- The loaded song owns the authoritative transport clock.
- Tempo changes transport rate and effective BPM. Pitch/key may change audio
  without changing beat time. RAND, straight, swing, and dotted controls must
  never mutate tempo, pitch, key, or volume.
- Each rack slot owns its loaded video independently of the effect module.
  Replacing an effect must not reopen or replace that slot's media.
- Preview media is predecoded at no more than 256x144 before transport starts.
- PGM retains source dimensions (1280x720 in the acceptance fixtures).
- Normal desktop playback has zero decoded video-plane bytes in Tauri IPC and
  no CPU pixel fallback.
- The compact desktop window and fixed rack geometry remain the target. Modules
  use centered cover crop rather than stretch or side letterboxing.

## Current native path

- Tauri 2 desktop shell on Vite port 5175; browser development remains on 5174.
- macOS AVFoundation/VideoToolbox decode returns retained, IOSurface-backed
  `CVPixelBuffer` frames.
- IOSurfaces import directly into Metal/wgpu; JavaScript transports control
  metadata only, never video pixels.
- Eight previews decode once during import into immutable 256x144 IOSurface
  timelines. Their VideoToolbox sessions are released before playback.
- Preview IOSurfaces are imported into wgpu once and reused across every loop.
  Full-resolution PGM frames remain live rather than entering the preview cache.
- Rectangle vertex buffers persist until layout, aspect, viewport, or effect
  identity changes; the renderer no longer allocates nine buffers per refresh.
- PGM has current and prepared-next source-resolution lanes. Latest-value
  mailboxes are sampled after Metal drawable acquisition, allowing an already
  prepared cut to enter the next refresh.
- Effect identity and normalized module parameters are sourced directly from
  rack/PGM stores and selected by the native WGSL compositor. Swapping a module
  keeps the stable slot, cached video, and decoder ownership unchanged.
- The existing 250 ms decode transport update now also carries a sparse anchor
  from the authoritative audio timeline: beat, BPM, playback rate, transport
  position, amplitude/bass, pitch, generation, and fixed-step metadata. Rust
  extrapolates beat and position locally for every drawable; there is no 60 fps
  JS-to-Rust control stream.
- SpeedRamp now sends its full Bezier profile once per control revision. Rust
  integrates the curve continuously between sparse audio-owned anchors instead
  of holding a constant source rate for 250 ms and correcting it in jumps.
- TimeSampler no longer paints the fake row-offset treatment that looked like
  corrupt frames. Its native preview follows authoritative source-time jumps
  and derives hit accents from the audio timeline. Full-resolution arbitrary
  TimeSampler PGM access still needs a bounded prewarmed random-access design;
  the current AVAssetReader lane can reopen on large discontinuities.
- One dynamically-offset uniform buffer serves up to twelve native surfaces.
  All visible effect uniforms are uploaded in one small queue write per refresh,
  which avoids nine independent GPU staging writes on the current eight-plus-PGM
  layout and stays responsive on ProMotion displays.
- Native effects provide beat-driven, parameterized GPU treatments for all 18
  registered effect modes. Full canonical formula/feedback parity with the
  browser shader remains follow-up work; it is not falsely claimed here.
- Centered `cover` UVs preserve source aspect without stretching or side bars.
- Desktop proof song loading requests hosted Essentia analysis instead of
  silently pinning the UI to the default 128 BPM.

## Last known passing headed acceptance report

Artifact: `.artifacts/desktop-eight-video/report.native-effects-final-confirmed.json` (local, not committed).

`bun run verify:desktop-eight-video` passed on the real macOS Tauri/Metal shell:

| Measurement | Result |
| --- | ---: |
| Native backend | `videotoolbox-iosurface-wgpu-metal` |
| Eight-preview + PGM duration | 30.0 s |
| Presented / expected | 1800 / 1801 |
| Estimated presentation drop rate | 0.0555% |
| Presentation p95 / p99 / max | 16.98 / 17.41 / 45.10 ms |
| Frames over 34 ms / stalls over 50 ms | 1 / 0 |
| Completed RAND cuts | 62 |
| RAND cut p95 / max | 15.95 / 17.21 ms |
| Black PGM frames | 0 |
| Preview freshness | 23.92-26.18 fps per source |
| PGM freshness | 22.62 fps |
| Preview dimensions | 256x144 |
| PGM dimensions | 1280x720 |
| Decoded CPU bytes / frame IPC bytes | 0 / 0 |
| IOSurface import failures | 0 |
| Process memory high-water | 398,311,424 bytes (~380 MiB) |
| Effect replacement | Transition -> Leak in 1 presented frame |
| Live parameter update | Leak MIX 55 -> 37 in 1 presented frame |
| Media ownership during replacement | `clip1.mp4` remained in `top-0` |
| Decoder opens during replacement | unchanged (all 0) |

The evaluator also passed 25 proof-contract tests, four `bsp-decode` tests,
three Tauri library tests, `cargo check`, and `svelte-check` with zero Svelte
errors or warnings.

This report is a historical baseline, not evidence that the current working
tree passes. The effect-timeline and diagnostic work added afterward exposed a
current regression described below.

## Current failed checkpoint (do not promote)

Artifact: `.artifacts/desktop-eight-video/report.speedramp-aspect-confirmed.json`
(local, not committed).

The fresh 30-second headed Tauri run on the current tree **failed**:

| Measurement | Current result |
| --- | ---: |
| Estimated presentation drop rate | 4.28% |
| Presentation p95 / p99 / max | 19.11 / 43.75 / 192.90 ms |
| Stalls over 50 ms / over 100 ms | 10 / 6 |
| RAND cut p95 / max | 88.79 / 314.18 ms |
| Black PGM frames | 0 |
| Unresolved cuts | 0 |
| Preview freshness | 23.23-24.76 fps per source |
| PGM freshness | 21.63 fps |
| SpeedRamp non-loop timestamp regressions | 0 |
| TimeSampler large source-time jumps exercised | 32 |

The test confirmed decoded preview frames at 256x144 and PGM at 1280x720. It
also recorded nominal canvas rectangles close to 16:9. That geometry check is
not sufficient: the live screenshot shows that the pixels painted by the
native compositor do not consistently fill/clip to those rectangles.

### Reproduced visible layout failures

At the compact 1440x900 desktop window with eight real clips and
`Redline (Remastered).mp3` loaded:

- The top-row preview pictures end above the controls, leaving a large black
  strip across all four populated modules.
- The large PGM picture can escape/overlap its intended viewer region instead
  of remaining clipped inside the 16:9 monitor.
- Bottom-row preview sizing/cropping is also visibly inconsistent and is not an
  acceptable match for the reference layout.
- The existing proof records the DOM/native surface rectangle, not the actual
  painted pixel bounds. A future pass must verify painted coverage/clipping,
  preferably from a captured native frame or a compositor-side sentinel.

Do not paper over these failures with a larger window, CSS letterboxing, or a
looser timing threshold. The compact window is the product target.

## Why the 15-second freeze happened

The fixtures reach EOF together at roughly 15 seconds. Reopening eight
AVAssetReaders plus active/prepared PGM readers on that same boundary created a
synchronized VideoToolbox storm and eventually `Cannot Decode`. A single
AVAssetReader cannot restart cleanly. Fully preparing the small preview
timelines before transport removes runtime preview readers and therefore removes
that loop-boundary storm.

Earlier reports under `.artifacts/desktop-eight-video/` remain useful evidence:

| Report | Finding |
| --- | --- |
| `report.concurrent-cadence.json` | Shared-turn decode delivered roughly 2.5 fps per source. |
| `report.fully-parallel-lanes.json` | Migrating AVFoundation work through Rayon triggered `Cannot Decode`. |
| `report.persistent-workers.json` | Thread affinity helped, but all sources still degraded at the synchronized loop. |
| `report.seamless-loop-workers.json` | Dual live readers created too many concurrent decoder sessions. |
| `report.loop-head-cache.json` | A partial three-second cache only delayed failure. |
| `report.predecoded-previews.json` | Full preview preparation crossed the loop and established the successful direction. |
| `report.texture-cache.json` | One-time preview texture import removed repeated IOSurface import work. |
| `report.store-bridge.json` | Store-direct effect metadata reached native output, while layout queueing still cost one frame. |
| `report.final-confirmed-3.json` | Latest-value PGM/layout mailboxes pass every declared evaluator gate on the final code. |
| `report.native-effects-final-confirmed.json` | Sparse audio anchors, batched native uniforms, one-frame effect replacement, and live parameter updates pass the expanded gate. |

## Architecture research

The independent Orbit Video Player, Lumina Video, and egui-video findings are in
`docs/desktop-video-player-research.md`. The retained design choices are:

1. macOS hardware decode with IOSurface-backed GPU ownership.
2. One authoritative audio timeline with sparse native transport anchors.
3. Small proxy/prepared previews and source-resolution current/next PGM lanes.
4. Stable slot media ownership; effects are GPU state, not decoder ownership.
5. Prewarm before musical boundaries and promote atomically on the boundary.

A 15-second, 24 fps, 256x144 BGRA preview is about 50.6 MiB before IOSurface
overhead. Eight prepared previews therefore fit this diagnostic/product phase,
but persisted compressed proxies plus a bounded decoded window remain the
scalable follow-up for longer clips and larger racks.

## Remaining work

1. Fix native surface geometry and clipping so every preview paints exactly
   edge-to-edge inside its 16:9 module viewport, PGM cannot overlap the rack,
   and the bottom row matches the same fixed module geometry. Extend the proof
   from nominal rectangles to actual painted coverage.
2. Isolate the current renderer/scheduler performance regression against
   `report.native-effects-final-confirmed.json`. The current failure has 10
   >50 ms stalls and 314 ms maximum cut latency; do not resume feature work
   until `bun run verify:desktop-eight-video` passes again.
3. Replace full-resolution TimeSampler AVAssetReader reopen-on-jump behavior
   with bounded prewarmed random access suitable for rapid beat cuts.
4. Complete canonical browser/native shader formula parity, including TapDelay
   feedback history. The native path now has live audio/timeline uniforms and
   parameter controls, but several formulas remain intentionally simplified.
5. Verify normal user-selected songs receive Essentia BPM/beat markers and that
   tempo controls update effective BPM while pitch/key-only controls do not.
6. Add a regression proving RAND/interval/feel cannot mutate SoundTouch tempo,
   pitch, key, or volume.
7. Persist preview proxy/cache identity so later launches can reuse preparation
   instead of decoding original media again.
8. Repeat the headed proof with ten populated preview slots when the fifth rack
   column/add-slot product flow is implemented.
9. Finish fixed compact-window layout polish and then perform a separate branch
   promotion review.

## Exact pickup order

1. Stay on `cursor/desktop-tauri-e0e8`; do not merge to `main`.
2. Launch the reproducible media-loaded app and leave it open:
   `DESKTOP_DEV_URL='http://127.0.0.1:5175/?qa=1&qaAutoplay=1' bun run dev:desktop`.
3. Reproduce the black strip, PGM overlap, and bottom-row mismatch at 1440x900.
4. Audit physical-vs-logical window coordinates, scroll offsets, surface
   clipping, and the actual render-target bounds before changing module CSS.
5. Use the historical passing artifact as the cadence baseline, make one
   reversible performance change at a time, and rerun the declared evaluator.
6. Record an OMX performance checkpoint after every headed evaluator run.

## Commands

```bash
# Web app
bun run dev

# Desktop app
bun run dev:desktop

# Focused native checks
cargo test --manifest-path crates/bsp-decode/Cargo.toml
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib
cd svelte && bun run check

# Headed desktop acceptance proof
bun run verify:desktop-eight-video
```

Do not claim smooth playback from compositor cadence alone. Acceptance must
also include fresh-frame cadence for every source; repainting stale textures can
look smooth in telemetry while the videos themselves are frozen.
