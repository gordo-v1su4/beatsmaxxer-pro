# Broad WebGPU + video sweep (2026-09-11)

**Why this doc exists:** Earlier research used **overly narrow** GitHits queries (e.g. *"WebGPU VJ clip launcher beat quantized crossfader browser"*). Those return nothing useful — not because the space is empty, but because the query is too specific.

**Better approach:** Separate, broad queries by **capability** (editing, live playback, VJ). UI framework (Svelte, React, vanilla TS) is irrelevant to WebGPU — what matters is decode path, compositor design, and shader pipeline.

**Method:** `githits example` from repo root via `scripts/githits.ps1`. One query per topic.

---

## Query results

### 1. `WebGPU video editing compositor browser`

**Hit:** Yes — [GitHits solution](https://app.githits.com/solutions/01a09219-1d4f-7455-aa7c-088db49b1796)

**Repos cited:**

| Repo | Pattern |
|------|---------|
| [WeftCut/WeftCut](https://github.com/WeftCut/WeftCut) | Desktop renderer `Compositor.ts` — layered timeline compositor |
| [yudgunH/XinChao-Cut](https://github.com/yudgunH/XinChao-Cut) | `gpu-compositor.ts` — preview engine |
| [zsiec/prism](https://github.com/zsiec/prism) | `webgpu-compositor.ts` — multi-source composite |

**Pattern:** `copyExternalImageToTexture` into owned `rgba8unorm` textures per layer; blend stacked quads with crop/rotation/opacity. Same family as **FreeCut** / browser NLE wave (MasterSelects, bluecaffe).

---

### 2. `WebGPU live video playback real-time effects`

**Hit:** Yes — [GitHits solution](https://app.githits.com/solutions/01a09219-1d4f-70e7-87d1-2ef84e3a51b3)

**Repos cited:**

| Repo | Pattern |
|------|---------|
| [SSFSKIM/designer](https://github.com/SSFSKIM/designer) | `renderer-webgpu/backdrop.ts` |
| [zsiec/prism](https://github.com/zsiec/prism) | compositor (again) |
| [yassinsolim/AetherVSR](https://github.com/yassinsolim/AetherVSR) | `pipeline.ts` — real-time pipeline |
| [habemus-papadum/pdum_rfb](https://github.com/habemus-papadum/pdum_rfb) | `webgpuFrameTexture.ts` |
| [EmNudge/grade](https://github.com/EmNudge/grade) | engine.ts |
| [wcandillon/react-native-webgpu](https://github.com/wcandillon/react-native-webgpu) | `importExternalTexture` tests |

**Pattern:** `texture_external` + `importExternalTexture` from `HTMLVideoElement`; `requestVideoFrameCallback` when available; per-frame bind groups; animated WGSL uniforms. **This is the same core path Beatsmaxxer uses** — framework-agnostic.

---

### 3. `WebGPU VJ shader video real-time` (no `--lang` filter)

**Hit:** Yes (synthesized demo) — [GitHits solution](https://app.githits.com/solutions/01a09219-b5f4-745e-ae26-2c0fd4d5f816)

**Note:** Quality threshold failed with `--lang typescript`; dropping language filter returned a camera+audio reactive shader demo. Weak primary repo citations — treat as **pattern only** (bass-driven WGSL, `copyExternalImageToTexture` path).

---

### 4. `WebGPU VJ visual performance shader video` (`--lang typescript`)

**Hit:** No (quality threshold). Try broader wording or no lang filter.

---

## Landscape takeaway (framework-neutral)

| Bucket | Active OSS signal | Stacks seen |
|--------|-------------------|-------------|
| **Browser NLE / editor** | FreeCut, WeftCut, XinChao-Cut, prism, bluecaffe, apssouza22/*, MasterSelects | React, vanilla TS, Svelte — **mixed** |
| **Live playback + FX** | webgpu-samples, ghost-arcade, apssouza22/webgpu-video-rendering, designer, AetherVSR | TS + WGSL |
| **VJ / performance** | ghost-arcade, beatform (WebGPU), OpenDrop (WebGL), fosfora (native wgpu) | Svelte, React, Rust |
| **Shader libraries** | webgpu-video-shaders, kbrandwijk | TS WGSL generators |

**WebGPU + video is not a empty niche.** The mistake was searching for Beatsmaxxer's exact product shape in one query.

---

## What is still rare (product-level, not stack-level)

Combinations that are **hard to find as one shipped OSS app** — but this is a **product** observation, not proof that WebGPU can't do it:

- Multi-slot **live** clip rack with per-slot WGSL catalog
- **Beat-quantized** program output switching
- Browser-static deploy + optional Tauri shell

Peers cover **pieces**: FreeCut (NLE compositor), Ghost Arcade (VJ launcher), beatform (beat-sync WebGPU), fosfora (native 8-layer VJ). None need to match SvelteKit to be relevant.

---

## Recommended GitHits queries (going forward)

Use **one capability per query**:

```powershell
.\scripts\githits.ps1 example "WebGPU video editing compositor browser"
.\scripts\githits.ps1 example "WebGPU live video playback real-time effects"
.\scripts\githits.ps1 example "WebGPU VJ shader video real-time"
.\scripts\githits.ps1 example "WebCodecs WebGPU VideoFrame compositor"
.\scripts\githits.ps1 search "importExternalTexture" --in "github:walterlow/freecut" --limit 8
```

**Avoid:** stacking product nouns (clip launcher + beat quantize + crossfader + browser + year).

---

*Prior narrow-query note in `githits-sweep-findings.md` superseded by this doc for landscape conclusions.*
