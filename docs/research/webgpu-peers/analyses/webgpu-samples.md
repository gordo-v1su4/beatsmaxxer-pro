# webgpu-samples — peer analysis

- **URL:** https://github.com/webgpu/webgpu-samples
- **Cloned:** 2026-09-06 (shallow)
- **Stars / activity:** 2,164 · active
- **License:** BSD-3-Clause
- **Analyst:** Cursor research session

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | Vanilla TS per sample |
| Build | Custom sample runner |
| WebGPU | Canonical API usage from GPUWeb group |
| Video source | HTMLVideoElement, VideoFrame, webcam |
| Audio / rhythm | None (except unrelated samples) |
| Other GPU | Full spec coverage samples |

## Render path (videoUploading sample)

```text
HTMLVideoElement | VideoFrame
  → importExternalTexture in createBindGroup (every frame)
  → textureSampleBaseClampToEdge in WGSL
  → fullscreen quad → canvas swapchain
```

Also compares `requestVideoFrameCallback` vs `requestAnimationFrame` for video-driven loops.

## Video texture approach

- [x] `importExternalTexture` per frame — bind group rebuilt each frame
- [x] `texture_external` + `textureSampleBaseClampToEdge` (spec-compliant)
- [x] Cover/mirror/360 panorama matrix uniforms
- [ ] copy fallback (other samples use copyExternalImageToTexture for static images)

## Audio / rhythm analysis

- N/A

## Shader packaging

- One sample = one WGSL file — not a product registry
- `sample/computeBoids` — buffer ping-pong for compute
- `sample/timestampQuery` — GPU pass timing with query pool + MAP_READ buffer pool
- `sample/renderBundles` — cached pass descriptors

## Performance / latency notes

- **timestampQuery**: feature-gated `timestamp-query`; spare buffer pool avoids queue stall
- **computeBoids**: demonstrates compute pass ping-pong without CPU sync
- Spec notes: external texture valid for current JS task; prefer rVFC when video FPS ≠ display FPS
- **animometer**: dynamic uniform offsets — one buffer, multiple draws

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | N/A |
| PGM beat director | N/A |
| `importExternalTexture` + idle copy | **Validates our live path** |
| Feedback ping-pong | computeBoids pattern (buffers not textures) |
| Essentia / Web Audio | N/A |
| SvelteKit | N/A |

## Ideas worth stealing

1. **rVFC vs rAF** — for slots not locked to audio fixed-step, schedule GPU work on decoded frame cadence.
2. **TimestampQueryManager** — behind `__BMX_QA__` flag for per-pass FX timing in `test:local`.
3. **Render bundles for blit pass** — when canvas size + feedback view stable, cache pass descriptor.
4. **Dynamic uniform offsets** — if uniform churn becomes bottleneck across 8+ canvases.
5. **Panorama / cover matrix** — reference UV math for PGM fit modes.

## Skip / not applicable

- Sample runner infrastructure
- Non-video samples (except patterns noted above)

## Key files to grep

| Path | Why |
|------|-----|
| `sample/videoUploading/main.ts` | Canonical external texture loop |
| `sample/videoUploading/sampleExternalTexture.frag.wgsl` | Minimal WGSL |
| `sample/timestampQuery/TimestampQueryManager.ts` | GPU profiling |
| `sample/computeBoids/main.ts` | Compute ping-pong |

## References

- https://webgpu.github.io/webgpu-samples/
- WebGPU spec § external texture expiry semantics
