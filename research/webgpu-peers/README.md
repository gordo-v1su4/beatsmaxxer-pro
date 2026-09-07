# WebGPU peer research — Beatsmaxxer Pro

**Agents:** Start from [`docs/agents/continuity.md`](../../docs/agents/continuity.md) (done / not-done / skill routing) and [`CONTEXT.md`](../../CONTEXT.md) (glossary).

Local clones and analysis for **three platforms** sharing one WebGPU engine:

| Platform | Doc |
|----------|-----|
| **1. Desktop Windows app** (Tauri) | [`DESKTOP-WINDOWS-RESEARCH.md`](./DESKTOP-WINDOWS-RESEARCH.md) |
| **2. Web app** (desktop browser) | [`PLATFORMS.md`](./PLATFORMS.md) · shared rack backlog |
| **3. Mobile web** (Chrome phone) | [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) |

Stack: **SvelteKit 5 + WebGPU-only**, eight-slot rack (desktop), beat-quantized PGM, Essentia / Web Audio.

## Layout

| Path | Purpose |
|------|---------|
| **`PLATFORMS.md`** | Three surfaces overview |
| **`DESKTOP-WINDOWS-RESEARCH.md`** | **Platform 1 — Tauri/WebView2 (Rust shell, TS/WebGPU engine)** |
| **`MOBILE-BROWSER-RESEARCH.md`** | Platform 3 — Chrome on phone |
| `repos/` | Shallow git clones (**gitignored** — run clone script locally) |
| `template/ANALYSIS.md` | Per-repo analysis template |
| `analyses/` | Filled analyses (committed) — incl. [`svelte-peers.md`](./analyses/svelte-peers.md) |
| `webgpu-peers-deep-dive.html` | Phone-friendly synthesis + recommendations |
| [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) | **Separate lane: phone via Chrome/mobile web (not native app)** |
| **`IMPLEMENTATION-BACKLOG.md`** | **Tiered tasks to implement — mobile vs desktop split** |
| `githits-sweep-findings.md` | Full GitHits sweep summary |
| `webgpu-peers-deep-dive.svg` | Static landscape chart |
| `clone-peers.ps1` / `clone-peers.sh` | Clone or refresh all peer repos |

## Clone policy

**`repos/` is listed in the root `.gitignore`.** Clones are for local grep and diff only; do not commit vendored trees. Analysis write-ups in `analyses/` capture what we learned.

## Committed vs local (read this before `git push`)

| What | On disk | In `git push`? |
|------|---------|----------------|
| `analyses/*.md`, `README.md`, `IMPLEMENTATION-BACKLOG.md`, HTML/SVG, clone scripts | `research/webgpu-peers/` | **Only after** `git add` + `git commit` on `main` |
| Shallow clones under `repos/` | `research/webgpu-peers/repos/` | **Never** — gitignored, local-only by design |
| Regeneratable GitHits sweep logs | `githits-sweep-*.txt` | **Never** — gitignored |

Research **lives on your machine** under `research/webgpu-peers/` on `main`, but **`git push` does not include new work** until you add and commit the markdown/HTML/scripts you want to share. Cloned peer repos stay local for grep and perf experiments; ship learnings via `analyses/` and backlog docs, not vendored trees.

**Typical workflow:**

```powershell
# 1. Clone peers locally (not tracked)
.\research\webgpu-peers\clone-peers.ps1

# 2. Write or refresh analyses (tracked when committed)
#    analyses/beatform.md, githits-sweep-findings.md, etc.

# 3. Commit only the notes — not repos/
git add research/webgpu-peers/analyses research/webgpu-peers/*.md research/webgpu-peers/*.html
git status   # confirm repos/ does NOT appear
git commit -m "docs: update WebGPU peer research"
git push
```

See also [`RESEARCH-STATUS.md`](./RESEARCH-STATUS.md) for the latest session summary and GitHits citations.

## Selected peers (2026-09)

| Priority | Repo | Why clone |
|----------|------|-----------|
| 1 | [0langa/beatform](https://github.com/0langa/beatform) | Beat-sync WebGPU VJ, preset pipeline cache, fixed feedback clock, deterministic export |
| 2 | [riskcapital/ghost-arcade](https://github.com/riskcapital/ghost-arcade) | Browser VJ, 200+ effects, `importExternalTexture` output, MIDI |
| 3 | [walterlow/freecut](https://github.com/walterlow/freecut) | WebGPU NLE compositor, GPU effects registry, Mediabunny, dual texture path |
| 4 | [apssouza22/webgpu-video-rendering](https://github.com/apssouza22/webgpu-video-rendering) | Small focused WebCodecs → WebGPU → multi-pass FX demo |
| 5 | [webgpu/webgpu-samples](https://github.com/webgpu/webgpu-samples) | Canonical `videoUploading`, ping-pong compute, timestamp queries |

## Commands

```powershell
# Windows
.\research\webgpu-peers\clone-peers.ps1

# Linux / cloud / Git Bash
bash research/webgpu-peers/clone-peers.sh
```

Refresh (re-fetch latest default branch):

```powershell
.\research\webgpu-peers\clone-peers.ps1 -Refresh
```

## GitHits (via BWS)

Wrapper script:

```powershell
# From repo root (preferred)
.\scripts\githits.ps1 example "WebGPU importExternalTexture" -l typescript
.\scripts\githits.ps1 search "FixedFeedbackClock" "--in" "github:0langa/beatform" "--limit" "8"

# From research folder (delegates to scripts/githits.ps1)
.\research\webgpu-peers\githits.ps1 auth status
```

Quote `"--in"` so PowerShell does not eat it. Token: BWS `GITHITS_API_TOKEN` via `agent-secrets` (never in chat).

Install CLI once: `bun add -g githits@latest`

**Deep sweep (Sep 2026):** [`githits-sweep-findings.md`](./githits-sweep-findings.md) — 24 queries, 15 ranked repos, tier list update.

Cursor MCP uses separate OAuth at `https://mcp.githits.com` (see hermes-notebook-vault Secret Inventory).

## Related docs

- [`docs/webgpu-av-landscape.html`](../../docs/webgpu-av-landscape.html) — high-level landscape (prior session)
- [`svelte/docs/ARCHITECTURE.md`](../../svelte/docs/ARCHITECTURE.md) — Beatsmaxxer runtime ownership
