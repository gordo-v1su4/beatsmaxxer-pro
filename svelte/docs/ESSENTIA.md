# Audio services

## SoundTouch.js (`@soundtouchjs/audio-worklet`)

Uploaded audio routes through SoundTouch for independent pitch and tempo:

- **KEY** → `pitchSemitones` on the worklet (chromatic transposition from detected root)
- **PITCH** → `pitch` ratio via `2^(semitones/12)` (independent offset; does not move KEY)
- **TMP** → `playbackRate` (tempo multiplier; does not move KEY or PITCH)
- **VOL** → master gain after processing

The processor asset is copied to `static/soundtouch-processor.js` during preparation.

## Hosted rhythm + structure analysis (Studio jobs)

Playback is local by default. Hosted analysis is **disabled** unless all server-only settings are explicit:

```bash
ESSENTIA_ANALYSIS_ENABLED=true
ESSENTIA_API_BASE_URL=https://essentia.v1su4.dev
ESSENTIA_API_KEY=server-only-secret
```

The browser calls same-origin Studio routes:

- `POST /__api/analyze/studio/jobs` — submit full **MP3** (no re-encode)
- `GET /__api/analyze/studio/jobs/{id}` — poll until `completed`

The Vite dev proxy or Vercel function injects `X-API-Key`; the key is never compiled into the browser bundle.

**MP3 only for now.** WAV and other formats work for local-only playback but are rejected on the ANALYZE path.

### Upload size

Full MP3 uploads are allowed up to **12 MiB** through the proxy. Typical masters (~7 MiB) fit. Vercel may require a plan that allows request bodies above the default ~4.5 MiB limit.

### Timeout ladder

| Layer | Limit | Notes |
|---|---|---|
| Studio submit (upstream) | 120 s | Large MP3 upload |
| Studio poll (upstream) | 30 s per GET |
| Vercel function | 120 s | `vercel.json` `maxDuration` |
| Client submit | 120 s | `AbortSignal.timeout` on POST |
| Client poll loop | 30 min | Resumes by job id on refresh is not implemented yet |

Legacy `POST /__api/analyze/rhythm` remains for desktop/Tauri; the web app uses Studio only.

### Which variables each stage needs

| Variable | Build (browser bundle) | Runtime (function / Tauri) |
|---|---|---|
| `ESSENTIA_ANALYSIS_ENABLED` | required | required |
| `ESSENTIA_API_BASE_URL` | required | required |
| `ESSENTIA_API_KEY` | **not read** | required |

The build gate (`isAnalysisUploadPathEnabled`) deliberately ignores the key. The key is a runtime-only secret and a deployment may legitimately withhold it from the build step; when the build demanded it, the production bundle compiled the upload path off and `ANALYZE` failed with no diagnostic. The function still applies the full `isAnalysisProxyConfigured` check and answers `503 analysis_unavailable` when the credential is genuinely missing, so a misconfiguration is visible instead of silent.

On Vercel, set all three in **Project → Settings → Environment Variables** for the Production environment. `ESSENTIA_ANALYSIS_ENABLED` and `ESSENTIA_API_BASE_URL` must be readable by the build; changing either requires a redeploy, because they are compiled into the bundle.

### Timeout ladder (legacy rhythm desktop path)

Each layer must outlast the one below it for the Tauri/desktop rhythm proxy:

| Layer | Limit | Set in |
|---|---|---|
| Upstream Essentia call | 15 s | `ANALYSIS_UPSTREAM_TIMEOUT_MS` |
| Vercel function | 120 s | `vercel.json` → `functions.maxDuration` |

When hosted analysis is enabled, the selected **MP3** leaves the browser and is sent to Essentia Studio. If hosted analysis is disabled or fails, local playback continues and realtime analysis is used as the fallback.

The proxy accepts `POST` studio job submission and `GET` job polling, plus legacy `POST` `rhythm` / `fast`. Total upload requests are limited to **12,000,000** bytes, upstream responses to **2,000,000** bytes, and concurrent requests to two per server instance.

## Production safeguards

The production relay is enabled only when all three server-only variables above are configured — the first two at build, all three at runtime. It rejects requests whose `Origin`, forwarded protocol, host, or Fetch Metadata do not identify the same deployed application. The route accepts only the two named POST endpoints and valid bounded multipart uploads, limits concurrent upstream calls, applies an upstream timeout, sanitizes failures, and never exposes the Essentia credential.

### Access gate

Set `APP_ACCESS_PIN` (server-only) to require a code before the app renders or hosted analysis runs. Leave it empty and there is no gate.

The gate is enforced on the server, not in the bundle: `/__api/gate` verifies the PIN and issues an HttpOnly, SameSite=Strict, 30-day session cookie, and `/__api/analyze/*` returns `401 access_locked` without it — before reading the upload or spending the credential. The browser only asks whether to draw the lock screen; it cannot unlock anything itself. Changing the PIN takes effect on the next request and ends every existing session, because the signing key is derived from it.

Failed attempts are counted per server instance (10 per 10 minutes) and answered with `429`. Serverless scales out, so that bounds one instance rather than the deployment — it raises the cost of guessing without being a durable rate limiter.

The gate deliberately fails **open** on missing configuration. A half-configured gate that rejects everyone is indistinguishable from an outage, and locking the operator out of their own deployment is worse than the exposure they already accepted.

The Vercel project must also publish an IP-keyed WAF rate limit scoped to `POST /__api/analyze/*`. The intended initial limit is 10 analysis requests per 10 minutes per source IP. Do not deploy an enabled public relay without that rule. Vercel's platform DDoS protection remains an additional layer; it does not replace the endpoint-specific rate limit.

The visible `SONG` flow requires an explicit choice between **ANALYZE**, **LOCAL ONLY**, and **CANCEL**. Only **ANALYZE** prepares and uploads a bounded excerpt. Local-only playback never invokes the hosted service.

The prompt offers **Remember this choice**, which persists the answer to `localStorage` so later songs are analyzed the moment they load rather than stopping on the same modal every time. This is a *forward* skip from an explicit informed choice only: an absent, unreadable, or unrecognised stored value always means ask again, and a remembered `analyze` is ignored when the build has no upload path. A remembered choice stays visible next to `SONG` as an `AUTO·RHY` / `AUTO·LOC` button that clears it.

Deterministic tests must inject `fetch` and must never contact the configured service. Physical browser visual proof is a separate required release gate; it does not authorize a live analysis call.

## QA media and acceptance gates

QA uses committed fixtures and must not enable the live analysis service. Repository checks and physical-browser proof are separate gates; an unavailable browser is reported as blocked rather than passed.

```bash
cd svelte
bun run test
bun run check
bun run build
bun run verify:browser
```
