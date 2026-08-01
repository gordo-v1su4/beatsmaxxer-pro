# Beat Surfer Pro — Agent Guide

Instructions for AI coding agents working in this repository.

**Stack:** SvelteKit 5 + WebGPU-only rewrite in `svelte/`. There is no React app — do not recreate or reference a root `src/` React tree.

## Agent files

| File | Purpose |
|------|---------|
| **`AGENTS.md`** | Canonical instructions — Cursor, Codex, Copilot, etc. read this directly. |
| **`CLAUDE.md`** | Symlink → `AGENTS.md` so Claude Code finds the same guide under its native filename. |
| **`CLAUDE.local.md`** | Optional, gitignored (`*.local`) — Claude-only notes that other IDEs never see. |

## Cursor Cloud

- Cursor automatically loads the repository-root [`.cursor/environment.json`](.cursor/environment.json).
- Cloud startup is [`scripts/cloud-agent-start.sh`](scripts/cloud-agent-start.sh); do **not** create `.env` files in the agent VM.
- Dev server: **`http://127.0.0.1:5174`** (Svelte in `svelte/`).
- QA fixtures: `bash svelte/scripts/setup-qa-media.sh` (bundled tiny `.webm`, not `~/Downloads/archive`).
- Before claiming the app is running, run `cd svelte && bash scripts/verify-cloud-smoke.sh` — must exit 0.
- If port 5174 is closed or smoke fails, **stop and fix the environment** — do not claim success.
- Never mark "8-video proof passed" from cloud alone. Full proof requires native Chrome + archive MP4s locally.
- Setup runbook: [`docs/cursor-cloud-setup.md`](docs/cursor-cloud-setup.md).

### Cloud secrets (Runtime Secrets — names only)

| Variable | Required | Notes |
|----------|----------|-------|
| `ESSENTIA_API_KEY` | Optional | Without it, rhythm stub is used |
| `ESSENTIA_API_BASE_URL` | Optional | Hosted Essentia |
| `TS_AUTHKEY` | Optional | Tailscale if Essentia is tailnet-only |

## Commands

```bash
bun install              # from repo root (postinstall → svelte/)
bun run dev              # http://localhost:5174
bun run build            # production → svelte/build/
bun run test             # vitest
bun run test:local       # full suite (unit + build + browser gates)
bun run link-qa          # symlink 8 archive MP4s + Redline (local Mac only)
cd svelte && bash scripts/verify-cloud-smoke.sh   # cloud smoke gate
```

**QA URL:** `http://localhost:5174/?qa=1&qaAutoplay=1`

Use **bun** only (not npm/yarn/pnpm).

## Architecture

**Audio Analysis → Parameter System → Effect Modules → WebGPU Canvases**

### Decode (web path on `main`)

- **`VideoPool.ts`** — 8× `HTMLVideoElement`, one decode lane per rack slot
- **`WebGpuEngine.ts`** — `importExternalTexture` + `VideoTextureCache` fallback
- **`MediaRuntime.ts`** — transactional clip registration + hot-deck

### Desktop path (`feat/desktop-tauri`)

- Tauri 2 shell embeds `svelte/build`
- Rust **`bsp-decode`** crate: MP4 demux + VideoToolbox (macOS) → IPC → WebGPU upload
- Platform abstraction: `svelte/src/lib/platform/` + `VideoSourcePort`

See [`svelte/docs/ARCHITECTURE.md`](svelte/docs/ARCHITECTURE.md) and [`desktop/README.md`](desktop/README.md).

## Conventions

- Path alias `$lib/` → `svelte/src/lib/`.
- WebGPU required — no WebGL fallback.
- Ship gate: [`svelte/README.md`](svelte/README.md).

## Deploy

Vercel builds from `svelte/` ([`vercel.json`](vercel.json)).
