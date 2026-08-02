# Cursor Cloud Agent setup — Beat Surfer Pro

This repository runs in a Cursor-hosted Ubuntu VM. The wiring follows the same pattern as [project-stack-structure PR #5 (Hermes)](https://github.com/gordo-v1su4/project-stack-structure/pull/5), adapted for **Svelte + Vite on port 5174**.

## Verified topology

```text
Cursor Cloud Agent VM
  ├─ checks out beat-surfer-pro
  ├─ installs pinned Bun, Tailscale, optional bws, Chromium
  ├─ receives environment-scoped Runtime Secrets from Cursor
  ├─ seeds bundled QA .webm fixtures (8 clips)
  └─ optional Tailscale userspace proxy
       └─ home server / Essentia API on your tailnet
```

Public Essentia URLs work without Tailscale. Only **tailnet-only** Essentia hosts need `TS_AUTHKEY`.

## What this repo installs

Cursor auto-detects the repository-root files:

- [`.cursor/environment.json`](../.cursor/environment.json)
- [`.cursor/install-cloud-tools.sh`](../.cursor/install-cloud-tools.sh)
- [`scripts/cloud-agent-start.sh`](../scripts/cloud-agent-start.sh)
- the **Cursor Cloud** section in [`AGENTS.md`](../AGENTS.md)

The environment installs dependencies, optionally starts Tailscale when `TS_AUTHKEY` is present, then starts Vite on port **5174**.

## Secret modes

The startup script supports two explicit modes (same as Hermes).

### Mode 1 — Cursor environment-scoped secrets (usable now)

Add the app variables listed in [`docs/secrets-inventory.md`](docs/secrets-inventory.md) directly to the repository's Cursor Cloud environment. Sensitive values should be **Runtime Secrets**; non-sensitive URLs can be environment variables.

This does not write a `.env` file.

### Mode 2 — scoped Bitwarden Secrets Manager project (preferred when available)

Set both:

- `BWS_ACCESS_TOKEN` — Runtime Secret
- `BWS_PROJECT_ID` — environment variable

The startup script validates access with `bws project get` and launches Vite through `bws run`. `BWS_SERVER_URL` is optional (omit for Bitwarden Cloud).

Never use a broad organization-wide Bitwarden token in Cursor. Use a dedicated project such as `beat-surfer-pro-dev`.

## Cursor dashboard values

Open [Cursor → Cloud Agents → Environments](https://cursor.com/dashboard/cloud-agents#environments), select the environment for this repository, and add:

| Name | Type | Required |
| --- | --- | --- |
| `TS_AUTHKEY` | Runtime Secret | For tailnet-only Essentia |
| App variables from `docs/secrets-inventory.md` | Runtime Secret or env var | Mode 1 |
| `BWS_ACCESS_TOKEN` | Runtime Secret | Mode 2 only |
| `BWS_PROJECT_ID` | Environment variable | Mode 2 only |
| `BWS_SERVER_URL` | Environment variable | Self-hosted Bitwarden only |

## Tailscale policy

1. Add `tag:cursor-agent` to the tailnet policy.
2. Permit that tag to reach your Essentia host/port only.
3. Create a reusable auth key carrying `tag:cursor-agent`.
4. Save the auth key as Cursor Runtime Secret `TS_AUTHKEY`.

Start from [`docs/tailscale-acl.example.json`](docs/tailscale-acl.example.json), merging into your existing policy.

## Verification

### Repository checks

```bash
python3 -m json.tool .cursor/environment.json >/dev/null
bash -n .cursor/install-cloud-tools.sh
bash -n scripts/cloud-agent-start.sh
cd svelte && bun run test
cd svelte && bun run build
cd svelte && bash scripts/verify-cloud-smoke.sh
```

### Cursor Cloud setup run

Start a setup run from the Cursor dashboard and confirm:

1. `.cursor/install-cloud-tools.sh` completes.
2. Tailscale reports userspace networking ready (if `TS_AUTHKEY` set).
3. The startup script selects the intended secret mode.
4. Vite listens on port **5174**.
5. `cd svelte && bash scripts/verify-cloud-smoke.sh` exits 0.

## What cloud CAN vs CANNOT verify

| Task | Cloud VM | Local Mac |
| --- | --- | --- |
| vitest + build | Yes | Yes |
| Dev server :5174 | Yes | Yes |
| `?qa=1` 8 bundled clips | Yes | Yes |
| WebGPU rendering | Unreliable | Yes |
| Headed 8-video proof (30s, archive MP4s) | No | Yes |

**Rule:** Never mark "8-video proof passed" from cloud alone.

## Security rules

- Never commit `.env` files or real credentials.
- Never paste access tokens into GitHub comments or agent prompts.
- Do not give Cursor broad Bitwarden org tokens — use a dedicated BWS project.
- Cloud tool downloads are pinned to exact versions with SHA-256 verification.
- Vite runs in its own process group so Cursor stop/restart releases port 5174.

## Tauri / desktop branch

Cloud agents run the **web/Svelte** app only. The desktop branch requires macOS + Xcode and is not a Cursor Cloud target.
