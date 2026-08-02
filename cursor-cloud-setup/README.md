# Beat Surfer Pro — Cursor Cloud + Tailscale GPU setup

This runbook wires the repo for **cloud-agent development** with **WebGPU on your Tailnet GPU desktop**.

## Topology

```text
┌─────────────────────────┐         Tailscale          ┌──────────────────────────┐
│  Cursor Cloud VM        │ ◄──────────────────────────► │  GPU desktop             │
│  Vite dev :5174         │                              │  Chrome + WebGPU         │
│  (no GPU)               │                              │  (shader output here)    │
│  optional Essentia proxy│ ──HTTP via TS proxy────────► │  optional analysis API │
└─────────────────────────┘                              └──────────────────────────┘
```

WebGPU always executes **in the desktop browser**. The cloud VM only serves the SvelteKit app and optional server-side dev proxy routes.

## Repository files

| File | Role |
|------|------|
| `.cursor/environment.json` | Cursor install/start + port 5174 |
| `.cursor/install-cloud-tools.sh` | Pin Bun + Tailscale with verified checksums |
| `scripts/cloud-agent-start.sh` | Tailscale userspace + Vite on `0.0.0.0:5174` |
| `AGENTS.md` | Agent instructions and caveats |

## Activation (operator checklist)

### 1. Link Cursor environment

In Cursor → **Cloud Agents** → **Environments**, connect this repository. Cursor reads `.cursor/environment.json` from the repo root.

### 2. Add Runtime Secrets

See [`docs/secrets-inventory.md`](./docs/secrets-inventory.md). Minimum for Tailnet access:

- `TS_AUTHKEY` — ephemeral or reusable auth key tagged for cloud agents

Optional (hosted rhythm analysis on your desktop):

- `ESSENTIA_ANALYSIS_ENABLED=true`
- `ESSENTIA_API_BASE_URL=http://100.73.126.36:<port>` (Tailscale IP of your analysis service)
- `ESSENTIA_API_KEY=<server secret>`

Never commit secret values. Verify presence as SET/MISSING only.

### 3. Tailscale ACL

Use [`docs/tailscale-acl.example.json`](./docs/tailscale-acl.example.json) as a starting point. Restrict:

- Cloud agent tag → your GPU desktop (dev server access from desktop)
- Cloud agent tag → analysis service port (if using Essentia on desktop)

### 4. Open the app on your GPU machine

After a cloud agent starts:

1. Note the Cursor forwarded URL for port **5174**, or the VM's Tailscale IP.
2. On your **GPU desktop**, open Chrome/Edge 113+:
   ```
   http://<host>:5174/?qa=1&qaAutoplay=1
   ```
3. Confirm WebGPU previews animate (CapabilityGate should not block).

### 5. Local verification (on GPU desktop)

```bash
bun install
cd svelte && bun run test          # unit tests, no GPU
cd svelte && bun run test:local    # full suite + browser gates (needs Chrome + WebGPU)
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "WebGPU unavailable" in cloud VM | Expected — no GPU in VM | Open app on GPU desktop browser |
| Dev server unreachable from desktop | VM not on tailnet / firewall | Set `TS_AUTHKEY`; check ACL |
| Essentia proxy 503 | Missing env or bad URL | Set all three `ESSENTIA_*` vars; use `100.x` HTTP or HTTPS |
| Port 5174 in use after restart | Stale Vite process | Restart agent; startup script kills process group on exit |
| Black previews on desktop | User gesture needed | Click PLAY or use `?qaAutoplay=1` |

## Differences from `project-stack-structure`

That repo offloads **AI generation** to SwarmUI on the desktop. Beat Surfer Pro offloads **WebGPU rendering** to whichever browser runs on your GPU machine — there is no server-side render farm.
