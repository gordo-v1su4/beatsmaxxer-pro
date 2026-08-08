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
| Production build | `bun run build` → `svelte/build/` |

QA autoload: `http://localhost:5174/?qa=1&qaAutoplay=1` (fixtures in `svelte/tests/fixtures/media-src/`).

## Cursor Cloud

- Cursor loads repository-root [`.cursor/environment.json`](./.cursor/environment.json) automatically.
- Install: [`.cursor/install-cloud-tools.sh`](./.cursor/install-cloud-tools.sh) pins **Bun 1.3.10** and **Tailscale 1.98.10**.
- Startup: [`scripts/cloud-agent-start.sh`](./scripts/cloud-agent-start.sh) — optional Tailscale userspace networking, then Vite on **`0.0.0.0:5174`**.
- Setup runbook: [`cursor-cloud-setup/README.md`](./cursor-cloud-setup/README.md).
- Do **not** create `.env` files in the cloud VM; use Cursor environment-scoped Runtime Secrets.

### WebGPU runs on your GPU desktop, not in the cloud VM

Cloud VMs have **no WebGPU** (`navigator.gpu` is null). Shader output only appears when you open the dev server in **Chrome or Edge on a machine with a GPU** — typically your Tailnet desktop (`desktop-q20uuvd` or similar).

**Workflow:**

1. Launch a cloud agent (or run `bash scripts/cloud-agent-start.sh` locally).
2. On your **GPU machine**, open Chrome and visit either:
   - the Cursor forwarded port URL for `:5174`, or
   - `http://<cloud-vm-tailscale-ip>:5174/?qa=1&qaAutoplay=1` if the VM joined your tailnet.
3. WebGPU initializes in that desktop browser; previews and PGM render with your local GPU.

Cloud agents can still run **`bun run test`** (vitest, no GPU) and edit code. Browser acceptance gates (`bun run test:local`) require Chrome + WebGPU on the machine running the tests.

### Tailscale (optional)

Set **`TS_AUTHKEY`** in Cursor Runtime Secrets so the cloud VM joins your tailnet. This enables:

- Your GPU desktop to reach the dev server via Tailscale IP.
- The Vite Essentia dev proxy to reach a rhythm-analysis service on your desktop (e.g. `ESSENTIA_API_BASE_URL=http://100.73.126.36:<port>`).

Tailscale uses Cursor-required **userspace networking** (`--tun=userspace-networking`). Restrict ACL access per [`cursor-cloud-setup/docs/tailscale-acl.example.json`](./cursor-cloud-setup/docs/tailscale-acl.example.json).

### Secrets

| Variable | Required | Notes |
|----------|----------|-------|
| `TS_AUTHKEY` | For Tailnet | Cursor Runtime Secret only; never commit |
| `ESSENTIA_ANALYSIS_ENABLED` | Optional | `true` to enable dev proxy |
| `ESSENTIA_API_BASE_URL` | Optional | HTTPS or `http://100.x.x.x` (Tailscale CGNAT) |
| `ESSENTIA_API_KEY` | Optional | Server-side only; injected by dev proxy |

Hosted analysis is **development-only**; production relay is blocked. Without Essentia, local Web Audio rhythm analysis is the fallback.

### QA media

Committed VP9/WebM fixtures (`svelte/tests/fixtures/media-src/qa-clip.webm`) work on any machine. Run `cd svelte && bash scripts/setup-qa-media.sh` before browser gates.

### Known cloud limitations

- No live WebGPU shader output inside the cloud VM browser.
- Physical visual proof (`capture:visual-proof`) requires a native GPU — run on your desktop, not the cloud VM.
- Chrome is required for `verify:browser` / `test:local`.

## Desktop branch (`cursor/desktop-tauri-e0e8`)

Separate from `main` — do **not** merge desktop into main until promoted.

| Target | Command | Port |
|--------|---------|------|
| Web (browser) | `bun run dev` | 5174 |
| Tauri desktop | `bun run dev:desktop` | Vite 5175 → native shell |

- Tauri 2 shell in `desktop/` embeds `svelte/build`
- Rust **`bsp-decode`**: MP4 demux + VideoToolbox (macOS) → IPC → WebGPU
- Platform layer: `svelte/src/lib/platform/` + `VideoSourcePort`
- UI matches verified `main` layout (no PresetBrowser middle column)
- See [`desktop/README.md`](./desktop/README.md)
