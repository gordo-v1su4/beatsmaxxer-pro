# FreeCut — peer analysis

- **URL:** https://github.com/walterlow/freecut
- **Cloned:** 2026-09-06 (shallow)
- **Stars / activity:** 2,149 · last push 2026-08-31
- **License:** MIT
- **Analyst:** Cursor research session

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | React 19 + Vite |
| Build | Code-split chunks: `gpu-effects`, `gpu-compositor`, `composition-runtime` |
| WebGPU | WebGPU-first compositor + effects (no Three.js on core path) |
| Video source | HTMLVideoElement, WebCodecs, Mediabunny I/O |
| Audio / rhythm | Timeline audio mixing (NLE, not beat-synced PGM) |
| Other GPU | Mediabunny for decode/encode |

## Render path

```text
Timeline frame (custom Clock)
  → per-layer: importExternalTexture OR copyExternalImageToTexture
  → GPU_EFFECT_REGISTRY chain (ping-pong)
  → gpu-compositor (25 blend modes, texture_external layers)
  → gpu-scopes (optional)
  → preview canvas / export worker
```

Dual texture path is explicit in `effects-pipeline.ts`:

- **Live preview:** `importExternalTexture({ source: video })` → `texture_external` import pass
- **Fallback / compositor stages needing texture_2d:** `copyExternalImageToTexture`

## Video texture approach

- [x] `importExternalTexture` per frame — `applyEffectsToVideo()`, compositor external pipeline
- [x] `copyExternalImageToTexture` fallback when external import unsupported or for multi-pass / scrub cache
- [x] `destRect` uniform for positioned video UV crop in import pass (`effects-pipeline.ts:56-65`, `919-925`)
- [x] Ping-pong between owned textures for effect chains
- [x] Premultiplied alpha blit pass (straight alpha effects → premultiplied canvas; `effects-pipeline.ts:33-35`)
- [x] Bind group strategy: per-frame external import bind group; cached effect-chain bind groups keyed by effect + ping/pong (`effects-pipeline.ts:122-123`, `516-570`)

## Audio / rhythm analysis

- NLE timeline audio — not beat-quantized live performance
- Custom `Clock` for frame-accurate composition time
- No Essentia integration in core path

## Shader packaging

- `src/infrastructure/gpu-effects/registry.ts` — `GPU_EFFECT_REGISTRY`, typed effect definitions
- `COMMON_WGSL` + per-effect shader strings
- `EffectsPipeline` class — pipeline cache per effect, data texture cache for LUTs
- Vite manual chunks isolate GPU packages for load performance

## Performance / latency notes

- Documented: frame-accurate playback via custom Clock; `npm run perf` workflow
- GPU backpressure on effects pipeline
- Worker-backed export
- Industry-adjacent claim: ~2 ms/frame @ 1080p headroom for effect chains (third-party writeups)
- Scrubbing cache with GPU texture retention (`src/features/preview/utils/scrubbing-cache.ts` — Tier 1 VRAM via `copyExternalImageToTexture`, not import)

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | Multi-track timeline (different abstraction) |
| PGM beat director | No — timeline playhead |
| `importExternalTexture` + idle copy | **Yes** — best-in-class dual path |
| Feedback ping-pong | Yes — effect chain ping-pong |
| Essentia / Web Audio | Web Audio mixing only |
| SvelteKit | No |

## Ideas worth stealing

1. **Import pass with `destRect`** — fit/crop video into slot UV space on GPU (useful for mixed aspect ratios across 8 slots).
2. **Effect registry typing** — `GpuEffectDefinition` with `packUniforms()` per effect mirrors our module param packs.
3. **Explicit external → texture_2d promotion** — when a module needs multi-pass beyond external binding limits, copy once then chain on `texture_2d`.
4. **Premultiplied alpha blit** — avoid fringe artifacts when stacking semi-transparent FX over rack preview.
5. **Vite chunk split for GPU code** — if bundle size grows, isolate `gpu-effects` like FreeCut.

## Skip / not applicable

- Full timeline / keyframe / composition-runtime (out of scope for live rack)
- React state management patterns
- Export worker architecture (unless we add offline render)

## Key files to grep

| Path | Why |
|------|-----|
| `src/infrastructure/gpu-effects/effects-pipeline.ts` | importExternalTexture + ping-pong |
| `src/infrastructure/gpu-effects/registry.ts` | Effect registry |
| `src/infrastructure/gpu-compositor/compositor-pipeline.ts` | External layer composite |
| `src/features/preview/utils/scrubbing-cache.ts` | Tier-1 GPU scrub cache (copy path) |
| `src/infrastructure/browser/mediabunny-input-source.ts` | Mediabunny decode I/O adapter |
| `src/infrastructure/gpu-effects/common.ts` | `COMMON_WGSL` shared snippets |

## File:line citations (deepened 2026-09-07)

### Dual texture path — import then promote to `texture_2d`

| Lines | Pattern |
|-------|---------|
| `effects-pipeline.ts:52-66` | `IMPORT_EXTERNAL_SHADER` — `texture_external` + `destRect` uniform crops video into slot UV space |
| `effects-pipeline.ts:226-254` | `createImportExternalPipeline()` — separate bind group layout with `externalTexture` binding; try/catch when unsupported |
| `effects-pipeline.ts:870-917` | `applyEffectsToVideo()` — `importExternalTexture({ source: video })`; returns `null` on failure so caller falls back |
| `effects-pipeline.ts:919-953` | UV rect math + per-frame import bind group (external texture is ephemeral — new bind group each frame at `931-938`) |
| `effects-pipeline.ts:955-963` | After import pass, `runEffectChain()` ping-pongs on owned `texture_2d` textures |
| `effects-pipeline.ts:710-786` | `copyExternalImageToTexture` path for canvas/image/video when import unavailable or scrub cache |
| `effects-pipeline.ts:33-35` | Premultiplied alpha blit shader — straight-alpha FX → premultiplied canvas |
| `effects-pipeline.ts:128-130` | Cached blit bind groups for ping/pong final output |
| `compositor-pipeline.ts:335-366` | Compositor `externalPipeline` — blends `texture_2d` underlay + `texture_external` layer; null when import unsupported |
| `compositor-pipeline.ts:484-486` | Runtime selection of external compositor path when `layer.externalTexture` present |

### Bind group frequency split (Tier 1.2 donor)

| Lines | Pattern |
|-------|---------|
| `effects-pipeline.ts:97-98` | `pipelines` + `bindGroupLayouts` maps — **static** per effect id |
| `effects-pipeline.ts:122-123` | `effectBindGroupCache` keyed `"effectId:ping\|pong"` — **cached** across frames |
| `effects-pipeline.ts:516-570` | Cache hit avoids `createBindGroup`; miss builds from ping/pong views + uniform buffer |
| `effects-pipeline.ts:376,460,473` | Cache cleared when ping/pong textures resize — not every frame |
| `effects-pipeline.ts:931-937` | Import pass bind group is **per-frame** (external texture cannot be cached) |

**Takeaway for V1S-60:** FreeCut separates ephemeral external bind groups (import pass only) from stable effect-chain bind groups (cached per effect + ping/pong). Beatsmaxxer currently recreates bind groups per preview in `WebGpuEngine.ts` — split along the same boundary.

### Effect registry

| Lines | Pattern |
|-------|---------|
| `types.ts:61-65` | `GpuEffectDefinition` requires `shader`, `entryPoint`, `packUniforms` |
| `registry.ts:10-47` | `GPU_EFFECT_REGISTRY` Map; `registerEffects()` from category modules |
| `registry.ts:20-30` | `isEffectDefinition()` guard — validates shader/entryPoint/packUniforms before registration |
| `effects-pipeline.ts:263,313` | `COMMON_WGSL` prepended to per-effect shader at pipeline creation |
| `effects-pipeline.ts:198-204` | `createPipelines()` iterates registry — one pipeline per effect at init |

### Mediabunny / scrub cache

| Lines | Pattern |
|-------|---------|
| `scrubbing-cache.ts:4-9` | Three-tier cache design: Tier 1 VRAM (GPU texture), Tier 3 RAM (ImageBitmap promotion) |
| `scrubbing-cache.ts:112` | Tier-1 GPU cache via `copyExternalImageToTexture` (not import) |
| `scrubbing-cache.ts:575-579` | Lookup order: Tier 1 GPU blit (~0.1 ms) → Tier 3 RAM → miss |
| `scrubbing-cache.ts:591-602` | Comment: Tier 1 always populated via copy — import is live-preview only |
| `mediabunny-input-source.ts:8-15` | Mediabunny `Input` adapter — WebCodecs decode for ProRes and non-native codecs |
| `prores-preview-session.ts:5-18` | ProRes preview uses mediabunny `VideoSampleSink` (decode separate from GPU import path) |

**Takeaway:** Mediabunny handles decode/I/O; GPU import is reserved for live `HTMLVideoElement` preview. Scrub cache mirrors Beatsmaxxer `VideoTextureCache` — always `copyExternalImageToTexture`, never `importExternalTexture`.

## Beatsmaxxer mapping (`svelte/src/lib/rendering/webgpu/WebGpuEngine.ts`)

| FreeCut | Beatsmaxxer today | Gap / action |
|---------|-------------------|--------------|
| Import pass → ping, then FX on `texture_2d` (`effects-pipeline.ts:930-963`) | `importAndBindExternalVideo()` binds external directly in FX pass (`WebGpuEngine.ts:872-880`, impl `1043-1067`) | Consider explicit import-to-owned-texture pass for multi-pass modules |
| `destRect` UV crop (`effects-pipeline.ts:56-65`, `919-925`) | Full-quad video sample in `moduleFx.wgsl` — no per-slot crop uniform (`WebGpuEngine.ts:314-331` bind layouts) | Useful when 8 slots mix 16:9 / 4:3 sources |
| `applyEffectsToVideo` returns null → copy fallback (`effects-pipeline.ts:916`) | try/catch → `createIdleBindGroup` + cached texture (`WebGpuEngine.ts:884-897`, `1077-1094`) | **Already aligned** — `VideoTextureCache.upload()` covers seek/cut seams (`WebGpuEngine.ts:818`, `VideoTextureCache.ts:38`) |
| `effectBindGroupCache` (`effects-pipeline.ts:122-570`) | Per-frame `createBindGroup` in render loop (`WebGpuEngine.ts:1057-1066` FX, `982-988` blit) | **V1S-60** — cache static layouts; only external import stays volatile |
| `GPU_EFFECT_REGISTRY` + `packUniforms` + `COMMON_WGSL` (`registry.ts:10-47`, `types.ts:61-65`) | Per-module WGSL map in `shaders/registry.ts:3-27`; single `moduleFx.wgsl` uber-shader | **V1S-61** — extract shared snippets like FreeCut `COMMON_WGSL` (`effects-pipeline.ts:263`) |
| Tier-1 scrub cache via copy (`scrubbing-cache.ts:112,591`) | `VideoTextureCache` persistent copy (`VideoTextureCache.ts:1,38`; gated by `shouldUsePersistentVideoTexture` `WebGpuEngine.ts:144-148,802`) | **Aligned philosophy** — copy for persistence, import for live frames |
| Premultiplied blit (`effects-pipeline.ts:33-35`) | Blit pass to canvas (`WebGpuEngine.ts:982-1002`) — verify alpha mode on context | Audit `alphaMode: 'premultiplied'` on canvas configure |

## References

- README: professional browser NLE, WebGPU effects, Mediabunny
- Same Mediabunny dependency family as potential Beatsmaxxer WebCodecs expansion
- Verified against clone at `research/webgpu-peers/repos/freecut/` (2026-09-07, `rg` line checks)
