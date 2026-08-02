# Desktop Native Video Status

Date: 2026-08-02
Branch: `cursor/desktop-tauri-e0e8`
Status: **prepared native previews are smooth; quantized cuts and native effects remain**

This is the current pickup document for the Tauri desktop work. The desktop
branch remains separate from `main` and must not be merged until the native
acceptance gates below pass.

## Product contract

- The loaded song owns the authoritative transport clock.
- Tempo changes transport rate and effective BPM. Pitch/key may change audio
  without changing beat time. RAND, straight, swing, and dotted controls must
  never mutate tempo, pitch, key, or volume.
- Each rack slot owns its loaded video independently of the effect module.
  Replacing an effect must not reopen or replace that slot's media.
- Preview media is predecoded at no more than 256x144 before transport starts.
- Interactive PGM is bounded to 960x540, matching the compact viewer. Original
  media remains attached for later high-quality output/export.
- Ten previews plus PGM must remain smooth through clip loops and 1BT cuts.
- Normal desktop playback must have zero decoded video-plane bytes in Tauri IPC
  and no CPU pixel fallback.
- The compact desktop window and fixed rack geometry remain the target. Do not
  maximize modules to fill arbitrary width; show fixed add-slot placeholders.

## What is implemented

- Tauri 2 desktop shell on Vite port 5175; browser development remains on 5174.
- macOS AVFoundation/VideoToolbox decode returning retained,
  IOSurface-backed `CVPixelBuffer` frames.
- Direct IOSurface -> Metal -> wgpu HAL import in the native compositor.
- Preview clips are decoded once at 256x144 during import into immutable,
  IOSurface-backed frame caches. Their VideoToolbox sessions are released before
  playback.
- PGM uses independent current/next 960x540 interactive decoder lanes.
- The compositor uses aspect-preserving centered cover UVs, so non-16:9 DOM
  rectangles crop rather than stretch or add side letterboxing.
- Native compositor surfaces are controlled by layout-only IPC; video frames do
  not pass through JavaScript.
- Persistent, thread-affine decoder workers with one-frame latest mailboxes.
  AVAssetReader objects are created and consumed on the same permanent thread.
- Current and predicted-next PGM lane plumbing, direct ready-frame submission,
  audio-timeline publication, and native performance telemetry.
- A headed 8-preview + PGM + 30-second RAND proof with per-source freshness,
  compositor cadence, cut latency, black-frame, memory, CPU-byte, IPC-byte, and
  IOSurface-import gates.
- The desktop proof now requests hosted Essentia analysis. The previous proof
  explicitly passed `hostedAnalysis: false`, which incorrectly left the UI at
  the default 128 BPM even though the desktop Essentia environment was loaded.

## Confirmed good results

- Native backend label: `videotoolbox-iosurface-wgpu-metal`.
- Decoded CPU video bytes: `0`.
- Frame IPC video bytes: `0`.
- IOSurface import failures: `0` in the zero-copy and persistent-worker runs.
- Native compositor can present close to display cadence without black PGM
  frames when it has fresh source frames.
- Rust/AVFoundation objects no longer migrate between Rayon threads. Rayon was
  removed from the decode scheduler.
- Isolated `decode_probe` after the loop experiment showed one preview, eight
  previews, and eight previews plus one 1280x720 PGM each delivering 23.95 fps
  across a 20-second run when using one repeated test asset. This proves the
  machine and base VideoToolbox path can sustain the target cadence.
- `report.predecoded-previews.json` is the first real distinct-media proof to
  cross the synchronized loop without `Cannot Decode`: all eight previews
  delivered 23.92 fps or better, PGM delivered 22.72 fps, drop rate was 0.11%,
  CPU/IPC frame bytes and IOSurface import failures stayed zero, and process
  memory high-water was 433,766,400 bytes (about 414 MiB).

## Measured failures and rejected experiments

Artifacts are intentionally local under `.artifacts/desktop-eight-video/`.

| Report | Result | Decision |
| --- | --- | --- |
| `report.concurrent-cadence.json` | Native zero-copy was correct, but serial/shared-turn decode delivered roughly 2.5 fresh fps per source. | Reject shared barriers. |
| `report.fully-parallel-lanes.json` | Rayon/shared-turn parallelism fell to roughly 1.3 fps and AVFoundation reported `Cannot Decode`. | Reject decoder migration and Rayon pool ownership. |
| `report.persistent-workers.json` | Thread affinity removed `Cannot Decode` and improved sources to roughly 5 fps, but the rack degraded after the synchronized clip-loop boundary. | Keep thread affinity; fix looping. |
| `report.seamless-loop-workers.json` | Two live readers per lane passed an isolated repeated-file probe, but the real 8-distinct-clip rack plus active/prepared PGM created roughly 20 readers, triggered `Cannot Decode`, and collapsed below 2 fps. | Reject dual live readers per slot. The checkpoint source does not retain this experiment. |
| `report.loop-head-cache.json` | A three-second preview cache delayed the failure but previews still averaged roughly 4 fps once the bridge expired. | Reject partial loop-head retention for these fixed 15-second clips. |
| `report.predecoded-previews.json` | Eight fully prepared previews plus 960x540 PGM stayed fresh through the loop with no decoder error. One >50 ms compositor stall, 33.6 ms p95 cut latency, and missing native effect swap still failed the complete gate. | Keep prepared previews; next fix current/next PGM cut ownership and native effects. |

The user-observed signature is consistent and important: playback starts well,
then all clips degrade/freeze together at approximately 15 seconds, when the
fixture clips reach EOF together. A single AVAssetReader cannot restart, so all
preview workers currently reopen their readers at the same transport boundary.
That synchronized reopen storm is the immediate playback defect.

## Independent architecture opinion

An independent review of the code, local architecture docs, Lumina findings,
and the new measurements recommends:

1. Persist a native low-resolution proxy asset for every preview, keyed by
   source hash/mtime and proxy version.
2. Use one persistent thread-affine reader per active preview, never duplicate
   readers at a musical boundary.
3. Retain only a bounded IOSurface queue for jitter/loop coverage.
4. Keep only current and predicted-next PGM lanes at source resolution.
5. Keep the song/audio timeline authoritative; native video receives sparse
   anchors and advances locally.
6. Apply effect changes in the GPU pipeline without reopening media.

The reviewer rejected full decoded-clip retention as the primary product path,
AVPlayerLooper as a replacement scheduler, AVSampleBufferDisplayLayer as the
effects compositor, and a GOP cache as the sole source. The full audit and
SHA-pinned evidence are in `docs/desktop-video-player-research.md`.

One calculation is worth keeping precise: a 15-second, 24 fps, 256x144 BGRA
preview is about 50.6 MiB before IOSurface overhead, so ten fully retained clips
would be about 506 MiB, not multiple GiB. That is viable as a diagnostic spike
but is still larger and less scalable than persisted compressed proxies plus a
bounded decoded queue.

## Next implementation plan

### Gate 1: prepared preview cache

- Implemented: decode each fixed 15-second preview once during clip import,
  retain the 256x144 IOSurface timeline, and release its decoder before Play.
- Current measured budget is about 414 MiB process high-water for eight prepared
  previews plus current/next PGM activity.
- Next optimization: persist a small native proxy/cache identity so a subsequent
  app launch can reuse preparation instead of decoding the originals again.

### Gate 2: current/next interactive PGM

- Keep no more than current and predicted-next 960x540 PGM lanes alive.
- Complete each random choice before the musical boundary and atomically promote
  the already-presented next surface on the boundary.
- Eliminate the remaining 33.6 ms p95 / 39.2 ms maximum cut latency and the
  single measured compositor stall.

### Gate 3: audio and source scheduling correctness

- Verify normal desktop song load calls Essentia and updates detected BPM/beat
  markers instead of staying at 128.
- Display effective BPM consistently when tempo changes.
- Add a regression test proving RAND/interval/feel controls do not mutate
  SoundTouch tempo, pitch, key, or volume state.
- Move predicted PGM source scheduling early enough that the full-resolution
  next lane is ready before the quantized boundary.

### Gate 4: final playback/effects acceptance

- Manual and RAND 1BT cuts: no black frames, p95 at or below one display refresh.
- Ten previews plus PGM for at least 30 seconds and two loop boundaries:
  per-source freshness >=20 fps, drop rate <=1%, no >50 ms stall, stable memory,
  zero CPU/IPC frame bytes, and no VideoToolbox errors.
- Port the effect pipeline into the native WGSL compositor.
- Swap an effect within one presented frame while the slot's video ownership and
  decoder-open count remain unchanged.
- Only after these gates: fixed rack geometry/layout polish and promotion review.

## Commands

```bash
# Web app
bun run dev

# Desktop app
bun run dev:desktop

# Rust checks
cargo test --manifest-path crates/bsp-decode/Cargo.toml
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib

# Svelte checks
cd svelte && bun run check

# Headed desktop acceptance proof
bun run verify:desktop-eight-video
```

Do not claim completion from compositor presentation cadence alone. The gate
must include fresh-frame cadence for every source, because a compositor can
repaint stale textures smoothly while the videos themselves are frozen.
