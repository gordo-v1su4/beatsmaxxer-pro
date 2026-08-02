# Desktop Native Video Status

Date: 2026-08-02

Branch: `cursor/desktop-tauri-e0e8`

Status: **native eight-video playback, one-refresh cuts, and one-frame effect swaps pass**

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
- Effect identity is sourced directly from rack/PGM stores and selected by the
  native WGSL compositor. Swapping a module keeps the stable slot, cached video,
  and decoder ownership unchanged.
- Native effects currently provide distinct GPU treatments for all 18 registered
  effect modes. Full parameter/audio-uniform parity with the browser shader is
  follow-up work; it is not falsely claimed here.
- Centered `cover` UVs preserve source aspect without stretching or side bars.
- Desktop proof song loading requests hosted Essentia analysis instead of
  silently pinning the UI to the default 128 BPM.

## Passing headed acceptance report

Artifact: `.artifacts/desktop-eight-video/report.final-confirmed-3.json` (local, not committed).

`bun run verify:desktop-eight-video` passed on the real macOS Tauri/Metal shell:

| Measurement | Result |
| --- | ---: |
| Native backend | `videotoolbox-iosurface-wgpu-metal` |
| Eight-preview + PGM duration | 30.0 s |
| Presented / expected | 1800 / 1801 |
| Estimated presentation drop rate | 0.0555% |
| Presentation p95 / p99 / max | 17.05 / 17.37 / 20.27 ms |
| Frames over 34 ms / stalls over 50 ms | 0 / 0 |
| Completed RAND cuts | 62 |
| RAND cut p95 / max | 13.22 / 15.98 ms |
| Black PGM frames | 0 |
| Preview freshness | 23.92-26.18 fps per source |
| PGM freshness | 22.62 fps |
| Preview dimensions | 256x144 |
| PGM dimensions | 1280x720 |
| Decoded CPU bytes / frame IPC bytes | 0 / 0 |
| IOSurface import failures | 0 |
| Process memory high-water | 440,221,696 bytes (~420 MiB) |
| Effect replacement | Transition -> Leak in 1 presented frame |
| Media ownership during replacement | `clip1.mp4` remained in `top-0` |
| Decoder opens during replacement | unchanged (all 0) |

The evaluator also passed 25 proof-contract tests, four `bsp-decode` tests,
three Tauri library tests, `cargo check`, and `svelte-check` with zero Svelte
errors or warnings.

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

1. Port the browser shader's live audio/timeline uniforms and complete parameter
   parity for the 18 native WGSL modes; the current native modes prove the
   zero-reopen, one-frame swap architecture.
2. Verify normal user-selected songs receive Essentia BPM/beat markers and that
   tempo controls update effective BPM while pitch/key-only controls do not.
3. Add a regression proving RAND/interval/feel cannot mutate SoundTouch tempo,
   pitch, key, or volume.
4. Persist preview proxy/cache identity so later launches can reuse preparation
   instead of decoding original media again.
5. Repeat the headed proof with ten populated preview slots when the fifth rack
   column/add-slot product flow is implemented.
6. Finish fixed compact-window layout polish and then perform a separate branch
   promotion review.

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
