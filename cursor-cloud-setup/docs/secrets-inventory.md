# Cursor Cloud Runtime Secrets inventory

Add these in **Cursor → Cloud Agents → Environments → Secrets** for the `beat-surfer-pro` environment.

## Required for Tailnet access

| Name | Example shape | Notes |
|------|---------------|-------|
| `TS_AUTHKEY` | `tskey-auth-...` | Ephemeral key with `tag:cursor-agent` (or your chosen tag). Consumed once at Tailscale `up`. |

## Optional — hosted rhythm analysis (development proxy)

The Vite dev server proxies `/__api/analyze/*` to your upstream. Only active when all three are set.

| Name | Example shape | Notes |
|------|---------------|-------|
| `ESSENTIA_ANALYSIS_ENABLED` | `true` | Must be exactly `true` |
| `ESSENTIA_API_BASE_URL` | `https://analysis.example` or `http://100.73.126.36:8080` | Tailscale CGNAT (`100.64.0.0/10`) allowed over HTTP in dev |
| `ESSENTIA_API_KEY` | `<server secret>` | Never exposed to the browser bundle |

## Optional — local QA media path

| Name | Example shape | Notes |
|------|---------------|-------|
| `QA_MEDIA_DIR` | `/path/to/clips` | Only for linking custom clips; committed fixtures work without this |

## Never store in git

- Real `TS_AUTHKEY` values
- `ESSENTIA_API_KEY` or upstream credentials
- Bitwarden / Hermes tokens (not used by this repo's cloud setup)

## Verification commands (secrets redacted)

```bash
# Inside a cloud agent shell — print SET/MISSING only
for v in TS_AUTHKEY ESSENTIA_ANALYSIS_ENABLED ESSENTIA_API_BASE_URL ESSENTIA_API_KEY; do
  if [[ -n "${!v:-}" ]]; then echo "$v=SET"; else echo "$v=MISSING"; fi
done
```
