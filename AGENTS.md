# AGENTS.md

Beatsmaxxer Pro is a **SvelteKit 5 + WebGPU** browser app (no backend). See [`README.md`](./README.md) and [`svelte/docs/ARCHITECTURE.md`](./svelte/docs/ARCHITECTURE.md).

Use **`bun`** for all installs, dev, test, and build commands.

## Commands

| Task | Command |
|------|---------|
| Install | `bun install` (postinstall also installs `svelte/`) |
| Dev server | `bun run dev` → `http://localhost:5174` |
| Unit tests | `bun run test` |
| Full local suite | `bun run test:local` (needs Chrome + WebGPU) |
| Issue #25 cloud acceptance | `bun run verify:issue25-cloud` (unit + CDP gates; skips headed visual proof) |
| Issue #25 GPU acceptance | `bun run verify:issue25-gpu` after `bash svelte/scripts/setup-qa-media.sh` (5090 + Redline `test_media`; set `PHYSICAL_BROWSER_OBSERVED=1` and `PHYSICAL_BROWSER_OPERATOR`) |
| Sequencer ARM cut CDP | `cd svelte && bun run verify:sequencer-cut` (self-hosted; Redline QA media) |
| Production build | `bun run build` → `svelte/build/` |

QA autoload: `http://localhost:5174/?qa=1&qaAutoplay=1` (fixtures in `svelte/tests/fixtures/media-src/`). Issue #25 CDP gates add `qaSequencerArm=1`, `qaLoopRegion=1` as needed (see `svelte/scripts/ci-sequencer-arm-smoke.sh`).

## Browser gates and GPU

WebGPU output needs Chrome or Edge on a machine with a GPU (the 5090 desktop or the app-vm 4090 sandbox in `docker-compose.yml`). `bun run test` (vitest) runs anywhere; `bun run test:local` needs Chrome + WebGPU on the machine running it.

Long runs on a self-hosted worker: **`HEADLESS=1 bun run test:local:detached`** (tmux + log at `/tmp/bmx-test-local-latest.log`), summarize with **`bun run test:local:log`**. Headless runs **skip** `verify:visual-proof` and `verify:eight-video-proof` unless `REQUIRE_PHYSICAL_PROOF=1`; capture those on the GPU desktop with `bun run capture:visual-proof` and `bun run capture:eight-video-proof`.

### Essentia env (optional, dev only)

| Variable | Notes |
|----------|-------|
| `ESSENTIA_ANALYSIS_ENABLED` | `true` to enable the dev proxy |
| `ESSENTIA_API_BASE_URL` | e.g. `https://essentia.v1su4.dev` |
| `ESSENTIA_API_KEY` | Server-side only; injected by the dev proxy |

Production relay is blocked. Without Essentia, local Web Audio rhythm analysis is the fallback.

### QA media

Committed VP9/WebM fixtures (`svelte/tests/fixtures/media-src/qa-clip.webm`) work on any machine. Run `cd svelte && bash scripts/setup-qa-media.sh` before browser gates.

## Desktop (Tauri, on `main`)

The Windows desktop shell lives on `main`. Push a `v*` tag to build the installers into a draft GitHub release.

| Target | Command | Port |
|--------|---------|------|
| Web (browser) | `bun run dev` | 5174 |
| Tauri desktop | `bun run dev:desktop` | Vite 5175 → native shell |

- Tauri 2 shell in `desktop/` embeds `svelte/build` — Windows-first, same
  HTMLVideo → WebGPU path as the web app, no desktop-only rendering
- Rust side is only window setup, `.env` loading, and the Essentia proxy
- Platform layer: `svelte/src/lib/platform/` + `VideoSourcePort`
- UI matches verified `main` layout (no PresetBrowser middle column)
- See [`desktop/README.md`](./desktop/README.md)
- After web `test:local` passes: **`bun run smoke:desktop`** (full Tauri build on Windows; frontend-only check elsewhere).

## Agent skills

**Canonical skills** live in [`.agents/skills/`](./.agents/skills/) (committed). After clone or `bun install`, `bun run skills:link` creates [`.claude/skills/`](./.claude/skills/) junctions/symlinks so Cursor loads the same skills on any machine. Lockfile: [`skills-lock.json`](./skills-lock.json).

### Issue tracker

Issues live in GitHub (`gordo-v1su4/beatsmaxxer-pro`) via the `gh` CLI. See [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).

### Triage labels

Five canonical roles mapped to GitHub labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).

### Domain docs

Single-context layout: root [`CONTEXT.md`](./CONTEXT.md) (glossary, three platforms) and `docs/adr/` when present. See [`docs/agents/domain.md`](./docs/agents/domain.md).

### Continuity (read before multi-session work)

Active research lane, done/not-done, and skill routing: [`docs/agents/continuity.md`](./docs/agents/continuity.md).

### Linear (sprint board)

Human tracking via the **Linear Cursor plugin**. Project: [Beatsmaxxer Pro](https://linear.app/v1su4/project/beatsmaxxer-pro-69c62284afc0). See [`docs/agents/linear.md`](./docs/agents/linear.md). Bootstrap script fallback: `bun run linear:bootstrap`.
