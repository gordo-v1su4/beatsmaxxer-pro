# AGENTS.md

For full architecture and module reference, see [`CLAUDE.md`](./CLAUDE.md) and [`README.md`](./README.md).

This repo hosts two browser-only front-end apps (no backend to run):

- **Root React + WebGL app** (`src/`) — the legacy/reference build. Vite dev at `http://localhost:5174`.
- **`svelte/` SvelteKit 5 + WebGPU app** — the active rewrite (WebGPU-only render path). Vite dev at `http://localhost:5174` by default.

Standard commands live in `package.json` (root) and `svelte/package.json`. Use `bun` for everything (never npm/pnpm/yarn).

## Cursor Cloud specific instructions

- **Package manager / runtime:** `bun` is required and is installed at `~/.bun/bin` with a symlink at `/usr/local/bin/bun`, so it is on `PATH` for non-interactive shells. Dependency install is handled by the startup update script (`bun install` in repo root and in `svelte/`).
- **Both apps default to port 5174 with `strictPort`.** They cannot run at the same time on the default port. Run them on separate ports, e.g. root on `5174` (`bun run dev`) and svelte on another port (`cd svelte && bun run dev -- --port 5175`).
- **No GPU / WebGPU in the cloud VM.** `navigator.gpu.requestAdapter()` returns `null`.
  - The **root React app renders fine** via its Three.js/WebGL path (WebGL is available), so it is the reliable target for end-to-end/manual UI testing. Pressing PLAY starts a synthesized drum loop; module previews animate and the PGM monitor cuts between sources without any uploaded media.
  - The **svelte app's dev server and UI shell load**, but its WebGPU render engine is gated off (`CapabilityGate` shows "WebGPU unavailable"). Do not expect live shader output from the svelte app in this environment; use it for UI/logic work and rely on `vitest` for verification.
- **Lint/typecheck has known pre-existing failures (not regressions):**
  - Root `bun run lint` (`tsc --noEmit`) fails on `tsconfig.json` with `TS5103 Invalid value for '--ignoreDeprecations'` (documented in `docs/PICKUP.md`).
  - Svelte `bun run check` reports a pre-existing type error in `src/lib/audio/AudioEngine.ts` (`SoundTouchHandle` not assignable to `AudioNode`) plus an a11y autofocus warning.
- **Tests pass** with no extra setup: root `bun test` (also globs the `svelte/tests` dir), svelte `cd svelte && bun run test` (vitest).
- **QA media fixtures are not present.** `tests/fixtures/media/clip1-8.mp4` / `redline.wav` are broken symlinks pointing at a developer's local machine; QA/`?qa=1` autoload and the `svelte/scripts/verify-*` browser gates need real clips (`cd svelte && bash scripts/setup-qa-media.sh`) or a `QA_MEDIA_DIR`. Core functionality does not require them — the app runs with synthesized audio and in-shader test cards.
- **Essentia rhythm analysis** (`ESSENTIA_*` in `.env.example`) is optional; without a key the Vite dev proxy falls back to a local rhythm stub / Web Audio onset detection.
