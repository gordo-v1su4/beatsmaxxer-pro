# WebGPU peer research — implementation backlog

**Status:** Ready to implement in short sprints · **Research date:** 2026-09-06  
**Platforms:** See **[`PLATFORMS.md`](./PLATFORMS.md)** — Desktop Windows app · Web app · Mobile Chrome  
**Sources:** GitHits sweep, clones, [`githits-sweep-findings.md`](./githits-sweep-findings.md), [`analyses/`](./analyses/)

**Tools:** `.\scripts\githits.ps1` · clones in `repos/` (gitignored) · `.\research\webgpu-peers\clone-peers.ps1`

---

## Executive summary

One Svelte build, **three surfaces** ([`PLATFORMS.md`](./PLATFORMS.md)):

| # | Surface | Shell | Canvases |
|---|---------|-------|----------|
| 1 | **Desktop Windows app** (Tauri) | Full rack | 11 · 60fps previews · `interactive` audio |
| 2 | **Web app** (desktop browser) | Full rack | 11 · 30fps previews · `interactive` audio |
| 3 | **Mobile web** (Chrome on phone) | `MobileShell` | **1** · `playback` audio · lifecycle critical |

Peer research on NLE/VJ/8-slot patterns mainly helps **1 + 2**. Mobile Chrome has a **separate lane**: [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md).

---

## Three platforms — what research applies where

> **Platform map:** [`PLATFORMS.md`](./PLATFORMS.md) · **Mobile Chrome lane:** [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md)

| Finding | Win app (1) | Web app (2) | Mobile Chrome (3) | Notes |
|---------|:-----------:|:-----------:|:-----------------:|-------|
| **Internal render scale** (no canvas resize) | Low | Low | **Critical** | `renderBudget.ts`; `?budget=1` causes black frames today |
| Async WebGPU probe (no flash) | Nice | Nice | **High** | `MobileStage.svelte` + `capabilities` store |
| Device-loss re-attach | High | High | **High** | `WebGpuCanvas`; optional retry UI |
| `requestVideoFrameCallback` | Medium | Medium | **High** | One decode lane on phone |
| Bind group frequency split | **High** | **High** | Low | 8 previews on 1+2; Tauri @ 60fps |
| `destRect` slot aspect-fit | **High** | **High** | Low | PGM full-frame on 3 |
| `wgslLib.ts` + golden tests | Shared | Shared | Shared | Same uber-shader |
| `FixedFeedbackClock` | Shared | Shared | Shared | QA + export |
| Timestamp-query profiling | Shared | Shared | **High** | Phone thermal diagnosis |
| MasterSelects HTMLVideo pitfalls | Medium | Medium | **High** | Safari / mobile GPU |
| FreeCut dual texture path | Shared | Shared | Shared | Same import path |
| ISF / user shaders | Future | Future | Future | AGPL clean-room |
| 8-slot grid import pattern | Validates | Validates | N/A | Mobile = 1 slot |
| Ghost Arcade VideoFrame output | Multi-monitor | Multi-monitor | N/A | Electron output windows |
| Ableton transport compare | Shared | Shared | Shared | PGM beat quantize |

**Bottom line for mobile Chrome (3):** The highest-value item is not in peer repos — internal PGM scale without canvas resize (`renderBudget.ts`). Peer patterns (rVFC, device loss, Safari pitfalls) support that work.

---

## Tier 1 — implement soon

### 1.1 Internal PGM render scale (mobile-first)

**Problem:** `renderScale` resizes `canvas.width` → clears canvas, re-attach, feedback texture rebuild → black frame + trail reset. Governor is **off** except `?budget=1`.

**Approach (from in-tree comment + FreeCut blit pattern):**
- Keep swapchain / canvas backing store stable on orientation + budget changes
- Render FX + feedback at `width * scale`, `height * scale`
- Blit upscale to canvas (premultiplied alpha blit like FreeCut)

**Files:** `WebGpuEngine.ts`, `WebGpuCanvas.svelte` (PGM path), `renderBudget.ts`, tests in `render-budget.test.ts`

**Peers:** FreeCut premultiply blit · webgpu-video-rendering output pass

**Acceptance:** Enable budget on mobile without black frame; trail modules (STUTTER/HOLD) survive scale steps

---

### 1.2 Bind group frequency split (desktop-first, shared engine)

**Problem:** Monolithic bind group rebuilt per canvas per frame (uniform + feedback + external + sampler).

**Approach (Toji / Babylon `webgpuCacheBindGroups`):**
- Group 0: uniforms + feedback view + external (volatile)
- Group 1: sampler + static bindings (cached per pipeline)

**Files:** `WebGpuEngine.ts` · `shaders/moduleFx.wgsl.ts` (layout only if needed)

**Peers:** [toji.dev bind-groups](https://toji.dev/webgpu-best-practices/bind-groups) · Babylon `webgpuCacheBindGroups.ts`

**Acceptance:** Same pixels; fewer bind group entries on 8-preview frames; no cross-task external cache

---

### 1.3 `wgslLib.ts` extraction + golden snapshots

**Problem:** Monolithic `moduleFx.wgsl.ts` hard to diff and reuse.

**Approach:** Extract tonemap, feedback sample, beat pulse snippets; golden WGSL tests (Beatform pattern).

**Files:** new `shaders/wgslLib.ts` · `moduleFx.wgsl.ts` · `tests/unit/rendering/` golden files

**Peers:** Beatform `wgslLib.ts` + `*.test.ts` shader asserts

**Acceptance:** Zero visual change in QA autoload hash gates

---

### 1.4 `requestVideoFrameCallback` where not audio-locked

**Problem:** Blind rAF may import external texture when video frame unchanged.

**Approach:** Opt-in rVFC on `VideoPool` / slot when not driven by audio fixed-step; fall back to rAF.

**Files:** `VideoPool.ts` or `AppLoop` video tick · `WebGpuEngine` unchanged import site

**Peers:** webgpu-samples `videoUploading/main.ts:254` · GitHits Svelte video example

**Acceptance:** Mobile + desktop; no regression when rVFC unavailable

---

### 1.5 Async WebGPU capability probe (mobile UI)

**Problem:** `MobileStage` treats `renderer === 'checking'` as loading but `webgpu === false` can flash wrong states.

**Approach:** Reactive store that updates UI when probe completes (Ghost Arcade `webgpuCapability.ts` pattern).

**Files:** `stores/capabilities.ts` · `MobileStage.svelte` · possibly `NoGpuPanel.svelte`

**Peers:** ghost-arcade `webgpuCapability.ts`

**Acceptance:** No spurious no-GPU panel on cold load; desktop gate unchanged

---

## Tier 2 — QA, determinism, perf visibility

### 2.1 `FixedFeedbackClock` port

Align feedback age with `timeline.fixedStepIndex` for export/QA determinism.

**Files:** new `feedbackClock.ts` · integrate with `feedback.ts` / `advanceFeedbackTo` · Beatform tests as reference

**Peers:** Beatform `fixedFeedback.ts`

---

### 2.2 Timestamp queries behind QA flag

Per-pass FX vs blit timing on slow phones.

**Files:** `WebGpuEngine.ts` · optional `TimestampQueryManager.ts` (from webgpu-samples) · wire `__BMX_QA__` or `?qa=1`

**Peers:** webgpu-samples `sample/timestampQuery/`

---

### 2.3 Compare PGM quantize vs Ableton transport

Audit only — no rewrite unless gaps found.

**Files:** `PgmDirector.ts` · `TransportClock.ts` · read Ableton `transport.ts`

**Output:** Short note in this doc or `svelte/docs/` if behavior differs

---

### 2.4 MasterSelects mobile Safari checklist

Read cloned/docs peer research for HTMLVideo + WebGPU edge cases; add to mobile QA runbook.

**Peers:** Sportinger/MasterSelects `consensus-B-pitfalls.md`

---

## Tier 3 — future / optional

| Item | When | Peers |
|------|------|-------|
| `ExternalCopyPipeline` for multi-pass on live external | New module needs >1 sample pass | apssouza22 |
| FreeCut `destRect` import pass | Mixed aspect 8-slot rack | FreeCut |
| kbrandwijk deband/color WGSL | New catalog modules | webgpu-video-shaders |
| ISF uniform parser (clean-room) | User shader slots | Ghost Arcade (AGPL — patterns only) |
| spektral pipeline cache | Per-user WGSL modules | spektral |
| Render bundles for stable blit | Profiling shows blit bound | webgpu-samples |
| WebCodecs + Mediabunny frame path | HTMLVideo latency limiting | FreeCut, localcut |

---

## Explicitly skip

- React / Three.js / Threlte re-architecture
- C++/WASM compositor (OpenCut Rust path) unless offline export becomes a goal
- Copying Ghost Arcade code (AGPL)
- Subgroups / multi-draw indirect (no win for fullscreen quads)
- Desktop rack reflow for phone (keep `MobileShell` sibling tree)

---

## Cloned repos — quick reference

| Repo | Clone | Analysis |
|------|-------|----------|
| beatform | `repos/beatform` | [analyses/beatform.md](./analyses/beatform.md) |
| ghost-arcade | `repos/ghost-arcade` | [analyses/ghost-arcade.md](./analyses/ghost-arcade.md) |
| freecut | `repos/freecut` | [analyses/freecut.md](./analyses/freecut.md) |
| webgpu-video-rendering | `repos/webgpu-video-rendering` | [analyses/webgpu-video-rendering.md](./analyses/webgpu-video-rendering.md) |
| webgpu-samples | `repos/webgpu-samples` | [analyses/webgpu-samples.md](./analyses/webgpu-samples.md) |
| spektral | `repos/spektral` | [analyses/spektral.md](./analyses/spektral.md) (research) |
| webgpu-video-shaders | `repos/webgpu-video-shaders` | [analyses/webgpu-video-shaders.md](./analyses/webgpu-video-shaders.md) (research) |

Refresh: `.\research\webgpu-peers\clone-peers.ps1 -Refresh`

---

## Suggested sprint order

### Mobile Chrome first (platform 3)

1. **1.1** Internal render scale (unblocks adaptive budget)
2. **1.5** Capability probe UX
3. **1.4** rVFC on single slot
4. **2.2** Timestamp QA on real device
5. **2.4** Safari pitfall checklist

### Full rack first (platforms 1 + 2)

1. **1.2** Bind groups · **1.3** wgslLib · **1.4** rVFC
2. **2.1** FixedFeedbackClock
3. **1.1** internal scale (still needed before enabling mobile budget by default)

Tauri (1) gains extra from **1.2** at 60fps previews; web (2) at 30fps.

---

## Open questions (for further investigation)

- [ ] Enable `renderBudget` by default on mobile after 1.1 — what scale steps feel right on iPhone vs budget Android?
- [ ] Does mobile session need beat-quantized module paging, or is instant swap correct for perform UX?
- [ ] Background/foreground: `sequencer-resume.test.ts` covers transport — GPU device loss on iOS background tab?
- [ ] Should mobile mount `IntersectionObserver` on stage canvas (always visible) or skip entirely?
- [ ] Essentia hosted vs WASM on phone network — latency tradeoff for beat grid?
- [ ] Tauri Windows app: which Tier 1 items differ from web (preview 60fps, Rust Essentia only)?

---

## Related docs

| Doc | Purpose |
|-----|---------|
| **[PLATFORMS.md](./PLATFORMS.md)** | **Three surfaces map** |
| [MOBILE-BROWSER-RESEARCH.md](./MOBILE-BROWSER-RESEARCH.md) | Platform 3 Chrome lane |
| [githits-sweep-findings.md](./githits-sweep-findings.md) | Full GitHits sweep |
| [webgpu-peers-deep-dive.html](./webgpu-peers-deep-dive.html) | Phone-friendly overview |
| [analyses/svelte-peers.md](./analyses/svelte-peers.md) | Svelte 5 lifecycle vs our split |
| [svelte/docs/ARCHITECTURE.md](../../svelte/docs/ARCHITECTURE.md) | Runtime ownership |
| `svelte/src/lib/mobile/mobileEnv.ts` | Mobile vs desktop shell decision |
| `svelte/src/lib/runtime/renderBudget.ts` | Mobile PGM governor (opt-in) |

---

## GitHits rerun

```powershell
.\scripts\githits.ps1 example "your query" -l typescript
.\scripts\githits.ps1 search "pattern" "--in" "github:owner/repo" "--limit" "8"
```
