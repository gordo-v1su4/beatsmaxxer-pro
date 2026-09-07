# webgpu-video-shaders — peer analysis

- **URL:** https://github.com/kbrandwijk/webgpu-video-shaders
- **Cloned:** 2026-09-06 (shallow)
- **Stars / activity:** 8 · last push 2026-03-21
- **License:** **LGPL-2.1-or-later** (not MIT) — faithful ports of [libplacebo](https://github.com/haasn/libplacebo) (also LGPL-2.1+)
- **Analyst:** Cursor research session (V1S-58)

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | None — library only (no demo app in repo) |
| Build | tsup → `dist/` ESM + CJS |
| WebGPU | Raw compute shaders (generated WGSL strings) |
| Video source | Consumer supplies `texture_2d<f32>` — no HTMLVideo/WebCodecs glue |
| Audio / rhythm | None |
| Other GPU | No WebGL fallback; no fragment/render passes |

## Render path

```text
Consumer-owned texture_2d<f32> (video frame already copied from external)
  → optional single-pass compute (Tier 2: create*Shader)
  → OR composed multi-effect compute (Tier 1: paste fn bodies + one main)
  → texture_storage_2d write
```

There is **no runnable render loop** in the repo. README snippets show how a host app wires `createShaderModule` → `createComputePipeline` → `dispatchWorkgroups`. Multi-pass HDR pipelines (peak detect → LUT gen → LUT apply → color map) are documented but left to the integrator.

**No `.wgsl` files on disk.** All shader code lives in TypeScript template literals under `src/` and is emitted as strings at call time (Tier 1) or as full compute modules (Tier 2).

## Video texture approach

- [ ] `importExternalTexture` per frame — not implemented (out of scope for this library)
- [ ] `copyExternalImageToTexture` — host responsibility
- [ ] `requestVideoFrameCallback`
- [ ] WebCodecs `VideoFrame` path
- [x] Bind group strategy documented: `@binding(0)` input `texture_2d<f32>`, `@binding(1)` output `texture_storage_2d` — additional bindings only on LUT/peak/complex passes

## Audio / rhythm analysis

- None — color science / resampling / film look only

## Shader packaging

### Two-tier API (`src/core.ts`)

| Tier | Interface | What you get | Params |
|------|-----------|--------------|--------|
| **1 — Composable** | `ShaderFunction` | WGSL `fn` body + `fnName` | Baked as **shader constants** at generation time (no runtime uniform buffer for most effects) |
| **2 — Complete** | `ShaderResult` | Full `@compute` shader + `extraBindings[]` | Same baking; complex passes add `storage` / `uniform` bindings |

### Entry points

- **All effects are compute shaders**, not fragment passes.
- Standard entry: `@compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) id: vec3u)` — see `src/shaders/deband-shader.ts:19-26`, `src/shaders/tonemap-shader.ts:17-25`.
- Tier 1 functions are **pure WGSL functions** called from a host-written `main` (README lines 69-90).

### Uniform / binding contracts

| Pattern | Examples | Notes |
|---------|----------|-------|
| Constants only | `createDeband`, `createToneMap`, `createVignette` | TS params → literals in WGSL (`deband.ts:42-53`, `tonemap.ts:48-89`) |
| `frameIndex` for temporal noise | `DebandParams.frameIndex` | PCG3D seed includes frame counter (`deband.ts:34-35`, `147`) |
| Extra storage buffers | `createPeakDetectShader` | Atomics histogram + IIR smooth buffer (`peak-detect-shader.ts:12-22`, `65-80`) |
| Uniform + LUT buffers | `createColorMapShader` | 16× f32 uniform + 1D tone LUT + 3D gamut LUT (`color-map-shader.ts:13-18`, `56-70`) |
| CPU-side LUT generators | `generateBayerMatrix`, `generateBlueNoise`, `buildToneMapLutParams` | Feed GPU buffers from TS |

### Barrels

- `src/libplacebo.ts` — libplacebo 1:1 ports (color, tone, gamut, deband, dither, sampling)
- `src/original.ts` — independent generators (vignette, sharpen, blur, distort, deinterlace) — **same LGPL package license**, not a separate permissive tier

### Monolithic vs modular

- **Modular by design:** compose `deband.fn + tonemap.fn + grain.fn` in one dispatch (README Tier 1 example).
- **No shared `#include` WGSL file** — each generator inlines helpers (e.g. PCG3D inside `deband.ts:122-132`).
- Hot reload: regenerate WGSL string when TS params change → new `createShaderModule` (host must pipeline-cache).

## Performance / latency notes

- Single-pass deband/grain/vignette: one 16×16 tiled dispatch — suitable for per-slot FX if input is already `texture_2d`.
- HDR LUT pipeline: 3+ passes + atomic peak detect — **overkill for live 8-slot VJ** unless targeting HDR export.
- `rgba16float` outputs common in Tier 2 shaders (`deband-shader.ts:15`) — matches Beatsmaxxer feedback headroom.
- No device-loss or profiling hooks in library.

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | N/A — library, no rack |
| PGM beat director | No |
| `importExternalTexture` + idle copy | Host must copy external → `texture_2d` before calling generators |
| Feedback ping-pong | Consumer can write compute output into feedback write texture |
| Essentia / Web Audio | No |
| SvelteKit | No |
| 19-module catalog + `moduleFx.wgsl.ts` | Potential **donor algorithms** for future `film` / color modules |

## Ideas worth stealing

1. **Tier-1 composable `fn` pattern** — generate effect body once, stitch into Beatsmaxxer's shared compute `main` instead of growing `moduleFx.wgsl.ts` switch arms blindly.
2. **`createDeband` flash3kyuu + PCG3D grain** — production-grade banding removal for compressed clips / gradients (stronger than simple noise overlay).
3. **`createColorMap` transfer + primaries** — 17 EOTF/OETF functions + Bradford gamut matrix (`colormap.ts:10-27`, `106-137`) for future HDR-ish grading module.
4. **`createDither` + `createGrain` as separate steps** — split film texture from deband grain mask (libplacebo separates these; our `grain` module could borrow `grain.ts` PRNG).
5. **Original-tier `createVignette` / `createSharpen` / `createDistort`** — lighter than libplacebo HDR stack; good palette-only donors for `anamorphic` / `bulge` adjacency.

## Skip / not applicable

- Full `createColorMapShader` orchestrator — multi-binding HDR pipeline; not a single-slot FX drop-in (`color-map-shader.ts:4-11`).
- `createDoviReshape`, `createDecodeColor` / `createEncodeColor` — broadcast/Dolby pipelines; no current ingest path.
- `createErrorDiffusionShader` — multi-pass error buffer; too heavy for real-time 8-slot.
- `createPeakDetectShader` + LUT gen/apply trio — scene-adaptive HDR; defer unless export/HDR preview lane opens.
- `createPolarSampleShader` / EWA resampling — scaling lane, not beat FX.
- README WebGPU setup blocks — integration boilerplate only, not reusable library code.
- `dist/`, `node_modules/` — build artifacts, not source of truth (read `src/`).

## Donor WGSL catalog (future module donors)

Priority for Beatsmaxxer **film / color** catalog expansion. Paths are TypeScript **generators** (run at build or codegen time to emit WGSL).

| Priority | Generator path | Tier | `fnName` / entry | Beatsmaxxer fit |
|----------|----------------|------|------------------|-----------------|
| **P0** | `src/deband.ts` | 1 | `deband(tex, coord, texDims)` | New **DEBAND** film module or VHS pre-pass — kills compression banding |
| **P0** | `src/grain.ts` | 1 | `grain(color, coord)` | Upgrade **FILM GRAIN** (`shaderKey: grain`) PRNG quality |
| **P1** | `src/colormap.ts` | 1 | `colormap_*` fns (linearize/delinearize/matrix) | Future **COLOR GRADE** / log→display module |
| **P1** | `src/dither.ts` | 1 | `dither(...)` | 8-bit crush / CRT depth reduction paired with VHS |
| **P1** | `src/vignette.ts` | 1 | `vignette(color, coord, texDims)` | Complement **ANAMORPHIC** letterbox (optical falloff) |
| **P1** | `src/sharpen.ts` | 1 | sharpen / CAS fns | Subtle clarity on **HALATION** threshold path |
| **P2** | `src/tonemap.ts` | 1 | `tonemap(color)` | Quick SDR crush preview — **per-channel RGB**, hue shifts on saturated HDR (`tonemap.ts:11-30`) |
| **P2** | `src/gamut-map.ts` | 1 | gamut map fns | Only if wide-gamut source ingest appears |
| **P2** | `src/distort.ts` | 1 | barrel/chroma | Adjacent to **BARREL** (`bulge`) — compare before merge |
| **P2** | `src/gaussian-blur.ts` | 1 | blur kernel | **HALATION** bloom pre-filter donor |
| **P3** | `src/shaders/deband-shader.ts` | 2 | `main` compute | Reference wiring for catalog module scaffold |
| **P3** | `src/shaders/tonemap-shader.ts` | 2 | `main` compute | Same — complete pass template |
| **Defer** | `src/shaders/color-map-shader.ts` | 2 | multi-LUT `main` | HDR export lane only |
| **Defer** | `src/shaders/peak-detect-shader.ts` | 2 | atomic histogram | Scene stats — not slot FX |
| **Defer** | `src/shaders/error-diffusion-shader.ts` | 2 | error buffer | Offline/quality mode |

### Tier 2 wrapper files (complete compute shaders)

| Path | Bindings | Output format |
|------|----------|---------------|
| `src/shaders/deband-shader.ts` | 0=in, 1=storage out | `rgba16float` |
| `src/shaders/tonemap-shader.ts` | 0=in, 1=out | `rgba16float` |
| `src/shaders/dither-shader.ts` | 0=in, 1=out | `rgba16float` |
| `src/shaders/upscale-shader.ts` | 0=in, 1=out + sampler | resize pass |
| `src/shaders/sharpen-shader.ts` | 0=in, 1=out | sharpen pass |
| `src/shaders/gaussian-blur-shader.ts` | 0=in, 1=out | blur pass |
| `src/shaders/peak-detect-shader.ts` | 0=in, 2-3=storage stats | no color out |
| `src/shaders/color-map-shader.ts` | 0-5 textures/buffers | full HDR pipeline |

## Key files to grep

| Path | Why |
|------|-----|
| `src/core.ts` | `ShaderFunction` / `ShaderResult` contracts |
| `src/libplacebo.ts` | Full export index — libplacebo vs Tier 2 shaders |
| `src/deband.ts` | Primary deband + PCG3D donor |
| `src/colormap.ts` | Color science / transfer functions |
| `src/tonemap.ts` | 12 tone curves + per-channel limitation docs |
| `src/shaders/deband-shader.ts` | Minimal compute wrapper pattern |
| `src/shaders/color-map-shader.ts` | Complex uniform + LUT layout |
| `README.md` | Tier 1/2 usage, HDR LUT pipeline diagram |
| `LICENSE` | LGPL-2.1-or-later |

## File:line citations

### API contracts

| Lines | Pattern |
|-------|---------|
| `core.ts:1-9` | `ShaderFunction` — `fn`, `fnName`, `description` |
| `core.ts:11-19` | `ShaderResult` — full `wgsl`, `extraBindings`, `description` |
| `core.ts:21-25` | `BindingDescriptor` — `storage` \| `uniform` \| `texture` \| `sampler` |

### Deband + grain (top donors)

| Lines | Pattern |
|-------|---------|
| `deband.ts:8-35` | `DebandParams` — iterations, threshold, radius, grain, `frameIndex` |
| `deband.ts:37-54` | Params scaled to libplacebo PL_HDR_NORM (`threshold / (1000 * scale)`) |
| `deband.ts:62-89` | Multi-iteration quadrant sampling loop (flash3kyuu) |
| `deband.ts:94-109` | Optional grain mask — vec3 independent PRNG per channel |
| `deband.ts:122-132` | `pcg3d()` — faithful libplacebo `sh_prng` |
| `deband.ts:134-154` | `deband()` signature: `texture_2d<f32>`, `vec2i` coord, dims → `vec4f` |
| `deband-shader.ts:14-26` | Standard bindings + `@workgroup_size(16,16)` `main` |
| `grain.ts:10-15` | `GrainParams` — amount, neutral RGB |
| `grain.ts:46-52` | `grain(color, coord)` — `vec4f` in/out |

### Color / tone

| Lines | Pattern |
|-------|---------|
| `colormap.ts:9-27` | `ColorSpace`, `TransferFunction` enums (17 transfers) |
| `colormap.ts:29-56` | `ColorMapParams` — src/dst space, peak nits, csp min/max |
| `tonemap.ts:11-30` | **Doc:** per-channel RGB tone map causes hue shift; use LUT/IPT for correct HDR |
| `tonemap.ts:34-46` | Twelve `ToneMapMethod` values |
| `tonemap.ts:48-89` | `ToneMapParams` — nits, knees, exposure |
| `color-map-shader.ts:4-18` | Full pipeline stages + binding list |
| `color-map-shader.ts:56-70` | Uniform buffer layout — 16× f32, PQ/LUT sizes |

### Original-tier (lighter FX)

| Lines | Pattern |
|-------|---------|
| `original.ts:1-5` | Marked independent of libplacebo C ports — still LGPL package |
| `vignette.ts:6-15` | `VignetteParams` — strength, inner/outer radius, roundness |
| `vignette.ts:25-38` | Aspect-aware `vignette()` body |

### Peak detect (defer)

| Lines | Pattern |
|-------|---------|
| `peak-detect-shader.ts:4-11` | 12-slice atomic histogram + IIR smoothing |
| `peak-detect-shader.ts:12-22` | Buffer layout comments for bindings 2-3 |

## Beatsmaxxer mapping

**Scope:** future catalog modules — not current sprint unless trivial wiring. Integration must respect **LGPL-2.1** (dynamic linking via npm, attribution, or separate LGPL-compliant artifact).

| Donor | Target module / lane | Integration sketch |
|-------|----------------------|-------------------|
| `createDeband` | New `deband` film module or VHS preprocess | Add `shaderKey`; codegen `deband.fn` into slot compute pass; expose `iterations`, `threshold`, `grain`, `mix`; increment `frameIndex` per `fixedStepIndex` |
| `createGrain` | Existing `grain` (`catalog.ts` id `grain`) | Replace or blend PRNG in `moduleFx.wgsl.ts` grain branch with `grain.ts` vec3 PRNG |
| `createVignette` | `anamorphic` or palette-only vignette | Params map to `strength` / radius; compose after letterbox in same pass |
| `createSharpen` / `createGaussianBlur` | `halation` bloom chain | Blur donor for threshold mask; sharpen for post-bloom clarity |
| `createDither` | `vhs` or new CRT module | `targetDepth` + `temporal` tied to beat clock |
| `createColorMap` | Future **COLOR** / log workflow | Requires linear working space in feedback textures (`rgba16float` already used) |
| `createToneMap` (Tier 1) | Export / preview SDR clamp only | Avoid for live saturated looks — use only with `mix` low; prefer IPT LUT tier for correctness |
| `createDistort` | Compare with `bulge` (`shaderKey: bulge`) | May duplicate barrel math — grep before importing |
| Tier 2 `create*Shader` | Module scaffolding tests | Copy binding layout into `WebGpuEngine` pass factory when adding multi-binding modules |

### Catalog registration touchpoints (when implemented)

1. `svelte/src/lib/modules/catalog.ts` — new `ModuleDefinition` row (`category: 'film'`, `shaderKey`, params).
2. `svelte/src/lib/rendering/webgpu/shaders/registry.ts` — WGSL body or codegen hook.
3. `moduleFx.wgsl.ts` — effect mode arm or injected snippet from `webgpu-video-shaders` generator output.
4. Preset table — three named presets per module (`svelte/docs/MODULES.md`).

### License integration note

- **Not MIT.** Package `LICENSE` and `package.json` specify **LGPL-2.1-or-later**; algorithms trace to libplacebo (LGPL-2.1+).
- **Reusable:** npm dependency + dynamic linking, or emit WGSL with LGPL attribution and compliance review.
- **Not reusable as proprietary paste:** copying generated WGSL into `moduleFx.wgsl.ts` without LGPL compliance is risky — treat as LGPL donor, not public-domain snippet.
- **Demo-only:** README TypeScript blocks, `dist/` bundles, Skia/TypeGPU examples — documentation, not runtime deps.

## References

- README: Tier 1/2 API, composable deband+tonemap+grain, HDR LUT pipeline, TypeGPU/Skia examples
- libplacebo source cross-refs in file headers (e.g. `deband.ts:2-4` → `sampling.c` `pl_shader_deband`)
- Beatsmaxxer module docs: `svelte/docs/MODULES.md`, `svelte/src/lib/modules/catalog.ts`
