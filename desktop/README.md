# Beatsmaxxer Pro — Desktop (Tauri)

Windows-first desktop shell for Beatsmaxxer Pro. It is the same Svelte app the
web target ships, running in a Tauri window instead of a browser tab: identical
controls, rack model, and HTMLVideo → WebGPU playback path.

The shell adds things the browser cannot do — reading `.env` from disk,
calling the Essentia analysis host directly from Rust (bypassing CORS), and
checking, downloading, and installing signed desktop updates.

## Fresh machine setup (Windows)

`.env` is gitignored — copy secrets manually to each machine.

```bash
git clone https://github.com/gordo-v1su4/beatsmaxxer-pro.git
cd beatsmaxxer-pro
cp .env.example .env
bun install
bun run build
bun run dev:desktop
```

Release build: `bun run build:desktop` — output lands in
`desktop/src-tauri/target/release/bundle/`.

## Windows updates and releases

Version 0.2.0 is the first updater-enabled build. A 0.1.0 installation must be
upgraded once with the published `x64-setup.exe`; later releases can be applied
from the update control in the desktop top bar. The control checks on startup,
shows the available version, reports download progress, installs it, and
relaunches the app. It is not rendered in the browser build.

Updater artifacts are signed independently of Windows Authenticode signing.
The updater signature protects release integrity, but an unsigned installer may
still show a Windows SmartScreen reputation warning.

Release automation lives in
[`release.yml`](../.github/workflows/release.yml). A `v*` tag builds the Windows
NSIS and MSI installers, their updater signatures, and `latest.json` as a draft
GitHub release. Inspect the assets before publishing the draft: the updater
endpoint only follows the latest **published** release.

The signing material is intentionally outside this repository:

- private key: `%USERPROFILE%\.tauri\beatsmaxxer-pro.key`
- password backup: `%USERPROFILE%\.tauri\beatsmaxxer-pro.key.password`
- Actions secrets: `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Back up both local files securely. Losing either prevents future versions from
updating installations that trust the current public key.

## Prerequisites

- Windows 10/11
- Visual Studio Build Tools with the **Desktop development with C++** workload
  (supplies the MSVC linker)
- WebView2 runtime — preinstalled on Windows 11
- Rust **1.88+** (`rust-toolchain.toml` at repo root)
- Bun (for the Svelte frontend build)

NSIS is downloaded automatically on the first `tauri build`, so the first
release build is slower than later ones.

### Runtime secrets (desktop dev)

Create a repo-root **`.env`** from [`.env.example`](../.env.example) — `dev-desktop.sh` loads it automatically.

> **`.env.example` is intentionally empty** (template for git). Put real values only in **`.env`** at the repo root. The app never reads `.env.example`.

Set before `bun run dev:desktop` (or in `.env`):

| Variable | Required | Notes |
|----------|----------|-------|
| `ESSENTIA_API_BASE_URL` | For ANALYZE | e.g. `https://essentia.v1su4.dev` or `http://100.x.x.x` (Tailscale) |
| `ESSENTIA_API_KEY` | For ANALYZE | Server-side key; Rust `analyze_rhythm` command uses it |

`ESSENTIA_ANALYSIS_ENABLED` is for the **web** Vite proxy only. Desktop Tauri reads `ESSENTIA_API_*` directly in Rust.

**`.env` location:** repo root (`beatsmaxxer-pro/.env`), not `svelte/.env`. Restart after edits.

**Verify at startup:** `bun run dev:desktop` should print `[desktop] Essentia env loaded (https://…)`. The Tauri terminal also logs `[desktop] Essentia: configured (…)` when Rust sees both vars.

**Verify in the app:** open the WebView inspector (`F12`) → Console:

```js
await window.__TAURI__.core.invoke('essentia_configured')
// → true
```

If `true` but ANALYZE still fails, hover the **RHY** pill in the top bar — the tooltip shows the Rust error (network, 401, timeout, etc.).

## Commands

From repo root:

```bash
bun run build          # build svelte frontend first
bun run dev:desktop    # Tauri dev — Vite on :5175 + native shell
```

**Ports:** web dev uses **5174** (`bun run dev`); desktop Tauri dev uses **5175** so both can run side-by-side.

From `desktop/`:

```bash
bun install
bunx tauri dev
bunx tauri build
```

## Architecture

```text
svelte/build/          the built web app — controls, layout, rack, shaders, playback
desktop/src-tauri/     Tauri shell: window setup, .env loading, Essentia proxy
```

`tauri.conf.json` points `frontendDist` at `../../svelte/build`, so the desktop
app is always whatever the web build produced. There is no desktop-only
rendering path to keep in sync.

### IPC commands

| Command | Purpose |
|---------|---------|
| `essentia_configured` | Report whether both Essentia env vars are set |
| `analyze_rhythm` | Upload audio to the Essentia host from Rust (no CORS) |

## Web vs desktop

| Target | Distribution | Playback |
|--------|--------------|----------|
| Web / Vercel | visit the URL | HTMLVideo → WebGPU |
| Desktop | download an installer per OS | HTMLVideo → WebGPU (same code) |

Tauri does not cross-compile: a Windows installer must be built on Windows, a
macOS one on a Mac. The release workflow
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) builds
Windows on a GitHub runner when a `v*` tag is pushed.

macOS is not a current target. An earlier VideoToolbox/Metal native compositor
was removed in favour of shipping the web path everywhere; if a Mac build is
ever wanted, it should reuse this same webview path rather than reviving that.

Cloud agents run the **web** app only — see [`docs/cursor-cloud-setup.md`](../docs/cursor-cloud-setup.md).
