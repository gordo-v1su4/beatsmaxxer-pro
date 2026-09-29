# WebGPU peer research — status (2026-09-11)

**Agents:** Product sprint state — [`../beatsmaxxer-pro/docs/agents/continuity.md`](../../../docs/agents/continuity.md) and [`../beatsmaxxer-pro/CONTEXT.md`](../../../CONTEXT.md).

**Question:** What public WebGPU + AV peers exist, what can Beatsmaxxer steal, and how does this research live in the repo?

**Methods:** GitHits `get_example` / `search` (24-query sweep + follow-up), shallow clones, per-repo `analyses/`. Primary sources: peer source files and official WebGPU samples — not blog summaries alone.

---

## Where this research lives

| Path | Role | `git push`? |
|------|------|-------------|
| `webgpu-peers/` | All research artifacts on `main` | Only files you **`git add` + commit** |
| `webgpu-peers/repos/` | Shallow peer clones for local grep | **No** — `.gitignore`, local-only by design |
| `webgpu-peers/analyses/` | Per-repo write-ups | Yes, when committed |
| `githits-sweep-*.txt` | Regeneratable sweep logs | **No** — gitignored |

Clones are disposable; **ship knowledge via markdown**, not vendored trees.

---

## Conclusion (revised 2026-09-11 — broad video sweep)

**WebGPU + video is a real, growing OSS space.** UI framework does not matter — TypeScript/JavaScript + WGSL + `importExternalTexture` / WebCodecs shows up in React, Svelte, and vanilla projects alike.

Broad GitHits queries (one topic each) return useful peers:

| Query | Result |
|-------|--------|
| *WebGPU video editing compositor browser* | WeftCut, XinChao-Cut, prism (+ FreeCut family) |
| *WebGPU live video playback real-time effects* | designer, AetherVSR, prism, grade, RN-webgpu tests |
| *WebGPU VJ shader video real-time* | Pattern hit (camera + audio-reactive WGSL) |

Full write-up: [`broad-video-sweep-2026.md`](./broad-video-sweep-2026.md).

**Do not use** ultra-specific queries like *"WebGPU VJ clip launcher beat quantized crossfader browser"* as evidence the field is empty — that query is too narrow by design.

**Beatsmaxxer-specific (product, not stack):** The combination of **eight live clip slots + beat-quantized PGM + fixed WGSL module catalog** is still uncommon as one shipped OSS app. Peers cover **slices** of that (FreeCut = NLE compositor, Ghost Arcade = VJ launcher, beatform = beat-sync WebGPU, fosfora = native layers). That is a product-gap statement, not “WebGPU only works with SvelteKit.”

### Closest product peers

| Rank | Repo | License | Steal |
|------|------|---------|-------|
| 1 | [walterlow/freecut](https://github.com/walterlow/freecut) | MIT | Dual texture path, effect registry, `destRect` blit, Mediabunny |
| 2 | [0langa/beatform](https://github.com/0langa/beatform) | MIT | `FixedFeedbackClock`, pipeline cache, deterministic export |
| 3 | [riskcapital/ghost-arcade](https://github.com/riskcapital/ghost-arcade) | AGPL | `videoFrameBridge`, ISF catalog UX, VJ clip launcher + rVFC |
| 4 | [webgpu/webgpu-samples](https://github.com/webgpu/webgpu-samples) | BSD-3 | `videoUploading`, timestamp queries |
| 5 | [apssouza22/webgpu-video-rendering](https://github.com/apssouza22/webgpu-video-rendering) | — | external → owned copy before multi-pass |

Full ranked table: [`githits-sweep-findings.md`](./githits-sweep-findings.md).

---

## New follow-up citations (this session)

### Ghost Arcade — VJ clip launcher + frame pacing

GitHits search on `github:riskcapital/ghost-arcade` confirms production patterns aligned with our PGM/rack work:

| File | What it does | Source |
|------|----------------|--------|
| `src/lib/stores/vjClipLauncher.ts:751` | `waitForPresentedVideoFrame` — `requestVideoFrameCallback` with rAF fallback | [ghost-arcade](https://github.com/riskcapital/ghost-arcade/blob/94277ce0/src/lib/stores/vjClipLauncher.ts) |
| `src/lib/utils/videoFrameBridge.ts:168` | `importExternalTexture({ source: videoFrame })` wrapper with open-frame registry | [ghost-arcade](https://github.com/riskcapital/ghost-arcade/blob/94277ce0/src/lib/utils/videoFrameBridge.ts) |
| `docs/WEBGPU_MIGRATION.md:8` | Zero-copy output via GpuMemoryBuffer `VideoFrame` + MessageChannel (~155µs @ 1080p cited) | [ghost-arcade](https://github.com/riskcapital/ghost-arcade/blob/94277ce0/docs/WEBGPU_MIGRATION.md) |

**Beatsmaxxer takeaway:** Ghost Arcade is the closest **Svelte + VJ launcher** peer (AGPL — study patterns, clean-room port). Our `PgmDirector` beat quantize is the differentiator; steal **rVFC wait** and **bind-group frequency split** (Tier 1 in backlog), not ISF wholesale.

### Broad sweep (2026-09-11) — editing + live + VJ

See [`broad-video-sweep-2026.md`](./broad-video-sweep-2026.md). New repos to watch beyond the original five clones: **WeftCut**, **XinChao-Cut**, **prism**, **AetherVSR**, **SSFSKIM/designer**.

---

## What to read next

| Doc | Use |
|-----|-----|
| [`README.md`](./README.md) | Layout, clone commands, GitHits wrapper |
| [`githits-sweep-findings.md`](./githits-sweep-findings.md) | Original 24-query sweep + pattern confirmations |
| [`broad-video-sweep-2026.md`](./broad-video-sweep-2026.md) | **Broad** WebGPU video / live / VJ queries (use this for landscape) |
| [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md) | Tiered tasks (mobile vs desktop) |
| [`webgpu-peers-deep-dive.html`](./webgpu-peers-deep-dive.html) | Phone-friendly synthesis |
| [`analyses/`](./analyses/) | Per-repo dissections |
| [`webgpu-av-landscape.html`](./webgpu-av-landscape.html) | High-level landscape chart |
| [`applied-patterns.md`](./applied-patterns.md) | GitHits pattern library (VJ FX, beat sync) |
| [`../desktop-native/SUMMARY.md`](https://github.com/gordo-v1su4/webgpu-research/tree/main/desktop-native/SUMMARY.md) | Native Rust/C++/C# lane — does anything beat in-tree WebGPU? |
| [`../desktop-native/experimental/`](https://github.com/gordo-v1su4/webgpu-research/tree/main/desktop-native/experimental/) | Low-star + Reddit deep pass (fosfora, flux-fidelity, SpoutBrowser, …) |
| [`../desktop-native/experimental/githits-findings-2026.md`](https://github.com/gordo-v1su4/webgpu-research/tree/main/desktop-native/experimental/githits-findings-2026.md) | Cross-lane GitHits session — browser queries in [`broad-video-sweep-2026.md`](./broad-video-sweep-2026.md), native in per-stack docs |

---

## Local commands

```powershell
# Clone peers (local only)
.\research\webgpu-peers\clone-peers.ps1

# GitHits from repo root
.\scripts\githits.ps1 example "WebGPU importExternalTexture" -l typescript

# Commit research notes (not repos/)
git add webgpu-peers/
git status   # repos/ must not appear
```

---

## Decisions (2026-09-07 `/grill-me`)

Settled in [`../beatsmaxxer-pro/docs/agents/continuity.md`](../../../docs/agents/continuity.md):

1. **WebGPU/WGSL only** at runtime — no WebGL fallback.
2. **Sprint:** research day (7 clones) → arm-at-trim → bind groups → wgslLib.
3. **Forcing function:** web rack on `main`; Tauri and mobile 1.1 deferred.
4. **Clones #6–7:** spektral + webgpu-video-shaders added to `clone-peers.ps1`.
5. **Product:** Cable Guy–style video plugins — zero-flash PGM cuts first.

## Open questions (remaining)

- [ ] Enable `renderBudget` by default on mobile after 1.1 — scale steps on iPhone vs budget Android?
- [ ] Background tab GPU device loss on iOS — extend `sequencer-resume` coverage?
