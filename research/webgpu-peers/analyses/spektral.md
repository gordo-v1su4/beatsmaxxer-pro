# Spektral — peer analysis

- **URL:** https://github.com/kaltwrk/spektral
- **Cloned:** 2026-09-07 (shallow, `repos/spektral/`)
- **Stars / activity:** 222 · last push 2026-09-04
- **License:** MIT
- **Analyst:** Cursor research session (V1S-57)

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | **Svelte 5**, React 19, Vue 3 — framework-neutral core + adapters |
| Build | pnpm monorepo (`packages/spektral`, `apps/web` playground/docs) |
| WebGPU | Native WebGPU — no WebGL fallback |
| Video source | `HTMLVideoElement` via `copyExternalImageToTexture` into owned `texture_2d` (not `importExternalTexture`) |
| Audio / rhythm | None — shader/time uniforms only (`SpektralFrame.time`, `delta`) |
| Other GPU | Compute passes, ping-pong feedback, storage textures/buffers |

## Render path

```text
defineMaterial(fragment WGSL + uniforms/textures)
  → resolveMaterial() → material signature
  → createRenderer() when signature changes
  → optional pass graph (ShaderPass, BlitPass, FeedbackPass, ComputePass, PingPongShaderPass)
  → fullscreen triangle → scene texture → presentation blit → canvas
```

Spektral is a **shader runtime library**, not a VJ/NLE. There is no PGM director, slot rack, or beat grid. Video is just another `TextureSource` uploaded each frame into material-owned textures.

## Video texture approach

- [ ] `importExternalTexture` per frame — **not used** for material textures
- [x] `copyExternalImageToTexture` — `uploadTextureBaseLevel()` copies `HTMLVideoElement` / canvas / image into owned GPU textures (`renderer/resource-synchronization.ts:157-169`)
- [ ] `requestVideoFrameCallback` — not found in core
- [ ] WebCodecs `VideoFrame` path
- [x] Bind group strategy — **cached layouts + stable bind groups**; texture *contents* updated via queue copy, bind group reused when resource identity unchanged

Video defaults to `perFrame` upload mode when source is `HTMLVideoElement` (`textures.ts:373-375`). Material textures become `texture_2d<f32>` sampled in fragment shaders — same binding model as static images.

Compute passes can borrow **external** textures/buffers/samplers via provider callbacks (`types.ts:400-423`, `compute-resources.ts`) — useful pattern for injecting host-owned video textures without Spektral owning upload policy.

## Audio / rhythm analysis

Not applicable. Frame clock is `SpektralFrame { time, delta, resolution }` injected into generated WGSL (`shader.ts:267-278`). No Web Audio, BPM, or beat-quantized switching.

## Shader packaging

- **Wrapper composition** — user writes `frag(uv: vec2f) -> vec4f`; `buildShaderSource()` injects uniforms, texture bindings, vertex shader, color-space helpers (`shader.ts:234-299`)
- **Post-process chain** — `ShaderPass` uses `fn shade(inputColor: vec4f, uv: vec2f) -> vec4f` over a sampled input texture (`ShaderPass.ts:9-77`)
- **Preprocess** — `#include <name>` and `#define` blocks resolved before signature (`material-preprocess.ts`, `material.ts:753-759`)
- **Hot reload** — `ShaderPass.setFragment()` rebuilds program + `invalidateFullscreenCache()` for async pipeline swap with last-known-good (`ShaderPass.ts:96-100`, `FullscreenPass.ts:141-153`)
- **Pipeline caches** — layered (see clone dissection below)
- **Diagnostics** — generated-line → user-source line maps; overlay shows material signature on compile failure (`shader.ts:197-213`, `error-overlay-model.ts:69-72`)

## Performance / latency notes

- **Async pipeline creation** — `createRenderPipelineAsync` in `FullscreenPass` so hot shader edits do not block the main thread; stale pipeline kept until new one validates (`FullscreenPass.ts:308-320, 359`)
- **Compute pipeline LRU** — max 32 entries; pending → ready/error state machine preserves first-frame dispatch while async validation completes (`renderer.ts:956-986, 1142`)
- **Render-graph plan cache** — skips dependency replan when pass topology + clear color unchanged (`renderer.ts:1745-1838, 1807-1819`)
- **Texture blob cache** — refcounted fetch cache for URL-loaded assets (`texture-loader.ts:289-315`)
- No timestamp queries documented in core; playground may add profiling separately

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | No slots — single material + optional pass graph |
| PGM beat director | No — time uniform only |
| `importExternalTexture` + idle copy | **Opposite default** — copy-to-owned-texture; external borrow API for compute only |
| Feedback ping-pong | Yes — `PingPongShaderPass`, feedback render targets |
| Essentia / Web Audio | No audio analysis |
| SvelteKit | Svelte 5 adapter (`spektral/svelte`); not SvelteKit |

## Ideas worth stealing

1. **Recompile policy split** — `buildRendererPipelineSignature()` explicitly lists compile triggers vs non-triggers (uniform values, runtime texture *sources* do not rebuild pipelines) (`recompile-policy.ts:102-121`)
2. **Compute bind-group cache** — `createComputeBindGroupCache()` reuses bind groups when `topologyKey` + `resourceRefs` identity match (`compute-bindgroup-cache.ts:32-85`)
3. **Shader hot-edit with last-known-good** — `FullscreenPass` async prep retains previous pipeline until validation succeeds (`FullscreenPass.ts:141-153, 281-362`)
4. **Material signature JSON** — deterministic cache key from preprocessed WGSL + uniform layout + texture config (`material.ts:770-780`)
5. **Source-mapped WGSL errors** — line maps tie generated wrapper lines back to user `frag()` / `shade()` source for future user-shader lane UX

## Skip / not applicable

- Scene graph / mesh rendering (by design)
- Beat-quantized PGM / Essentia integration
- `importExternalTexture` live-video path (Spektral copies; we already import)
- Adopting Spektral as a dependency wholesale — our module uber-shader + 8-slot contract is domain-specific; study patterns only

## Key files to grep

| Path | Why |
|------|-----|
| `packages/spektral/src/lib/core/recompile-policy.ts` | What triggers full renderer rebuild |
| `packages/spektral/src/lib/core/material.ts` | Material signature + `resolveMaterial()` cache |
| `packages/spektral/src/lib/core/shader.ts` | WGSL wrapper generation |
| `packages/spektral/src/lib/core/renderer.ts` | Main pipeline + compute/ping-pong caches |
| `packages/spektral/src/lib/core/compute-bindgroup-cache.ts` | Per-pass bind group reuse |
| `packages/spektral/src/lib/passes/FullscreenPass.ts` | Async render pipeline cache + bind group WeakMap |
| `packages/spektral/src/lib/passes/ShaderPass.ts` | Dynamic fragment hot reload |
| `packages/spektral/src/lib/core/textures.ts` | Video → `perFrame` copy upload policy |
| `packages/spektral/src/lib/core/renderer/resource-synchronization.ts` | `copyExternalImageToTexture` upload |

## References

- README: fullscreen WGSL library, Svelte/React/Vue, feedback + compute
- Docs: https://spektral.madebyhex.com/docs
- Playground: https://spektral.madebyhex.com/playground
- Verified against clone at `research/webgpu-peers/repos/spektral/` (2026-09-07)

---

## Clone dissection (2026-09-07)

Local clone: `repos/spektral/` (gitignored). Line refs from shallow clone at `bc64008`.

### 1. Recompile policy — compile vs runtime boundary

Spektral separates **pipeline compilation** from **per-frame work** with an explicit signature:

```102:121:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/recompile-policy.ts
 * Rebuild triggers:
 * - material signature changes (shader/layout related)
 * - color pipeline, output encoding, or HDR presentation options change
 * - adapter request options or device descriptor changes
 *
 * Non-triggers:
 * - runtime uniform values
 * - runtime texture sources
 * - clear color changes
 */
export function buildRendererPipelineSignature(input: RendererPipelineSignatureInput): string {
	return JSON.stringify({
		materialSignature: input.materialSignature,
		color: stableSignatureValue(input.color ?? {}),
		...
	});
}
```

`runtime-loop.ts` compares signatures each frame and only calls `createRenderer()` on mismatch (`runtime-loop.ts:542-576`).

**Beatsmaxxer today:** Module WGSL is static; rebuild happens on device loss or canvas resize, not on a formal signature. For a future user-shader lane, adopt this split: hash preprocessed WGSL + binding layout → pipeline; never rebuild on uniform/audio param changes.

### 2. Material signature + resolved-material cache

```770:780:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/material.ts
	const signature = JSON.stringify({
		fragmentWgsl,
		uniforms: uniformLayout.entries.map((entry) => `${entry.name}:${entry.type}`),
		textureKeys,
		textureConfig,
		storageBufferKeys: storageBufferKeys.map((key) => { ... }),
		storageTextureKeys
	});
```

`resolveMaterial()` memoizes on the `FragMaterial` object (`material.ts:742-744, 799`). Preprocessed fragment WGSL (includes/defines expanded) is part of the signature — editing `#include` or `#define` correctly forces recompile.

### 3. WGSL wrapper generation (dynamic user-shader lane)

User contract:

```54:56:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/material.ts
	 * User WGSL source containing `frag(uv: vec2f) -> vec4f`.
```

`buildShaderSource()` assembles struct bindings, fullscreen triangle vertex shader, optional sRGB/premultiply, and calls user `frag()` (`shader.ts:234-299`). Post-process passes use `shade(inputColor, uv)` instead (`ShaderPass.ts:9-10, 60-63`).

Hot reload path:

```93:100:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/passes/ShaderPass.ts
	setFragment(fragment: string): void {
		const nextProgram = buildShaderPassProgram(fragment);
		this.fragment = fragment;
		this.program = nextProgram;
		this.invalidateFullscreenCache();
	}
```

`invalidateFullscreenCache()` bumps `programVersion` and kicks async `createRenderPipelineAsync` per device while keeping last-known-good pipeline for draws (`FullscreenPass.ts:141-153, 308-320`).

**Research-only for Beatsmaxxer:** We are not shipping a user-shader lane now. When we do, Spektral's wrapper + line-map + async swap is the closest MIT peer pattern — not Ghost Arcade ISF (AGPL) or raw string concat without diagnostics.

### 4. Pipeline caches (multi-layer)

| Cache | Location | Key / invalidation |
|-------|----------|-------------------|
| Renderer rebuild | `runtime-loop.ts:556` | `buildRendererPipelineSignature()` |
| Main fragment pipeline | `renderer.ts:617-647` | Created once per renderer instance |
| Compute pipeline | `renderer.ts:957-1169` | `computeSource` + topology + workgroup; LRU 32; pending/ready/error |
| Ping-pong shader pipeline | `renderer.ts:1225-1296` | format + feedback keys + uniform layout + fragment source |
| Compute resource bind group | `compute-bindgroup-cache.ts:47-83` | `topologyKey` + layout + `resourceRefs` identity |
| Fullscreen pass pipeline | `FullscreenPass.ts:90-91, 359` | `pipelineKey` = output format + sampling layout |
| Fullscreen input bind group | `FullscreenPass.ts:58, 125-136` | `WeakMap<GPUTextureView, GPUBindGroup>` — one per input view |
| Render graph plan | `renderer.ts:1745-1838` | Pass topology + render-target signature |

Compute cache key example:

```1154:1155:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/renderer.ts
			const cacheKey = `compute:${computeUniformTopologyKey}:${buildOptions.resources.topologyKey}:${computeDeviceCapabilityKey}:${buildOptions.workgroupSize.join(',')}:${buildOptions.computeSource}`;
			const cached = computePipelineCache.get(cacheKey);
```

Ping-pong shader cache includes full fragment source in the key (`renderer.ts:1225-1234`) — shader edits always miss cache and build fresh pipeline (correct for dynamic WGSL).

### 5. Bind group frequency split (V1S-60 donor)

Spektral's `createComputeBindGroupCache` only recreates when resource **identity** changes:

```62:72:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/compute-bindgroup-cache.ts
			if (
				cachedBindGroup &&
				equalResourceRefs(cachedResourceRefs, cachedResourceRefCount, request.resourceRefs)
			) {
				return cachedBindGroup;
			}

			cachedBindGroup = device.createBindGroup({
				layout: request.layout,
				entries: request.entries
			});
```

Fullscreen passes cache bind groups per `GPUTextureView` (`passes-fullscreen-cache.test.ts:125-136` — three renders, one `createBindGroup`).

**Takeaway for V1S-60:** Same principle as FreeCut — stable bind groups for `texture_2d` / uniform buffers; volatile path only where GPU object identity changes per frame. Beatsmaxxer should cache FX bind groups for idle/cached-texture paths and keep per-task bind groups only for `importExternalTexture` (`WebGpuEngine.ts:1041-1067`).

### 6. Video / texture upload path

Spektral does **not** use `importExternalTexture` for material textures. Video defaults to per-frame copy:

```373:377:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/textures.ts
	if (isVideoTextureSource(input.source)) {
		return 'perFrame';
	}
```

```1625:1638:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/renderer.ts
				const shouldUpload =
					sourceChanged ||
					update === 'perFrame' ||
					(update === 'onInvalidate' && (renderMode !== 'always' || tokenChanged));

				if (shouldUpload && resource.ownedTexture) {
					uploadTextureBaseLevel(device, resource.ownedTexture, ...);
```

Upload implementation:

```157:169:research/webgpu-peers/repos/spektral/packages/spektral/src/lib/core/renderer/resource-synchronization.ts
export function uploadTextureBaseLevel(...) {
	device.queue.copyExternalImageToTexture(
		createExternalCopySource(source, uploadOptions),
		{ texture, mipLevel: 0 },
		{ width, height, depthOrArrayLayers: 1 }
	);
}
```

**Beatsmaxxer alignment:** Our live path correctly uses `importExternalTexture` for zero-copy preview (`WebGpuEngine.ts:1054-1055`). Spektral's copy path aligns with our `VideoTextureCache` / idle fallback philosophy, not our primary live path. No reason to switch — study their `TextureUpdateMode` enum (`once` | `onInvalidate` | `perFrame`) for future scrub/cache tiers.

### 7. External resource injection (compute borrow lane)

For host-owned GPU objects (e.g. future shared video texture), compute passes accept `externalTexture` / `externalView` providers with stable `resourceId` for cache identity (`types.ts:419-420`). Renderer validates format/usage/dimension at resolve time (`compute-resources.ts:924-951`).

Useful if we expose a "borrow slot texture into user compute pass" API without copying ownership into Spektral-style material textures.

## Beatsmaxxer mapping (`svelte/src/lib/rendering/webgpu/`)

| Spektral | Beatsmaxxer today | Gap / action |
|----------|-------------------|--------------|
| `buildRendererPipelineSignature()` (`recompile-policy.ts:115-121`) | No shader signature; pipelines tied to module registry | **Future user-shader lane** — add signature hash before `createRenderPipeline` |
| `resolveMaterial()` signature (`material.ts:770-780`) | Static `shaders/registry.ts` module map | V1S-61 snippet sharing is closer; Spektral covers *dynamic* source |
| `createComputeBindGroupCache` (`compute-bindgroup-cache.ts:47-72`) | Per-frame `createBindGroup` in `importAndBindExternalVideo` + FX path (`WebGpuEngine.ts:1057-1066, 850-888`) | **V1S-60** — cache bind groups for stable `texture_2d` + uniform buffers; volatile only for external import |
| `FullscreenPass` bind group WeakMap (`FullscreenPass.ts:58`) | Blit bind group recreated each draw (`WebGpuEngine.ts:982-988` area) | **V1S-60** — cache blit/FX bind groups keyed by view identity |
| Video `perFrame` copy (`textures.ts:373-375`, `renderer.ts:1627`) | Live `importExternalTexture` (`WebGpuEngine.ts:1054`) | **Keep import for live**; Spektral pattern matches `VideoTextureCache` copy tier |
| `ShaderPass.setFragment()` hot reload (`ShaderPass.ts:96-100`) | No user shader edit loop | **Research only** — not shipping now |
| WGSL line maps (`shader.ts:197-213`) | Module compile errors point at bundled WGSL files | **Future** — if users edit WGSL in-app, need generated↔user line mapping |
| MIT license | MIT | Safe to study / adapt patterns (not copy wholesale) |

## Worth deeper implementation study?

**Yes — targeted, not wholesale adoption.**

| Area | Depth | Rationale |
|------|-------|-----------|
| Pipeline / bind-group cache architecture | **High** | Best MIT reference for V1S-60 frequency split + formal recompile policy |
| Dynamic WGSL + hot reload + diagnostics | **Medium** | Directly informs future user-shader lane; study `ShaderPass` + `FullscreenPass` async swap |
| Video texture path | **Low** | Copy-based; we already have a stronger live import path |
| Full library integration | **No** | Domain mismatch (no slots, PGM, beat director); extract patterns into `WebGpuEngine` |

**Recommended next step:** When implementing V1S-60, read `compute-bindgroup-cache.ts` and `FullscreenPass.ts:196-362` side-by-side with FreeCut `effectBindGroupCache` — Spektral adds `resourceRefs` identity checks and async pipeline retention during shader edits.

## Updated "ideas worth stealing" (post-clone)

1. **`buildRendererPipelineSignature` + explicit non-triggers** — document same contract in Beatsmaxxer before user shaders land.
2. **`createComputeBindGroupCache`** — template for V1S-60 static bind group pool (topology key + resource identity).
3. **Async pipeline prep with last-known-good** — shader hot-edit UX without blank frames.
4. **Material `signature` JSON** — cache invalidation model for dynamic WGSL.
5. **Skip:** adopting Spektral renderer as dependency; copy-based video path; audio/rhythm (N/A).
