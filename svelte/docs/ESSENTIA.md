# Audio services

## SoundTouch.js (`@soundtouchjs/audio-worklet`)

Uploaded audio routes through SoundTouch for independent pitch and tempo:

- **KEY** → `pitchSemitones` on the worklet (chromatic transposition from detected root)
- **PITCH** → `pitch` ratio via `2^(semitones/12)` (independent offset; does not move KEY)
- **TMP** → `playbackRate` (tempo multiplier; does not move KEY or PITCH)
- **VOL** → master gain after processing

The processor asset is copied to `static/soundtouch-processor.js` during preparation.

# Hosted rhythm analysis

Playback is local by default. Hosted analysis is **disabled** unless all server-only settings are explicit in development:

```bash
ESSENTIA_ANALYSIS_ENABLED=true
ESSENTIA_API_BASE_URL=https://approved-analysis-service.example
ESSENTIA_API_KEY=server-only-secret
```

The browser always calls the same-origin `/__api/analyze/fast` and `/__api/analyze/rhythm` routes. The Vite development proxy injects the credential on the server; no `VITE_ESSENTIA_API_URL`, `VITE_ESSENTIA_API_BASE_URL`, or `VITE_ESSENTIA_API_KEY` alias is supported. Production builds compile the browser upload path off, and the production function independently rejects relay requests before reading or forwarding their bodies.

When hosted analysis is enabled, the selected audio (or a smaller prepared WAV) leaves the browser and is sent to the configured service. This repository cannot promise the upstream service's retention or deletion behavior. If hosted analysis is disabled or fails, local playback continues and realtime analysis is used as the fallback.

The proxy accepts only `POST` to `fast` or `rhythm`, and only an outer `multipart/form-data` envelope with a valid boundary. It forwards the bounded multipart bytes opaquely; it does **not** parse the inner part or claim file-type validation. Total requests are limited to 3,500,000 bytes, upstream responses to 1,000,000 bytes, upstream time to 15 seconds, and concurrent requests to two per server instance. Errors returned to the browser are stable and sanitized.

## Production block

The production function would otherwise be a public, unauthenticated relay for a credentialed upstream. Size, timeout, concurrency, and origin checks are not authentication or sufficient abuse prevention. Because this repository provides neither request authentication/authorization nor durable per-client rate limiting, the production relay is always disabled even if analysis environment variables are present. A future production path requires an approved design and implementation for those controls, plus service-owner, credential, retention/privacy, consent, and deployment authority.

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
