# Secrets inventory — beat-surfer-pro

These names match the variables read by the application. Values are operator-specific and must not be committed.

For direct Cursor mode, sensitive values are environment-scoped **Runtime Secrets**. For Bitwarden mode, the same names live in the dedicated BWS project.

## Bootstrap

| Name | Type in Cursor | Required |
| --- | --- | --- |
| `TS_AUTHKEY` | Runtime Secret | Private Tailnet access (tailnet-only Essentia) |
| `BWS_ACCESS_TOKEN` | Runtime Secret | BWS mode only |
| `BWS_PROJECT_ID` | Environment variable | BWS mode only |
| `BWS_SERVER_URL` | Environment variable | Self-hosted BWS only; omit for Bitwarden Cloud |

## Audio analysis (Essentia)

| Name | Aliases | Notes |
| --- | --- | --- |
| `ESSENTIA_API_KEY` | — | Optional; without it the app uses a local rhythm stub |
| `ESSENTIA_API_BASE_URL` | `ESSENTIA_API_URL`, `VITE_ESSENTIA_API_BASE_URL` | Optional hosted Essentia base URL |
| `ESSENTIA_ANALYSIS_ENABLED` | — | Server-side dev proxy toggle |
| `ESSENTIA_ANALYSIS_ENGINE` | `VITE_ESSENTIA_ANALYSIS_ENGINE` | Optional engine label |

Sources: [`.env.example`](../.env.example), [`svelte/vite/essentiaDevProxy.ts`](../svelte/vite/essentiaDevProxy.ts).

## QA media (local only)

| Name | Notes |
| --- | --- |
| `QA_MEDIA_DIR` | **Not used in cloud** — cloud uses `svelte/scripts/setup-qa-media.sh` bundled fixtures |

## Safe verification

Never print `env` or `bws run ... env` in CI logs. Check names only:

```bash
python3 - <<'PY'
import os
for name in [
    "ESSENTIA_API_KEY",
    "ESSENTIA_API_BASE_URL",
    "TS_AUTHKEY",
    "BWS_ACCESS_TOKEN",
    "BWS_PROJECT_ID",
]:
    print(f"{name}={'SET' if os.environ.get(name) else 'MISSING'}")
PY
```
