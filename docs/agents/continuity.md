# Agent continuity — where to pick up

**Last updated:** 2026-09-07 (post `/grill-me` session)  
**Read this first** when using Matt Pocock skills on this repo.

Also read root [`CONTEXT.md`](../../CONTEXT.md) for glossary, three-platform model, and product north star.

---

## Product north star

**Cable Guy–style plugins for video:** modular rack, instant visual feedback, beat-quantized PGM, effortless perform UX. Optimize for **zero-flash PGM cuts** first, then **preview/knob responsiveness**, then module preview delight.

**Render policy:** WebGPU/WGSL **only** at runtime — no WebGL fallback. `fxlab` WebGL2 + SwiftShader is CI/dev shader contact sheets only.

---

## Current sprint (confirmed)

**Forcing function:** Platform 2 — web rack (`bun run dev`). **Branch:** `main` for all engine work. **Tauri:** out of scope this sprint. **Mobile 1.1** (internal render scale): deferred.

### Sequence

1. **Research day** — deepen analyses for **7 clones** (FreeCut + Beatform first; then spektral + kbrandwijk)
2. **Arm-at-trim + rVFC** — Ghost pattern, AGPL clean-room (`VideoPool` / `PgmDirector`)
3. **Bind group frequency split** (1.2)
4. **`wgslLib` + golden tests** (1.3)

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

---

## Not done — next actions

| Priority | Task | Output | Linear |
|----------|------|--------|--------|
| 1 | Implement arm-at-trim + rVFC | `VideoPool.ts`, possibly `PgmDirector.ts` + tests | V1S-59 |
| 2 | Bind groups (1.2) — donors: FreeCut + Spektral | `WebGpuEngine.ts` | V1S-60 |
| 3 | wgslLib (1.3) — donor: Beatform | `shaders/wgslLib.ts` + golden tests | V1S-61 |

**Research donors (do not re-run):** FreeCut/V1S-60 bind cache; Beatform/V1S-61 `wgslLib` + golden tests; Spektral/V1S-60 `compute-bindgroup-cache.ts`; `webgpu-video-shaders` is **LGPL** — future catalog only.

**Out of scope this sprint:** Tauri 60fps profiling, mobile internal render scale (1.1), spektral/kbrandwijk **implementation** (research only).

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

Rhythm/structure analysis uses the **hosted** `essentia-endpoint` service (not local Essentia in the browser).

| Item | Value |
|------|--------|
| **Public URL** | `https://essentia.v1su4.dev` |
| **Host** | VM100 **`app-vm`** (Proxmox homelab), Dockhand-managed |
| **Service repo** | `essentia-endpoint` (sibling) |
| **Client env** | `ESSENTIA_API_BASE_URL`, `ESSENTIA_API_KEY` (server-side proxy only) |

**Infra lookup order:** Hermes notebook vault (Obsidian) → **`proxmox-home`** repo (`docs/endpoint-index.md`, `docs/app-vm-dockhand-runbook.md`) → BWS for secret values.

Deploy runbook: `essentia-endpoint/docs/DOCKHAND.md`.

---

## Commands

```bash
bun run dev              # web rack — :5174 (validation target)
bun run test             # vitest

.\research\webgpu-peers\clone-peers.ps1
.\scripts\githits.ps1 example "..." -l typescript
```
