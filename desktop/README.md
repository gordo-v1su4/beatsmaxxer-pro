# Beatsmaxxer Pro — Desktop (Tauri)

macOS-first desktop shell for Beatsmaxxer Pro. It shares the Svelte controls and
rack model with the web app while the desktop branch moves video presentation to
a Rust-owned native wgpu compositor.

Architecture and measured release gates:

- [`../docs/desktop-native-video-architecture.md`](../docs/desktop-native-video-architecture.md)
- [`../docs/desktop-video-player-research.md`](../docs/desktop-video-player-research.md)

## Fresh machine setup (macOS)

Desktop work lives on **`cursor/desktop-tauri-e0e8`** (not `main`). `.env` is gitignored — copy secrets manually to each machine.

```bash
git clone https://github.com/gordo-v1su4/beatsmaxxer-pro.git
cd beatsmaxxer-pro
git checkout cursor/desktop-tauri-e0e8
git pull origin cursor/desktop-tauri-e0e8

cp .env.example .env
# Edit .env — ESSENTIA_API_BASE_URL + ESSENTIA_API_KEY (for SONG → ANALYZE)

bun install
bun run build
bun run dev:desktop
```

Optional release build: `bun run build:desktop`

## Prerequisites

- macOS (VideoToolbox decode — Phase 2)
- Xcode command-line tools
- Rust **1.88+** (`rust-toolchain.toml` at repo root)
- Bun (for Svelte frontend build)

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

**Verify in the app:** open WebView inspector (`Cmd+Option+I`) → Console:

```js
await window.__TAURI__.core.invoke('essentia_configured')
// → true
```

If `true` but ANALYZE still fails, hover the **RHY** pill in the top bar — the tooltip shows the Rust error (network, 401, timeout, etc.).

Uploaded clips are staged to the app cache via `stage_clip_file`. The current
native path decodes with `bsp-decode`/VideoToolbox, retains IOSurface-backed Core
Video frames, imports them into Metal/wgpu, and submits them directly to the
native compositor. The legacy `bsp://frame` CPU/IPC bridge is diagnostic-only and
must not be enabled for performance qualification.

> **Linux / cloud VMs:** `crates/bsp-decode` unit tests run cross-platform; full `cargo tauri build` requires macOS (VideoToolbox + WKWebView). On Linux, `cargo check` in `desktop/src-tauri` needs GTK dev packages and is not a CI target.

## Commands

From repo root:

```bash
bun run build          # build svelte frontend first
bun run dev:desktop    # Tauri dev — Vite on :5175 + native shell
```

**Ports:** web dev uses **5174** (`bun run dev`); desktop Tauri dev uses **5175** so both can run side-by-side.

**UI:** matches verified `main` layout — FX LIB + PGM rail only (PresetBrowser middle column removed).

**Video clips:** web and desktop intentionally use different platform playback
implementations. The browser target retains its HTMLVideo/WebGPU path. Desktop
normal playback uses VideoToolbox → IOSurface → Metal/wgpu and does not send
decoded frame pixels through the webview. `BSP_DESKTOP_CPU_FRAME_BRIDGE=1`
enables the old CPU/IPC bridge for diagnostics only.

From `desktop/`:

```bash
bun install
bunx tauri dev
bunx tauri build
```

## Architecture

```text
svelte/build/          shared controls, layout, rack state, and shader semantics
desktop/src-tauri/     Tauri shell + native wgpu compositor + sparse control IPC
crates/bsp-decode/     MP4 demux + retained VideoToolbox frame handles (macOS)
```

### IPC commands

| Command | Purpose |
|---------|---------|
| `open_clip_path` | Register a module clip path |
| `release_clip` | Release one module |
| `stop_decode` | Stop all native decode lanes |
| `probe_clip` | MP4 probe via `bsp-decode` |
| `decode_backend_name` | Diagnostics |
| `update_native_compositor_layout` | Update native preview/PGM rectangles |
| `set_native_compositor_test_pattern` | Native surface alignment proof |

Transport anchors, source assignments, layout rectangles, and compact control
changes cross IPC. Normal playback frames do not.

## Web vs desktop

| Target | Branch | Decode |
|--------|--------|--------|
| Web / Vercel | `main` | HTMLVideo → browser WebGPU |
| Desktop | `cursor/desktop-tauri-e0e8` | VideoToolbox → IOSurface → Metal/native wgpu |

Cloud agents run the **web** app only — see [`docs/cursor-cloud-setup.md`](../docs/cursor-cloud-setup.md).
