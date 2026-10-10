# AGENTS.md

Beatsmaxxer Pro is a **SvelteKit 5 + WebGPU** browser app (no backend). See [`README.md`](./README.md) and [`svelte/docs/ARCHITECTURE.md`](./svelte/docs/ARCHITECTURE.md).

Backend and hosting URLs come from environment variables / `.env.local` and must never be hardcoded or committed.

Use **`bun`** for all installs, dev, test, and build commands.

## Commands

| Task | Command |
|------|---------|
| Install | `bun install` (postinstall also installs `svelte/`) |
| Dev server | `bun run dev` → `http://localhost:5174` |
| Unit tests | `bun run test` |
| Full local suite | `bun run test:local` (needs Chrome + WebGPU) |
| Issue #25 cloud acceptance | `bun run verify:issue25-cloud` (unit + CDP gates; skips headed visual proof) |
| Issue #25 GPU acceptance | `bun run verify:issue25-gpu` after `bash svelte/scripts/setup-qa-media.sh` (GPU host + `test_media`; set `PHYSICAL_BROWSER_OBSERVED=1` and `PHYSICAL_BROWSER_OPERATOR`) |
| Sequencer ARM cut CDP | `cd svelte && bun run verify:sequencer-cut` (GPU worker; QA media from `setup-qa-media.sh`) |
| Production build | `bun run build` → `svelte/build/` |

QA autoload: `http://localhost:5174/?qa=1&qaAutoplay=1` (fixtures in `svelte/tests/fixtures/media-src/`). Issue #25 CDP gates add `qaSequencerArm=1`, `qaLoopRegion=1` as needed (see `svelte/scripts/ci-sequencer-arm-smoke.sh`).

## Browser gates and GPU

WebGPU output needs Chrome or Edge on a machine with a GPU (local desktop or the optional GPU sandbox in `docker-compose.yml`). `bun run test` (vitest) runs anywhere; `bun run test:local` needs Chrome + WebGPU on the machine running it.

Long runs on a self-hosted worker: **`HEADLESS=1 bun run test:local:detached`** (tmux + log at `/tmp/bmx-test-local-latest.log`), summarize with **`bun run test:local:log`**. Headless runs **skip** `verify:visual-proof` and `verify:eight-video-proof` unless `REQUIRE_PHYSICAL_PROOF=1`; capture those on the GPU desktop with `bun run capture:visual-proof` and `bun run capture:eight-video-proof`.

### Essentia env (optional, dev only)

| Variable | Notes |
|----------|-------|
| `ESSENTIA_ANALYSIS_ENABLED` | `true` to enable the dev proxy |
| `ESSENTIA_API_BASE_URL` | Set in `.env.local` (git-ignored); base URL for your hosted analysis API |
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

### PR review bot (Open Code Review)

Every PR gets an automated code review from **Alibaba OpenCodeReview** ([alibaba/open-code-review](https://github.com/alibaba/open-code-review)) running on **Kimi Code (`k3`)**. [`.github/workflows/ocr-review.yml`](./.github/workflows/ocr-review.yml) is a **vendored copy** of the shared workflow in `gordo-v1su4/proxmox-home` (`.github/workflows/ocr-review-reusable.yml`; docs in `proxmox-home/docs/opencode-review-github-actions.md`). Other repos call it with `uses:`, but this repo is public and proxmox-home is private, and GitHub doesn't let a public repo call a private repo's reusable workflow. Don't hand-edit the job — re-sync it from proxmox-home when the shared workflow changes. It needs the repo secret `KIMI_API_KEY`, mirrored from the BWS record of the same name.

It runs once when the PR is opened and posts **inline review comments** plus a summary as `github-actions[bot]` (severity badges: bug / performance / maintainability). A run only passes when every selected file was reviewed.

Before merging: wait for the review check to finish, read its comments (`gh api repos/gordo-v1su4/beatsmaxxer-pro/pulls/<n>/comments` and the summary comment), fix real findings on the branch, then merge. Pushes don't re-trigger it; to re-review an open PR run the workflow manually with `pr_number`. CodeRabbit also appears on PRs but currently skips reviews.

### Triage labels

Five canonical roles mapped to GitHub labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md).

### Domain docs

Single-context layout: root [`CONTEXT.md`](./CONTEXT.md) (glossary, three platforms) and `docs/adr/` when present. See [`docs/agents/domain.md`](./docs/agents/domain.md).

### Continuity (read before multi-session work)

Active research lane, done/not-done, and skill routing: [`docs/agents/continuity.md`](./docs/agents/continuity.md).

### Linear (sprint board)

Human tracking via the **Linear Cursor plugin**. Project: [Beatsmaxxer Pro](https://linear.app/v1su4/project/beatsmaxxer-pro-69c62284afc0). See [`docs/agents/linear.md`](./docs/agents/linear.md). Bootstrap script fallback: `bun run linear:bootstrap`.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
