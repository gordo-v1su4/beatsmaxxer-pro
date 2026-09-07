# WebGPU peer research — status (2026-09-06)

**Agents:** Read [`docs/agents/continuity.md`](../../docs/agents/continuity.md) and root [`CONTEXT.md`](../../CONTEXT.md) before continuing this lane.

**Question:** What public WebGPU + AV peers exist, what can Beatsmaxxer steal, and how does this research live in the repo?

**Methods:** GitHits `get_example` / `search` (24-query sweep + follow-up), shallow clones, per-repo `analyses/`. Primary sources: peer source files and official WebGPU samples — not blog summaries alone.

---

## Where this research lives

| Path | Role | `git push`? |
|------|------|-------------|
| `research/webgpu-peers/` | All research artifacts on `main` | Only files you **`git add` + commit** |
| `research/webgpu-peers/repos/` | Shallow peer clones for local grep | **No** — `.gitignore`, local-only by design |
| `research/webgpu-peers/analyses/` | Per-repo write-ups | Yes, when committed |
| `githits-sweep-*.txt` | Regeneratable sweep logs | **No** — gitignored |

Clones are disposable; **ship knowledge via markdown**, not vendored trees.

---

## Conclusion (unchanged after follow-up sweep)

**Beatsmaxxer’s combo remains unique in public OSS:** SvelteKit 5 + WebGPU-only + 8-slot live clip rack + beat-quantized PGM + browser static build.

GitHits follow-up query *"WebGPU VJ clip launcher beat quantized crossfader browser 2025 2026"* returned **no quality hits** — same signal as the Sep 2026 sweep (“no example for 8-slot + PGM”).

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

### Cross-project — still no PGM+racks peer

GitHits `get_example`: *"WebGPU VJ clip launcher beat quantized crossfader browser 2025 2026"* → **no results** ([solution](https://app.githits.com/solutions/01a07972-9f3b-77d4-8a9d-40d47c78ddf7)).

---

## What to read next

| Doc | Use |
|-----|-----|
| [`README.md`](./README.md) | Layout, clone commands, GitHits wrapper |
| [`githits-sweep-findings.md`](./githits-sweep-findings.md) | Full 24-query sweep + pattern confirmations |
| [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md) | Tiered tasks (mobile vs desktop) |
| [`webgpu-peers-deep-dive.html`](./webgpu-peers-deep-dive.html) | Phone-friendly synthesis |
| [`analyses/`](./analyses/) | Per-repo dissections |
| [`../../docs/webgpu-av-landscape.html`](../../docs/webgpu-av-landscape.html) | High-level landscape chart |

---

## Local commands

```powershell
# Clone peers (local only)
.\research\webgpu-peers\clone-peers.ps1

# GitHits from repo root
.\scripts\githits.ps1 example "WebGPU importExternalTexture" -l typescript

# Commit research notes (not repos/)
git add research/webgpu-peers/
git status   # repos/ must not appear
```

---

## Decisions (2026-09-07 `/grill-me`)

Settled in [`docs/agents/continuity.md`](../../docs/agents/continuity.md):

1. **WebGPU/WGSL only** at runtime — no WebGL fallback.
2. **Sprint:** research day (7 clones) → arm-at-trim → bind groups → wgslLib.
3. **Forcing function:** web rack on `main`; Tauri and mobile 1.1 deferred.
4. **Clones #6–7:** spektral + webgpu-video-shaders added to `clone-peers.ps1`.
5. **Product:** Cable Guy–style video plugins — zero-flash PGM cuts first.

## Open questions (remaining)

- [ ] Enable `renderBudget` by default on mobile after 1.1 — scale steps on iPhone vs budget Android?
- [ ] Background tab GPU device loss on iOS — extend `sequencer-resume` coverage?
