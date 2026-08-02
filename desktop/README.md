# Beat Surfer Pro — Desktop (Tauri)

macOS-first desktop shell for Beat Surfer Pro. Embeds the same Svelte + WebGPU UI from [`../svelte/`](../svelte/) and adds a native decode path via Rust.

## Prerequisites

- macOS (VideoToolbox decode — Phase 2)
- Xcode command-line tools
- Rust **1.88+** (`rust-toolchain.toml` at repo root)
- Bun (for Svelte frontend build)

### Runtime secrets (desktop dev)

Set in your shell or Cursor Runtime Secrets before `bun run dev:desktop`:

| Variable | Required | Notes |
|----------|----------|-------|
| `ESSENTIA_ANALYSIS_ENABLED` | For ANALYZE | Must be `true` for hosted rhythm |
| `ESSENTIA_API_BASE_URL` | For ANALYZE | e.g. `https://essentia.v1su4.dev` |
| `ESSENTIA_API_KEY` | For ANALYZE | Server-side key; Rust `analyze_rhythm` command uses it |

Uploaded clips are staged to the app cache via `stage_clip_file` and decoded through `bsp-decode` → `bsp://frame` → WebGPU.

> **Linux / cloud VMs:** `crates/bsp-decode` unit tests run cross-platform; full `cargo tauri build` requires macOS (VideoToolbox + WKWebView). On Linux, `cargo check` in `desktop/src-tauri` needs GTK dev packages and is not a CI target.

## Commands

From repo root:

```bash
bun run build          # build svelte frontend first
bun run dev:desktop    # Tauri dev — Vite on :5175 + native shell
```

**Ports:** web dev uses **5174** (`bun run dev`); desktop Tauri dev uses **5175** so both can run side-by-side without conflict.

From `desktop/`:

```bash
bun install
cargo tauri dev
cargo tauri build
```

## Architecture

```text
svelte/build/          UI + WebGPU WGSL (shared with web)
desktop/src-tauri/     Tauri shell + IPC commands
crates/bsp-decode/     MP4 probe + VideoToolbox decode (macOS)
```

### IPC commands

| Command | Purpose |
|---------|---------|
| `open_clip_path` | Register a module clip path |
| `release_clip` | Release one module |
| `stop_decode` | Stop all native decode lanes |
| `probe_clip` | MP4 probe via `bsp-decode` |
| `decode_backend_name` | Diagnostics |

Frames emit on event `bsp://frame` as RGBA payloads consumed by [`TauriNativeSource`](../svelte/src/lib/media/sources/TauriNativeSource.ts).

## Web vs desktop

| Target | Branch | Decode |
|--------|--------|--------|
| Web / Vercel | `main` | 8× HTMLVideo → WebGPU |
| Desktop | `cursor/desktop-tauri-e0e8` | Rust demux + VideoToolbox → IPC → WebGPU |

Cloud agents run the **web** app only — see [`docs/cursor-cloud-setup.md`](../docs/cursor-cloud-setup.md).
