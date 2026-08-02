# Desktop native video architecture

Date: 2026-08-02
Branch: `cursor/desktop-tauri-e0e8`
Status: implementation in progress; not yet release-qualified

## Goal

The macOS desktop app must render eight simultaneous rack previews and one
full-resolution program output without visible freezing, then scale to the
five-by-two rack limit of ten previews plus program. Manual and random cuts must
land on musical boundaries without a black frame, and changing an effect must
not reopen or move the video owned by that rack slot.

This is a native-compositor project, not a Tauri port of the browser frame path.
The performance contract is:

```text
VideoToolbox decode
  -> retained IOSurface-backed CVPixelBuffer
  -> Metal texture import
  -> native wgpu compositor and WGSL effects
  -> one AppKit presentation surface
```

Decoded video planes must not pass through `Vec<u8>`, Tauri IPC, JavaScript, or
WebKit texture upload during normal desktop playback. Svelte remains responsible
for controls, layout, effect parameters, and sparse transport anchors.

The supporting implementation audit is in
[`desktop-video-player-research.md`](./desktop-video-player-research.md).

## Architectural decisions

### One compositor, multiple stable lanes

The desktop window owns one native wgpu compositor. Each occupied rack slot owns
an independent, low-resolution preview lane. Program owns current and prewarmed
next full-resolution lanes. All visible rectangles render in one command encoder
and present cycle.

Rack slot identity owns media. The effect loaded into the slot owns only its
pipeline and parameters. Swapping an effect therefore replaces GPU state while
preserving source identity, decoder identity, playback position, and retained
frame generation.

### One musical clock

The existing audio timeline remains authoritative. Rust receives timestamped
transport anchors for play, pause, seek, tempo, beat-phase, and analysis changes,
then advances locally from a monotonic host clock. Video timing never depends on
one IPC call per frame.

Manual selections are queued and visually armed for the next valid boundary.
Random mode chooses and prewarms its next source one quantization interval early,
using a seeded PRNG so a run can be reproduced during QA. A late source is held
for a later boundary instead of presenting black.

### Preview proxies are bounded, not whole-clip frame caches

Rack previews use persistent proxies no larger than 256x144. The original source
remains the program and export source. Proxies are generated lazily and cached by
source identity, modification time, dimensions, and proxy-version key.

The decoder retains only a bounded reorder/ready queue. A 15-second clip is not
expanded into a full uncompressed frame cache; that would trade stutter for
unbounded memory pressure.

### Browser and desktop remain separate platform implementations

The web app keeps its browser media implementation. The desktop app uses the
native compositor behind the shared `VideoSourcePort` and rack contracts. They
belong in this monorepo because controls, layout, rack state, shader semantics,
and musical scheduling are shared; only the platform media/render boundary
differs.

## Milestones and hard gates

1. **Release contract and baseline — complete.** The headed report defines
   zero-copy, drops, stalls, cut latency, black frames, dimensions, and memory.
2. **Retained native frame handles — complete.** VideoToolbox returns retained
   IOSurface-backed frames; CPU extraction is an explicit diagnostic feature.
3. **Isolated IOSurface import — complete.** The supplied 1280x720 MP4 decoded
   through VideoToolbox and rendered through Metal/wgpu with zero decoded CPU
   bytes and zero frame IPC bytes.
4. **Tauri native compositor view — in progress.** Prove nine correctly aligned
   surfaces, resize/Retina behavior, transparent layering, and click-through UI.
5. **Sparse layout/control bridge.** Send rectangles and state changes only;
   never frame pixels.
6. **Native monotonic transport.** Measure video/audio phase drift without
   per-frame timing IPC.
7. **Stable preview and current/next program lanes.** Prewarm manual and RAND
   cuts and atomically commit at the beat boundary.
8. **Persistent 256x144 preview proxies.** Keep program on original source
   dimensions.
9. **Native WGSL effect pipelines.** Cache pipelines and prove an effect swap
   preserves the slot's decoder and media.
10. **Remove the normal BSPF/JavaScript frame route.** Keep any CPU bridge
    diagnostic-only and visibly reported.
11. **Run headed release gates on the target Mac.** Eight previews + PGM and ten
    previews + PGM each run for 30 seconds after warmup; 1BT RAND and manual cuts
    run at 128 BPM.
12. **Promote only after evidence.** Keep the desktop branch separate from
    `main` until the machine-readable report passes and visual QA confirms layout,
    controls, static stopped cards, animated playing previews, and clean cuts.

## Release thresholds

- Decoded CPU video-plane bytes: exactly `0`.
- Per-frame video IPC bytes: exactly `0`.
- Preview dimensions: at most `256x144`; current proof PGM: `1280x720`.
- Eight-preview + PGM dropped presentations: at most `1%` over 30 seconds.
- Longest presentation stall: at most `50 ms`.
- 1BT cut test: no black frame; at least `95%` within one display refresh and
  every cut within two refreshes of its scheduled boundary.
- Ten-preview + PGM expansion test: no black frame and no stall above `50 ms`.
- Resident memory reaches steady state after warmup.

Passing a single-source demo, a static screenshot, or an offscreen import probe
does not qualify the architecture. The headed multi-video and beat-cut report is
the release authority.

## Evidence log

### 2026-08-02: native surface and Tauri layering proof

- The native compositor presented one PGM test texture and eight preview test
  textures at the Svelte-reported canvas rectangles in the centered 1440x900
  desktop window.
- The first run correctly revealed that `CompositeAlphaMode::Auto` left wgpu's
  Metal layer opaque. The webview was black outside the rendered rectangles, so
  that run was rejected.
- Selecting Metal's advertised `PostMultiplied` alpha mode preserved transparent
  compositor pixels. The webview controls, module bodies, and black workspace
  remained visible while the nine native rectangles appeared only over video
  canvases.
- This is evidence for placement and transparent layering only. Input
  click-through, Retina/resize variants, live retained-IOSurface presentation,
  and the multi-video timing report remain open; milestone 4 is therefore still
  in progress.

## Deferred UI work

Colored test bars, hover animations, additional sequencer behavior, and adding
the fifth module in each row remain visible product work, but they do not block
the native frame-path proof. The compositor must preserve the fixed module
geometry, black inter-module gaps, aligned control bottoms, and empty fifth-slot
drop targets while those features are developed.
