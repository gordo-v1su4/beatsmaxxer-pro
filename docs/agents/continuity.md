# Agent continuity — where to pick up

**Last updated:** 2026-09-07 (WebGPU sprint landed; arrangement deferred)  
**Read this first** when using Matt Pocock skills on this repo.

Also read root [`CONTEXT.md`](../../CONTEXT.md) for glossary, three-platform model, and product north star.

---

## Product north star

**Cable Guy–style plugins for video:** modular rack, instant visual feedback, beat-quantized PGM, effortless perform UX. Optimize for **zero-flash PGM cuts** first, then **preview/knob responsiveness**, then module preview delight.

**Render policy:** WebGPU/WGSL **only** at runtime — no WebGL fallback. `fxlab` WebGL2 + SwiftShader is CI/dev shader contact sheets only.

---

## Current sprint (confirmed)

**Forcing function:** Platform 2 — web rack (`bun run dev`). **Branch:** `main` for all engine work. **Tauri:** out of scope. **Mobile 1.1** (internal render scale): deferred.

**WebGPU Engine Sprint implement lane (V1S-59–61): shipped on `main`.** Next active lane TBD (Matt Pocock skills, splash V1S-64, or peer backlog tier 1).

### Sequence (completed)

1. **Research day** — 7 clones (FreeCut, Beatform, Spektral, webgpu-video-shaders, etc.)
2. **Arm-at-trim + rVFC** — `VideoPool` (Ghost pattern, AGPL clean-room)
3. **Bind group frequency split** — `BindGroupCache.ts`
4. **`wgslLib` + golden tests**

### Arm-at-trim acceptance

- Unit test on `VideoPool` arm/await contract (no GPU in CI)
- QA autoload: beat-quantized PGM switch without stale frame on `qa-clip.webm`

### Tickets

One GitHub issue for arm-at-trim before or during implementation; skip over-ticketing bind groups until research day completes.

### AGPL

Read Ghost Arcade for ideas; implement clean-room — no pasted or close-paraphrased store code.

---

## Research scope (7 clones)

```powershell
.\research\webgpu-peers\clone-peers.ps1
```

| # | Clone dir | Repo | Research focus |
|---|-----------|------|----------------|
| 1 | `beatform` | 0langa/beatform | `wgslLib`, `FixedFeedbackClock`, pipeline cache |
| 2 | `ghost-arcade` | riskcapital/ghost-arcade | arm-at-trim, rVFC, capability probe (AGPL — patterns only) |
| 3 | `freecut` | walterlow/freecut | dual texture path, `destRect`, blit |
| 4 | `webgpu-video-rendering` | apssouza22/webgpu-video-rendering | external → owned copy, multi-pass |
| 5 | `webgpu-samples` | webgpu/webgpu-samples | `videoUploading`, timestamp queries |
| 6 | `spektral` | kaltwrk/spektral | pipeline cache, dynamic WGSL |
| 7 | `webgpu-video-shaders` | kbrandwijk/webgpu-video-shaders | deband/color WGSL donors |

**Research horizon (track, don't all ship now):** bind groups, owned-texture multi-pass, timestamp queries, pipeline cache; GPU compute / ML (ONNX/WebNN) as future lane; subgroup/wave ops skip unless profiling changes.

**Near-term ship path:** WGSL modules you control + Essentia/Web Audio — not GPU ML inference yet.

---

## Done (do not redo)

- [x] GitHits 24-query sweep — `githits-sweep-findings.md`
- [x] `research/webgpu-peers/` layout, clone scripts, analysis template
- [x] `PLATFORMS.md`, `DESKTOP-WINDOWS-RESEARCH.md`
- [x] Ghost Arcade dissection — `analyses/ghost-arcade.md`
- [x] Matt Pocock skills setup — `docs/agents/*`, `AGENTS.md`
- [x] Landscape charts — `docs/webgpu-av-landscape.html`, `webgpu-peers-deep-dive.html`
- [x] `/grill-me` — sprint order, WebGPU-only policy, 7-clone research scope
- [x] Research day (V1S-55–58) — `analyses/freecut.md`, `beatform.md`, `spektral.md`, `webgpu-video-shaders.md` (file:line citations + Beatsmaxxer mapping)
- [x] Ghost Arcade dissection (V1S-62, pre-sprint) — `analyses/ghost-arcade.md` (arm-at-trim, rVFC; feeds V1S-59)
- [x] V1S-59 arm-at-trim + rVFC — `VideoPool.ts` + tests
- [x] V1S-60 bind group cache — `BindGroupCache.ts` + `WebGpuEngine.ts`
- [x] V1S-61 `wgslLib` + golden shader tests
- [x] PGM cut-cover / seek-gap fixes — `VideoTextureCache`, `AppLoop`

---

## Backlog (explicitly deferred — do not start)

| Linear | Topic | Notes |
|--------|-------|-------|
| [V1S-64](https://linear.app/v1su4/issue/V1S-64) | Splash screen | Min duration on revisit (~5–6s), better animation |

**Arrangement seeding (V1S-63, shipped):** After `/analyze/rhythm` lands, background `/analyze/structure` seeds arrangement strips (bar-snapped, label-colored). Perform page unchanged; ARRANGE shows “Detecting sections…” while loading.

**Research donors (do not re-run):** FreeCut bind cache; Beatform `wgslLib`; Spektral pipeline cache (research only); `webgpu-video-shaders` is **LGPL** — future catalog only.

**Out of scope until pulled:** Tauri 60fps profiling, mobile internal render scale (1.1), arrangement lane, Essentia structure seeding.

---

## Repo map

```text
svelte/          ← app (engine + rack + MobileShell)
desktop/         ← Tauri shell only — not this sprint
research/webgpu-peers/
  analyses/      ← committed write-ups
  repos/         ← gitignored — clone-peers.ps1
```

---

## Skill routing

| Goal | Skill | Start from |
|------|-------|------------|
| Clone + deepen peer analyses | `/research` | This file + `repos/` |
| Implement arm-at-trim | `/implement` + `/tdd` | `analyses/ghost-arcade.md`, acceptance above |
| GitHub issue for arm-at-trim | `/to-tickets` | Acceptance section above |
| Domain / ADRs | `/grill-with-docs` | `CONTEXT.md` |

---

## Linear sprint board

**Project:** [Beatsmaxxer Pro](https://linear.app/v1su4/project/beatsmaxxer-pro-69c62284afc0)  
**Milestone:** WebGPU Engine Sprint — V1S-55 through V1S-62 (research) + V1S-59–61 (implement)

See [`linear.md`](./linear.md) for the full issue table and blocker chain.

---

## Hosted Essentia analysis

Rhythm/structure analysis uses the **hosted** `essentia-endpoint` service on VM100 `app-vm` — not local Docker and not in-browser Essentia.

| Item | Value |
|------|--------|
| **Public URL** | `https://essentia.v1su4.dev` |
| **Client env** | `ESSENTIA_API_BASE_URL=https://essentia.v1su4.dev`, `ESSENTIA_API_KEY` (server-side proxy only) |
| **Service repo** | `essentia-endpoint` (sibling) |
| **Client routes** | `POST /__api/analyze/studio/jobs` + `GET /__api/analyze/studio/jobs/{id}` (full MP3, GPU allin1 structure) |

Deploy runbook: `essentia-endpoint/docs/DOCKHAND.md`. Queue/GPU details: `essentia-endpoint/docs/STUDIO_AUDIO_JOBS.md`.

---

## Commands

```bash
bun run dev              # web rack — :5174 (validation target)
bun run test             # vitest

.\research\webgpu-peers\clone-peers.ps1
.\scripts\githits.ps1 example "..." -l typescript
```
