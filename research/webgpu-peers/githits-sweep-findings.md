# GitHits deep sweep — findings (2026-09-06)

Auth: BWS `GITHITS_API_TOKEN` via `research/webgpu-peers/githits.ps1`  
Raw logs (regeneratable): `githits-sweep-log.txt`, `githits-sweep-repos.txt`

## Sweep coverage

| Category | Queries | Method |
|----------|---------|--------|
| Cross-project patterns | 11 | `githits example` |
| Cloned peers (5) | 6 | `githits search --in github:…` |
| Discovery repos (13) | 13 | `githits search --in github:…` |

---

## Top repos ranked (GitHits + clone analysis)

| Rank | Repo | License | GitHits signal | Steal for Beatsmaxxer |
|------|------|---------|----------------|----------------------|
| 1 | [walterlow/freecut](https://github.com/walterlow/freecut) | MIT | `effects-pipeline.ts` import + fallback + `destRect` | Dual texture path, effect registry, premultiply blit |
| 2 | [0langa/beatform](https://github.com/0langa/beatform) | MIT | `fixedFeedback.ts`, `pipelineCache`, README arch | Fixed-step feedback clock, wgslLib golden tests |
| 3 | [riskcapital/ghost-arcade](https://github.com/riskcapital/ghost-arcade) | AGPL | `videoFrameBridge.ts`, performance doc | VideoFrame multi-output, ISF catalog UX |
| 4 | [webgpu/webgpu-samples](https://github.com/webgpu/webgpu-samples) | BSD-3 | `videoUploading`, `timestampQuery` | rVFC loop, timestamp QA profiling |
| 5 | [apssouza22/webgpu-video-rendering](https://github.com/apssouza22/webgpu-video-rendering) | — | `ExternalCopyPipeline`, effect registry | external→owned copy before multi-pass |
| 6 | [kaltwrk/spektral](https://github.com/kaltwrk/spektral) | MIT | `renderer.ts` pipeline cache | Dynamic WGSL + pipeline cache (if user shaders) |
| 7 | [Ableton/web-audio-sequencing](https://github.com/Ableton/web-audio-sequencing) | MIT | `transport.ts` beat/time mapping | Compare to `TransportClock` / PGM quantize |
| 8 | [kbrandwijk/webgpu-video-shaders](https://github.com/kbrandwijk/webgpu-video-shaders) | — | deband/color WGSL ports | Donor WGSL for new catalog modules |
| 9 | [disini/XGPU](https://github.com/disini/XGPU) | — | `VideoTexture.ts` | Higher-level video texture helper (study only) |
| 10 | [Sportinger/MasterSelects](https://github.com/Sportinger/MasterSelects) | — | HTML-video NLE research docs | Browser compat / fallback pitfalls |
| 11 | [shenghaoc/localcut](https://github.com/shenghaoc/localcut) | MIT | `gpu.ts`, FreeCut fork lineage | Smaller NLE to grep than FreeCut |
| 12 | [jberg/butterchurn](https://github.com/jberg/butterchurn) | MIT | `audioLevels.js` bass/mid/treb | Smoothed level vs beat impulse separation |
| 13 | [MTG/essentia.js](https://github.com/MTG/essentia.js) | AGPL | `RhythmExtractor2013` | Offline grid (we use hosted Essentia) |
| 14 | [vijaypemmaraju/rondocode](https://github.com/vijaypemmaraju/rondocode) | MIT | shaderviz renderer | Spectrum/waveform GPU textures → uniforms |
| 15 | [jpaquim/svelte-webgpu](https://github.com/jpaquim/svelte-webgpu) | — | Svelte canvas lifecycle | Raw WebGPU + Svelte (stale but small) |

**No GitHits example hit:** “VJ clip launcher beat quantized crossfader WebGPU” — confirms **Ghost Arcade** is the closest public product peer; Beatsmaxxer’s 8-slot + PGM combo remains unique.

---

## Pattern confirmations (GitHits `example` distilled)

### 1. Eight-slot `importExternalTexture` (validates our rack)

GitHits synthesized an **8-video 4×2 grid** with per-slot `importExternalTexture` + `setViewport` + per-frame bind groups.

**Refs:** gfx-rs/wgpu#9936, FreeCut `effects-pipeline.ts`

**Beatsmaxxer:** Already matches — separate canvases per slot is cleaner than one grid pass.

### 2. Beat-quantized transport (`BeatTransport` class)

Lookahead scheduler queues state changes to next beat/bar boundary; maps beat index ↔ `AudioContext.currentTime`.

**Refs:** sourdaw playhead scheduler, Conchylicultor/singularity scheduler

**Beatsmaxxer:** Compare with `PgmDirector` + `TransportClock`; Ableton `transport.ts` is a lighter portable reference.

### 3. Effect registry + ping-pong + pipeline cache

`EffectRegistry` + `WgslPipelineCache` keyed by **shader source string**; ping-pong feedback textures.

**Refs:** spektral, cazala/party, felixtrz/aperture

**Beatsmaxxer:** Uber-shader + `effectMode` wins for 8 fixed modules; cache pattern matters if we add user WGSL/ISF.

### 4. Timestamp-query profiling

`TimestampQueryManager` pattern: query set, resolve buffer, MAP_READ pool, ms from nanosecond delta.

**Refs:** webgpu-samples, gaussian-splatting-webgpu, Scthe/gpuProfiler

**Beatsmaxxer:** Tier 2 — gate behind `__BMX_QA__` for per-module FX pass timing.

### 5. WebCodecs → external → owned `texture_2d`

Chain: `VideoFrame` → `importExternalTexture` → copy pass → effect ping-pong.

**Refs:** localcut `gpu.ts`, Babylon `webgpuTextureManager`, MasterSelects worker presenter

**Beatsmaxxer:** Use when a module needs >1 pass on live external texture.

### 6. Bind group frequency split

Static sampler group + per-frame uniform/external/feedback groups.

**Refs:** Babylon `webgpuCacheBindGroups`, Toji best practices, gpuweb CTS external video spec

**Beatsmaxxer:** Tier 1 latency win across 8 previews + PGM.

### 7. Audio → GPU spectrum textures

`AnalyserNode` → `writeTexture` for spectrum + waveform → shader samples textures.

**Refs:** rondocode/shaderviz, eliza orb-kit

**Beatsmaxxer:** Optional upgrade from 8-band buckets if shader needs finer control.

### 8. ISF parser + WebGPU effect rack (synthesized)

Parse ISF JSON header → uniform struct → WGSL effect bodies (GLSL not consumed directly).

**Refs:** jbrowse shader-tools, stims/milkdrop WebGPU feedback

**Beatsmaxxer:** Tier 3 — Ghost Arcade has production ISF path (AGPL — reimplement API).

---

## Repo search highlights (file:line)

| Repo | Key hits |
|------|----------|
| webgpu-samples | `videoUploading/main.ts:165` import in bind group; `main.ts:254` rVFC; `TimestampQueryManager.ts` |
| freecut | `effects-pipeline.ts:55` IMPORT_EXTERNAL_SHADER; `:918`/`:1037` import paths; `:252` fallback |
| beatform | `fixedFeedback.ts:12` clock; `webgpuRenderer.ts:3514` pipelineCache; README render/ arch |
| ghost-arcade | `videoFrameBridge.ts:168`; `settings.ts:734` WebGPU output rationale; `WEBGPU_MIGRATION.md` |
| webgpu-video-rendering | `ExternalCopyPipeline.ts:19`; `VideoFrameRenderer.ts` orchestration |
| Ableton | `transport.ts:137` beat/time conversion |
| kbrandwijk | `deband.ts`, libplacebo-style WGSL |
| XGPU | `VideoTexture.ts:29` importExternalTexture wrapper |
| MasterSelects | `consensus-B-pitfalls.md` — HTMLVideo + WebGPU edge cases |
| spektral | `renderer.ts:2746` pipeline cache |

---

## Updated tier list (post-sweep)

### Tier 1 — ship next
1. Bind group frequency split (Babylon/Toji pattern)
2. `wgslLib.ts` extraction + golden tests (Beatform)
3. `requestVideoFrameCallback` on non-audio-locked slots (webgpu-samples)
4. FreeCut `destRect` import pass for slot aspect-fit

### Tier 2 — QA / determinism
5. `FixedFeedbackClock` port (Beatform)
6. `TimestampQueryManager` behind QA flag (webgpu-samples)
7. Compare `BeatTransport` / Ableton transport vs `PgmDirector` quantize edge cases

### Tier 3 — future
8. ISF uniform parser (Ghost Arcade patterns, clean-room)
9. `ExternalCopyPipeline` for multi-pass on external texture (apssouza22)
10. kbrandwijk deband/color WGSL donors for catalog expansion
11. spektral-style pipeline cache if user shaders land

---

## What GitHits confirms we already do right

- Per-task `importExternalTexture` + no cross-frame external cache
- Idle `texture_2d` copy via `VideoTextureCache`
- Uber-shader + `effectMode` for 8 modules (better than per-effect compile for fixed rack)
- Single `AppLoop` + audio-master transport
- No close OSS peer for **SvelteKit + 8 HTMLVideo slots + beat PGM** (VJ example query returned empty)

---

## Rerun sweep

```powershell
.\scripts\githits.ps1 example "your query" -l typescript
.\scripts\githits.ps1 search "pattern" "--in" "github:owner/repo" "--limit" "8"
```

Requires: global `githits` (`bun add -g githits`), BWS bootstrap `BWS_ACCESS_TOKEN`, secret `GITHITS_API_TOKEN`.
