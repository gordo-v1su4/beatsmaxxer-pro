# webgpu-video-rendering — peer analysis

- **URL:** https://github.com/apssouza22/webgpu-video-rendering
- **Cloned:** 2026-09-06 (shallow)
- **Stars / activity:** 0 · last push 2026-06-01
- **License:** (no LICENSE file; treat as reference-only)
- **Analyst:** Cursor research session

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | Vanilla TS + Vite |
| Build | Vite |
| WebGPU | Raw WebGPU (no helper framework) |
| Video source | WebCodecs `VideoFrame` from `HTMLVideoElement` |
| Audio / rhythm | None |
| Other GPU | Compute scopes + optical flow |

## Render path

```text
VideoFrame (WebCodecs)
  → importExternalTexture → ExternalCopyPipeline (external → rgba8unorm texture_2d)
  → TransformPipeline (3D layer params)
  → EffectsPipeline (ping-pong WGSL chain)
  → OutputPipeline → canvas
  → optional ScopeRenderer (compute histogram/waveform/vectorscope)
  → optional OpticalFlowAnalyzer (Lucas-Kanade compute)
```

Critical design choice: **always normalize external texture to owned `texture_2d`** before effect chain — downstream passes never bind `texture_external`.

## Video texture approach

- [x] `importExternalTexture` — entry in `VideoFrameRenderer.renderFrame()`
- [x] Immediate copy to internal texture via `ExternalCopyPipeline` / `copy-external.wgsl`
- [x] Ping-pong `PingPongTexturePair` for effects
- [ ] HTMLVideo direct path (uses VideoFrame wrapper)
- [x] `gpuFrameBusy` guard — drop frames if GPU still processing (backpressure)

## Audio / rhythm analysis

- None — video FX lab only

## Shader packaging

- `src/effects/registry.ts` — `GpuEffectDefinition` array: id, shader file, entryPoint, uniformSize, packUniforms
- `_shared-common.wgsl` imported via Vite `?raw`
- `fullShaderCode()` concatenates common + effect fragment
- Small focused catalog: hue, brightness, contrast, kaleidoscope, rgb-split, blur, etc.

## Performance / latency notes

- README: 4K@60 plausible with careful pipelining; demo prioritizes clarity over production scheduling
- Compute scopes aggregate on GPU — CPU sees stats only, not full readback
- Optical flow: multi-pass compute (pyramid, gradients, LK) — heavy but isolated
- `PerformanceHud` for frame timing

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | Single video demo |
| PGM beat director | No |
| `importExternalTexture` + idle copy | **Yes** — explicit two-stage external→owned |
| Feedback ping-pong | Ping-pong for effects (not temporal feedback modules) |
| Essentia / Web Audio | No |
| SvelteKit | No |

## Ideas worth stealing

1. **ExternalCopyPipeline** — small WGSL pass to normalize `texture_external` → `rgba8unorm` before multi-pass FX (use when a module needs more than one sampling pass).
2. **Effect registry with `packUniforms`** — clean pattern for adding catalog modules with typed params.
3. **GPU scopes via compute** — histogram/waveform for QA/debug panels without CPU readback.
4. **Frame drop guard (`gpuFrameBusy`)** — optional backpressure when 8 slots saturate the queue.
5. **Pipeline class hierarchy** — `AbstractPipeline` with `gpuRender({ encoder, inputView, outputView })` — readable pass orchestration.

## Skip / not applicable

- Optical flow (out of scope unless new module)
- WebM export path (different product goal)
- Single-video demo UI

## Key files to grep

| Path | Why |
|------|-----|
| `src/VideoFrameRenderer.ts` | Full frame orchestration |
| `src/ExternalCopyPipeline.ts` | External → owned copy |
| `src/effects/registry.ts` | Effect registry pattern |
| `src/shaders/copy-external.wgsl` | texture_external sampling |

## References

- README: WebCodecs → WebGPU bridge, GPU scopes, optical flow
- ARTICLE.md / blog link on WebGPU video filters 2026
