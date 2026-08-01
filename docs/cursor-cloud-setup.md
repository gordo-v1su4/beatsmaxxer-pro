# Cursor Cloud Agent Setup — Beat Surfer Pro

This repo uses the same **repository-root wiring** pattern as [project-stack-structure PR #5](https://github.com/gordo-v1su4/project-stack-structure/pull/5). Cursor Cloud only auto-starts the app when these files exist at the repo root.

## Files

| File | Role |
|------|------|
| [`.cursor/environment.json`](../.cursor/environment.json) | Tells Cursor Cloud: install script, start script, port **5174** |
| [`.cursor/install-cloud-tools.sh`](../.cursor/install-cloud-tools.sh) | Installs Bun + Chromium; runs `bun install` in `svelte/` |
| [`scripts/cloud-agent-start.sh`](../scripts/cloud-agent-start.sh) | Seeds QA fixtures, starts Vite dev server, cleans up on stop |
| [`svelte/scripts/verify-cloud-smoke.sh`](../svelte/scripts/verify-cloud-smoke.sh) | Smoke gate agents must pass before claiming the app is running |

## Operator checklist

1. **Cursor → Repository → Cloud → Runtime Secrets** (names only — never commit values):

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `ESSENTIA_API_KEY` | Optional | Without it, rhythm analysis uses local stub |
   | `ESSENTIA_API_BASE_URL` | Optional | Hosted Essentia base URL |
   | `TS_AUTHKEY` | Optional | Tailscale auth key if Essentia is on your tailnet |

2. Launch a cloud agent on **`main`**.

3. Confirm the **Ports** panel shows **5174 — Beat Surfer**.

4. Agent runs:
   ```bash
   cd svelte && bash scripts/verify-cloud-smoke.sh
   ```

## What cloud CAN verify

- `bun run test` (vitest)
- `bun run build`
- HTTP 200 on `http://127.0.0.1:5174/`
- `?qa=1` loads 8 bundled `.webm` clips (via `setup-qa-media.sh`)

## What cloud CANNOT verify

- WebGPU rendering (often software/null adapter in cloud VMs)
- Headed 8-stream `eightVideoProof` (30s, pixel motion, real archive MP4s)
- Native Chrome GPU path

**Rule:** Never mark "8-video proof passed" from cloud alone. Run headed proof locally:

```bash
bun run link-qa
bun run dev
cd svelte && bash scripts/capture-eight-video-proof.sh
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port 5174 closed | Check `.cursor/environment.json` exists; re-run cloud agent |
| Agent says "running" but curl fails | Run `verify-cloud-smoke.sh`; do not proceed |
| No clips loaded | `bash svelte/scripts/setup-qa-media.sh` (bundled fixtures) |
| Essentia fails | Optional — app falls back to rhythm stub |

## Tauri / desktop branch

Cloud agents run the **web/Svelte** app only. The `feat/desktop-tauri` branch requires macOS + Xcode for native builds and is not a Cursor Cloud target.
