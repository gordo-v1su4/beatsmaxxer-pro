# Beatform — peer analysis

- **URL:** https://github.com/0langa/beatform
- **Cloned:** 2026-09-06 (shallow)
- **Stars / activity:** 1 · last push 2026-09-02
- **License:** MIT
- **Analyst:** Cursor research session

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | React + Tauri 2 shell |
| Build | Vite, Rust core |
| WebGPU | Native renderer (`webgpuRenderer.ts`); Canvas2D fallback |
| Video source | Generative / audio-driven (not 8-slot HTMLVideo rack) |
| Audio / rhythm | Web Audio spectrum, spectral-flux beat detection, phase-locked waveform |
| Other GPU | Compute particles (`particleSim` / `particleDraw`) |

## Render path

```text
AudioFeatures (uniform struct)
  → preset WGSL (assembled from HEADER + wgslLib + preset body)
  → optional feedback composite (visTex / histTex / sceneTex)
  → tonemap (ACES) → canvas / deterministic MP4 export
```

Presets opt into feedback by calling `feedbackSample(uv)` in WGSL. Renderer detects this with `/feedbackSample\s*\(/` and enables a three-texture feedback graph.

## Video texture approach

- [ ] `importExternalTexture` per frame — **not primary path** (generative modes)
- [x] Feedback history via owned `texture_2d` ping-pong
- [ ] `requestVideoFrameCallback`
- [ ] WebCodecs `VideoFrame` path
- [x] Bind group strategy: `pipelineCache` keyed by preset **object identity**; bind groups nulled on preset switch

## Audio / rhythm analysis

- Real-time Web Audio analysis: band energies, spectral flux beat detection, slow envelope
- Offline whole-track rhythm possible via same engine for export sync
- `AudioFeatures` struct passed to shaders — renderers never touch raw FFT buffers
- Beat-quantized switching: N/A (single full-frame preset, not PGM cuts)

## Shader packaging

- **Per-preset modules** assembled at runtime (`assemblePresetModule`)
- Shared `wgslLib.ts` (palette, tonemap, HSL helpers)
- `WeakMap` pipeline cache — A→B→A revisits cached pipelines
- `FixedFeedbackClock` at 60 Hz for export determinism
- Golden WGSL tests per preset (`*.test.ts` assert no accidental feedbackSample)

## Performance / latency notes

- `RT_IDLE_FRAMES` — lazy release of render targets when idle
- HDR intermediate `rgba16float` for headroom before tonemap
- Device loss recovery with generation bump (same class of fix as Beatsmaxxer)
- Performance overlay in renderer (product-facing profiling)

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | No — Builder compositor up to 12 layers, different model |
| PGM beat director | No |
| `importExternalTexture` + idle copy | Partial — not live clip focused |
| Feedback ping-pong | **Yes** — richer 3-texture graph + fixed-step clock |
| Essentia / Web Audio | Web Audio only (lighter, in-process) |
| SvelteKit | No (React) |

## Ideas worth stealing

1. **`FixedFeedbackClock`** — integer-index feedback ticks decoupled from presentation FPS; pairs with our `advanceFeedbackTo(fixedStepIndex)`.
2. **`wgslLib.ts` + golden tests** — extract shared WGSL snippets from monolithic `moduleFx.wgsl.ts` without visual drift.
3. **Preset pipeline cache pattern** — if we add user/custom WGSL modules later, cache by module object not string hash.
4. **Opt-in feedback** — regex gate for `feedbackSample(` avoids paying composite pass on non-feedback modules.
5. **AudioFeatures uniform contract** — strict boundary between audio engine and shader uniforms.

## Skip / not applicable

- Tauri desktop packaging patterns (separate desktop branch)
- React UI / preset browser UX
- Generative-only modes without live video slots

## Key files to grep

| Path | Why |
|------|-----|
| `src/render/webgpuRenderer.ts` | Pipeline cache, feedback graph, device loss |
| `src/render/wgslLib.ts` | Shared WGSL snippets |
| `src/render/fixedFeedback.ts` | Deterministic feedback clock |
| `src/render/shaderGolden.test.ts` | GPU-free WGSL + ABI snapshots |
| `src/export/exportCore.ts` | FixedFeedbackClock drain in export loop |
| `src/audio/types.ts` | `AudioFeatures` render contract |
| `src/render/presets/*.ts` | Preset WGSL assembly + per-preset golden asserts |

## File:line citations

Verified against clone at `research/webgpu-peers/repos/beatform/` (2026-09-06 shallow).

### `wgslLib.ts` — shared WGSL snippets

| Symbol | Lines | Role |
|--------|-------|------|
| Module contract | `wgslLib.ts:1-34` | Leaf module: text constants only, zero drift by construction; edits require golden + GPU matrix re-bless |
| `WGSL_HSL2RGB` | `wgslLib.ts:42-54` | HSL→RGB helper pasted into compute/mesh modules that cannot share HEADER |
| `wgslAcesTonemap(name)` | `wgslLib.ts:64-69` | Parameterized ACES body (`aces` / `tonemap` / `m3_tonemap` aliases) |
| `WGSL_COLOR_CONTROLS` | `wgslLib.ts:79-86` | `presetColor` + saturation/lightness scalers for six full-colour presets |
| `WGSL_PALETTE_PHASE` / `WGSL_PALETTE_STD` | `wgslLib.ts:95-103` | IQ cosine-palette basis shared across 17 call sites |
| HEADER import | `webgpuRenderer.ts:6` | `WGSL_HSL2RGB`, `wgslAcesTonemap` composed into shared prelude |
| Preset import | e.g. `presets/nebula.ts:2`, `presets/spectroFalls.ts:2` | Per-preset palette/color preamble without duplicating constants |

### `assemblePresetModule` — runtime WGSL assembly

| Symbol | Lines | Role |
|--------|-------|------|
| `presetPrefix()` | `webgpuRenderer.ts:1695-1708` | `HEADER + COMPOSITE_BODY + FS_MAIN + P_<key>()` accessors in ABI order |
| `assemblePresetModule()` | `webgpuRenderer.ts:1719-1721` | Single source of truth: `presetPrefix + preset.wgsl` → `createShaderModule` |
| `SHADER_SOURCES` | `webgpuRenderer.ts:1749-1758` | Standalone modules (particles, mesh, blend, post) frozen alongside presets |
| `setPreset` compile | `webgpuRenderer.ts:3559-3580` | Cache miss path calls `assemblePresetModule` then `createRenderPipeline` |

### `pipelineCache` — WeakMap keyed by preset object

| Symbol | Lines | Role |
|--------|-------|------|
| Field declaration | `webgpuRenderer.ts:2109-2112` | `WeakMap<PresetDef, { module, scene, direct? }>` — object identity, not string id |
| Cache hit | `webgpuRenderer.ts:3553-3557` | A→B→A live switch reuses compiled module (avoids hitch) |
| Cache miss + store | `webgpuRenderer.ts:3559-3580` | New object (edited custom preset) correctly recompiles |
| `directPipelineFor()` | `webgpuRenderer.ts:3587-3602` | Lazy swapchain-format variant from cached module (M24 fast path) |
| Bind group null on switch | `webgpuRenderer.ts:3556, 3581` | Pipeline reused; bind groups rebuilt lazily (bins/params changed) |

### `FixedFeedbackClock` / feedback ping-pong

| Symbol | Lines | Role |
|--------|-------|------|
| `FEEDBACK_HZ` / `FEEDBACK_DT` | `fixedFeedback.ts:2-3` | Canonical 60 Hz feedback state grid |
| `FixedFeedbackClock` | `fixedFeedback.ts:12-22` | `drainThrough(t)` → integer-index tick times (no accumulated float drift) |
| `isFeedbackTick()` | `fixedFeedback.ts:26-28` | Distinguishes state-grid frames from presentation-only frames |
| Clock tests | `fixedFeedback.test.ts:5-38` | Same 60 ticks/sec at 24–144 fps presentation rates |
| `feedbackSample()` ABI | `webgpuRenderer.ts:362-368` | Preset calls this to opt in; samples `feedbackTex` (histTex) |
| `presetUsesFeedback()` | `webgpuRenderer.ts:1683-1686` | Comment-stripped regex `/feedbackSample\s*\(/` gates extra passes |
| Three-texture graph | `webgpuRenderer.ts:2164-2178` | `visTex` (raw) → composite → `sceneTex`; `histTex` holds previous raw |
| `ensureFeedbackTargets()` | `webgpuRenderer.ts:2659-2697` | Creates vis/hist + composite pipeline; sets `feedbackClearPending` on resize |
| Feedback render branch | `webgpuRenderer.ts:4035-4057` | Clear hist → draw preset to visTex → composite to scene → copy vis→hist on advance |
| `present-history` mode | `webgpuRenderer.ts:4039-4043` | Re-show last state without re-evaluating accumulating recurrence |
| Export drain loop | `exportCore.ts:977, 1016-1058` | `FixedFeedbackClock.drainThrough(t)` + `feedback: "advance-only"` between output frames |
| Export gate (AX-2) | `exportCoreFeedbackGate.test.ts:5-12, 83` | Second OfflineAnalyzer only when job presets call `feedbackSample()` |

### `AudioFeatures` — audio→render contract

| Symbol | Lines | Role |
|--------|-------|------|
| Interface | `audio/types.ts:6-115` | Bins, waveform L/R, band energies, beat grid, `time` / `timeOrigin` |
| Contract comment | `audio/types.ts:2-5` | Renderers consume `AudioFeatures` only — never raw FFT buffers |
| Uniform upload | `webgpuRenderer.ts` render path | Features packed into uniform + storage buffers before draw |

### Deterministic export / golden test patterns

| Pattern | Lines | Role |
|---------|-------|------|
| `shaderGolden.test.ts` | `shaderGolden.test.ts:7-70` | Snapshots `assemblePresetModule()` per preset + `SHADER_SOURCES` + param ABI order — GPU-free, <1s |
| Per-preset semantic tests | e.g. `presets/spectroFalls.test.ts:33-50` | Asserts `feedbackSample` opt-in, track-time scroll formula, no feedback in advance body |
| `presetUsesFeedback` in tests | `presets/overgrowth.test.ts:40`, `particleFlow.test.ts:212-213` | Negative asserts: compute shaders must not accidentally call feedback |
| `gpuMatrix.test.ts` + baselines | `gpuMatrix.test.ts`, `__baselines__/gpu-pixel-matrix.json` | Device-gated pixel hash matrix; Node tests cover builder state restore |
| Determinism law | `CLAUDE.md:54` | Preview === export from track time via `frameResolve.ts` chokepoints |
| Export design | `docs/EXPORT-DESIGN.md:25, 143` | Same `AudioFeatures` contract on live and offline paths |

## Beatsmaxxer mapping

Compared to `svelte/src/lib/rendering/webgpu/WebGpuEngine.ts` and `shaders/moduleFx.wgsl.ts`. Directly informs **[V1S-61](https://linear.app/v1su4/issue/V1S-61)** (wgslLib extraction + golden tests).

| Beatform pattern | Beatsmaxxer today | Gap / action (V1S-61) |
|------------------|-------------------|------------------------|
| **`wgslLib.ts` leaf module** | All WGSL in one `moduleFx.wgsl.ts` (~2100 lines); helpers like `beatPulse`, `sampleFeedback`, `sampleSource` live inline | Extract shared snippets to `shaders/wgslLib.ts`; compose `MODULE_FX_WGSL` from constants (Beatform proved zero snapshot churn on pure moves) |
| **`shaderGolden.test.ts`** | No WGSL source snapshots; visual proof via `capture-visual-proof-runner.ts` (GPU + browser) | Add `tests/unit/rendering/shaderGolden.test.ts` snapshotting assembled `MODULE_FX_WGSL` (+ idle variant); catches ABI drift without Dawn |
| **`assemblePresetModule`** | Single uber-shader + `SHADER_EFFECT_MODE` uniform branch (`WebGpuEngine.ts:312-313`) | Different architecture (8-slot video rack, not per-preset modules). **Not a direct port** — golden tests still apply to monolithic WGSL |
| **`pipelineCache` WeakMap** | Pipelines compiled once per engine init (`WebGpuEngine.ts:311-313`); effect switch is uniform-only, no recompile | Low priority unless we add user/custom WGSL modules; catalog hot-swap is already cheap |
| **`presetUsesFeedback` regex gate** | Feedback always allocated per binding (`WebGpuEngine.ts:93-95`); all modules pay bind slot 3–4 | Could skip feedback bind/pass for modules that never call `sampleFeedback` (grep `moduleFx.wgsl.ts:739-743`) |
| **Three-texture feedback graph** | Two-texture ping-pong in `feedback.ts:45-130`; FX writes offscreen then blits (`WebGpuEngine.ts:963-979`) | Beatform separates raw visual (`visTex`) from composited scene (`sceneTex`) so feedback history never includes overlays/tonemap. We composite in-shader — simpler but trails include post-stack if added later |
| **`FixedFeedbackClock.drainThrough`** | `advanceFeedbackTo(fb, generation, fixedStepIndex)` in `feedback.ts:79-117`; timeline uniforms at `WebGpuEngine.ts:1113-1115` | Same integer-index idea. Beatform additionally **re-renders advance-only frames** in export (`exportCore.ts:1016`) when presentation fps < 60 — we degrade with `skippedSteps` instead of replay |
| **`AudioFeatures` boundary** | `FrameContext` in `WebGpuEngine.ts:47-72` (beat, amps, timeline) | Analogous contract. Beatform's is richer (bins, L/R waveform, section index). Our Essentia path could extend `FrameContext` without touching WGSL |
| **Per-preset golden asserts** | Module behaviour tested via browser QA only | Port pattern: per-effect tests asserting `sampleFeedback` usage, beat-time formulas (see `spectroFalls.test.ts:41-50`) |
| **GPU pixel matrix** | `capture:visual-proof` scripts | Beatform's `gpu-pixel-matrix.json` is a heavier device gate; our visual proof is comparable but not hash-baselined per module |

### V1S-61 steal list (from this analysis)

1. Create `svelte/src/lib/rendering/webgpu/shaders/wgslLib.ts` as a leaf (no imports) mirroring Beatform's contract comment (`wgslLib.ts:13-25`).
2. Add `shaderGolden.test.ts` snapshotting `MODULE_FX_WGSL` + `MODULE_FX_IDLE_WGSL` before any helper moves.
3. Add per-module tests for feedback opt-in (modules using `sampleFeedback` vs not) following `particleFlow.test.ts:212-213`.

## References

- README: 20 visual modes, deterministic export, spectral-flux beat detection
- Docs: https://0langa.github.io/beatform/
