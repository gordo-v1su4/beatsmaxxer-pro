# Desktop video player research

Date: 2026-08-02
Target: Beat Surfer Pro desktop (`cursor/desktop-tauri-e0e8`)
Scope: Orbit Video Player, Lumina Video, and egui-video

## Decision

Lumina Video is the only project in this audit that demonstrates the macOS
decoder-to-wgpu bridge Beat Surfer needs: AVFoundation/VideoToolbox produces an
IOSurface-backed `CVPixelBuffer`, the owning pixel buffer stays retained, Metal
creates a texture over the IOSurface, and wgpu wraps the Metal texture through
its HAL without copying frame pixels through CPU memory.

Lumina should be treated as an implementation reference, not adopted wholesale.
It is young and explicitly experimental, does not provide Beat Surfer's shared
musical clock or beat-quantized source switching, and does not demonstrate an
eight-preview plus one-program workload. Its renderer also imports a new
IOSurface texture on the render thread for each frame and notes that this may
hitch under load.

Orbit is useful as a reference for WGSL effect chaining and intermediate render
textures, but its decoder path is CPU-copy based. egui-video is not suitable for
the native playback core: it performs software conversion to RGB, copies frames
into egui images, and uploads them as ordinary textures.

The recommended Beat Surfer architecture is therefore:

1. Keep Rust as the owner of transport scheduling, clip lanes, and the single
   authoritative audio clock.
2. Keep the current native AVFoundation/VideoToolbox direction for macOS.
3. Return retained, IOSurface-backed `CVPixelBuffer` objects from decode instead
   of copying BGRA rows into `Vec<u8>`.
4. Import the IOSurface into the native wgpu Metal backend and run the existing
   WGSL effects in one native compositor.
5. Keep Svelte/Tauri for controls and layout state only. Video frame bytes must
   not cross Tauri IPC or JavaScript.
6. Keep independent, low-resolution preview lanes and full-resolution program
   lanes. Prewarm the next program source before each quantized boundary.
7. Prove the raw compositor before reconnecting effects: eight previews plus one
   program output first, then ten plus one, then a twelve-preview stress run.

## Claim matrix

| Project | Rust UI/GPU stack | Decode path | GPU transfer | Multi-video evidence | Effects | Beat Surfer verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Orbit Video Player | iced + wgpu | FFmpeg software decode and software YUV conversion | CPU `Vec` copies followed by `queue.write_texture` | GPU manager has multiple IDs, shipped app owns one player | Real WGSL effect chain and side-by-side comparison | Effect-system reference only |
| Lumina Video | egui/eframe + wgpu | AVPlayer/VideoToolbox on macOS; platform-specific elsewhere | Real IOSurface-to-Metal-to-wgpu path on supported macOS frames, with CPU fallback | Isolated player state exists; no 8+1 benchmark or grid scheduler | Primarily playback SDK, not Beat Surfer-style shader rack | Best decoder/GPU interop reference |
| egui-video | egui + FFmpeg + SDL2 | FFmpeg decode and software RGB24 conversion | CPU `ColorImage` copy and normal egui texture upload | Independent players are structurally possible; scalability unproven | No public shader/effect pipeline | Do not use for playback core |

## Lumina Video

Audited commit:
[`cb0d54356e1c2a4c7e1f72e304879610ad670aa8`](https://github.com/lumina-video/lumina-video/tree/cb0d54356e1c2a4c7e1f72e304879610ad670aa8)

Snapshot: Apache-2.0, release `v0.2.2`, 27 stars, 1 fork. The project README
labels the SDK experimental and lists Windows as untested.

### Verified strengths

- The workspace uses Rust, eframe/egui/egui-wgpu, FFmpeg components, and native
  Apple framework bindings. Its platform dependencies are visible in
  [Cargo.toml](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/Cargo.toml#L17-L84).
- The macOS decoder uses `AVPlayer` with `AVPlayerItemVideoOutput` and requests
  IOSurface- and Metal-compatible Core Video buffers. It explicitly retains the
  owning `CVPixelBuffer` so the IOSurface stays alive:
  [macos_video.rs](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video-core/src/macos_video.rs#L24-L43) and
  [surface creation](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video-core/src/macos_video.rs#L1182-L1210).
- The actual zero-copy seam is implemented, not merely described. It calls
  Metal's `newTextureWithDescriptor:iosurface:plane:`, wraps that texture as a
  wgpu HAL Metal texture, and calls `create_texture_from_hal`:
  [zero_copy.rs](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video-core/src/zero_copy.rs#L308-L458).
- The player core owns per-player scheduling, frame queues, and decode state:
  [player.rs](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video-core/src/player.rs#L55-L80).
- Its A/V drift controller is a useful reference for bounded correction and
  hysteresis, although it is per-player rather than Beat Surfer's shared musical
  transport:
  [frame_queue.rs](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video-core/src/frame_queue.rs#L1681-L1795).

### Important limits

- Zero-copy is conditional. Unsupported formats or missing IOSurface backing
  enter a CPU fallback path:
  [macos_video.rs](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video-core/src/macos_video.rs#L24-L36).
- Lumina recreates/imports the wgpu texture for each macOS frame on the render
  thread. Its own comment says the sub-millisecond work can hitch under load and
  suggests pre-importing on a background thread:
  [video_texture.rs](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/crates/lumina-video/src/media/video_texture.rs#L1048-L1074).
- The platform matrix is not uniformly zero-copy. macOS MP4 is the strongest
  path; other formats and operating systems have fallbacks or incomplete
  integrations:
  [PLATFORMS.md](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/docs/PLATFORMS.md#L5-L45).
- No shared external transport, beat quantization, deterministic random switching,
  next-source prewarming, or eight-plus-one performance proof was found.
- The repository uses a patched Lumina wgpu branch for some platform interop,
  which increases update and integration risk:
  [Cargo.toml](https://github.com/lumina-video/lumina-video/blob/cb0d54356e1c2a4c7e1f72e304879610ad670aa8/Cargo.toml#L52-L61).

### What to reuse

Reuse or adapt the retained-pixel-buffer lifetime model and the macOS
IOSurface-to-wgpu HAL import. Do not replace Beat Surfer's clock, rack state,
program/preview ownership, or switching scheduler with Lumina's per-player
transport.

Because Lumina is Apache-2.0, copied code must retain the applicable license and
notices. Prefer adapting the design behind a Beat Surfer-owned platform boundary
over importing the full SDK.

## Orbit Video Player

Audited commit:
[`e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e`](https://github.com/vrrashkov/orbit-video-player/tree/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e)

Snapshot: MIT, 8 stars, no releases, latest commit 2025-03-08. The README calls
the application a hobby project.

### Verified strengths

- The advertised Rust, iced, wgpu, FFmpeg, WGSL effect stacking, and side-by-side
  comparison features are real:
  [README](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/README.md#L1-L16).
- Its effect interface and ordered effect manager are useful references for a
  modular native shader rack:
  [effects/mod.rs](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/lib/core/src/video/pipeline/effects/mod.rs#L20-L88).
- Intermediate effect targets remain GPU textures:
  [texture_manager.rs](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/lib/core/src/video/texture_manager.rs#L65-L89).
- The pipeline manager keys GPU resources by video ID, even though the shipped UI
  uses only one player:
  [pipeline manager](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/lib/core/src/video/pipeline/manager.rs#L23-L45).

### Disqualifying limits for playback

- Decode is a conventional FFmpeg software path followed by software conversion
  to YUV420P; no VideoToolbox or other hardware-device setup exists:
  [stream.rs](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/lib/core/src/video/stream.rs#L56-L123).
- Each decoded frame is copied into CPU vectors, then uploaded with
  `queue.write_texture`:
  [CPU frame construction](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/lib/core/src/video/stream.rs#L184-L224) and
  [GPU upload](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/lib/core/src/video/pipeline/video.rs#L306-L349).
- The application creates one player with a hard-coded source, so eight-plus-one
  concurrent playback is not demonstrated:
  [main.rs](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/src/main.rs#L20-L47).
- Audio is unsupported, only two effects are bundled, and the README warns that
  resolutions other than 640x360 can artifact:
  [README limitations](https://github.com/vrrashkov/orbit-video-player/blob/e99e86ff5ef93a0ff7fbaf92e7467a0e9d6ef50e/README.md#L67-L92).

### What to reuse

Use the effect trait, ordered shader-chain concepts, and intermediate texture
management as design references. Do not reuse its decoder/upload path.

## egui-video

Audited commit:
[`68933f42b45220af92221fb82315b03c87e7efce`](https://github.com/n00kii/egui-video/tree/68933f42b45220af92221fb82315b03c87e7efce)

Snapshot: MIT, 144 stars, 58 forks, no releases, latest commit 2024-10-27.

### Verified behavior

- The stack is egui, FFmpeg, and SDL2:
  [Cargo.toml](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/Cargo.toml#L1-L33).
- FFmpeg decodes through its regular video decoder and software scaler to RGB24:
  [lib.rs decoder](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/src/lib.rs#L1089-L1092) and
  [software scale](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/src/lib.rs#L1435-L1448).
- RGB scanlines are copied into a `ColorImage`, then uploaded through an egui
  `TextureHandle`:
  [CPU image copy](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/src/lib.rs#L1698-L1717) and
  [texture update](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/src/lib.rs#L399-L401).
- Independent `Player` instances are structurally possible, but no concurrency
  target or grid performance is documented:
  [Player state](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/src/lib.rs#L141-L185).
- Public display is an egui image over a texture handle. No extensible WGSL
  shader/effect pipeline was found:
  [render path](https://github.com/n00kii/egui-video/blob/68933f42b45220af92221fb82315b03c87e7efce/src/lib.rs#L499-L529).

### Verdict

egui-video is a straightforward embedded player, not a low-copy multi-video
compositor. Its path repeats the same CPU-copy/upload pattern that is currently
freezing Beat Surfer and should not be adopted.

## Implications for the current Beat Surfer branch

Beat Surfer already reaches AVFoundation/VideoToolbox, but then locks the
`CVPixelBuffer`, copies BGRA rows into a Rust vector, serializes those bytes into
Tauri IPC, parses them in JavaScript, and uploads them into WebGPU. The relevant
copy starts in
[`crates/bsp-decode/src/videotoolbox.rs`](../crates/bsp-decode/src/videotoolbox.rs),
and the raw IPC packet is built in
[`desktop/src-tauri/src/decode/mod.rs`](../desktop/src-tauri/src/decode/mod.rs).

The first native proof should replace only this boundary:

```text
Current:
VideoToolbox -> CVPixelBuffer -> Rust Vec -> Tauri IPC -> JavaScript -> WebGPU upload

Target:
VideoToolbox -> retained IOSurface-backed CVPixelBuffer -> Metal texture -> native wgpu
```

The proof is successful only when instrumentation shows no per-frame video-plane
IPC, no CPU BGRA extraction during normal playback, and stable presentation under
quantized source switching. A static screenshot or a single smoothly playing
source is not sufficient evidence.

## Research boundaries

- Repository claims were checked against the source at the pinned commits above.
- No project demonstrated Beat Surfer's exact eight-preview plus one-program,
  shared-clock, beat-quantized workload.
- No performance figure from these repositories should be treated as a Beat
  Surfer guarantee until the same local media is tested on the target Mac.
- This audit does not choose a long-term Windows/Linux decoder backend.
