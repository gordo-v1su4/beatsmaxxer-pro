# Phase 0 Essentia service evidence

Captured: 2026-07-24  
Service: `https://essentia.v1su4.dev`  
OpenAPI: `https://essentia.v1su4.dev/openapi.json`

## Decision

**Phase 0 analysis-ownership gate: HOLD.**

The live service contract is reachable and its current authentication and upload
shape are observable. The service owner, source repository, deployment authority,
and authority to add `/v1/analyses` are not identified by the service or this
repository. The configured local credential was also rejected by the live
service, so an authenticated upload could not be completed.

Do not start server or analysis-contract migration work until an accountable
owner confirms those items and supplies a valid server-side credential.

## Live contract snapshot

- OpenAPI version: `3.1.0`
- API title/version: `Audio Analysis API` / `4.0.2`
- OpenAPI SHA-256:
  `a80e3a45e5464eff1808282b75f623304cdcc553f72fbd0edecc13f7d09fc612`
- `GET /health`: `200 {"status":"ok","version":"4.0.2"}`
- `GET /`: `404`
- Swagger UI: `GET /docs` returns 200
- ReDoc: `GET /redoc` returns 200

The schema exposes synchronous `POST` operations only:

- `/analyze/rhythm`
- `/analyze/structure`
- `/analyze/classification`
- `/analyze/tonal`
- `/analyze/tonal/key`
- `/analyze/tonal/tempo`
- `/analyze/tonal/pitch`
- `/analyze/vocals`
- `/analyze/fast`
- `/analyze/full`

There are no analysis-job, stored-upload, ownership, user, project, or session
resources. The deployed contract must therefore be treated as synchronous; it
does not prove queued/running job semantics.

## Authentication evidence

Every analysis operation declares the per-operation `APIKeyHeader` security
scheme:

```text
type: apiKey
in: header
name: X-API-Key
```

Observed live:

| Probe | Result |
| --- | --- |
| Multipart upload without `X-API-Key` | `401 {"detail":"Invalid or missing API key"}` |
| Multipart upload with an invalid key | `401 {"detail":"Invalid or missing API key"}` |
| Upload with the credential currently configured in the local `.env` | `401 {"detail":"Invalid or missing API key"}` |
| Unauthenticated `GET /health` | `200` |

The credential value was not printed or recorded. Its rejection means this
capture proves the rejection boundary, not successful authenticated analysis.

## Upload evidence

Each analysis operation declares:

- content type: `multipart/form-data`
- required field: `file`
- file schema: string with `contentMediaType: application/octet-stream`

The OpenAPI document does **not** declare:

- maximum request or file size;
- accepted audio MIME types, containers, or codecs;
- a documented `413` response;
- invalid/unsupported-media response semantics;
- request idempotency or input-hash behavior;
- persistence, retention, deletion, or ownership semantics.

A deterministic 5-second, 44.1 kHz mono WAV fixture was prepared for the live
probe, but authentication failed before media validation. Consequently, the
synchronous upload limit and accepted-media behavior remain unknown.

## Browser and credential-boundary observations

The live preflight currently permits `X-API-Key` and `Content-Type`, supports
`POST`, and echoed the probe origin. This makes direct browser calls possible,
but it does not make embedding an API key in browser code safe.

The current client reads `VITE_ESSENTIA_API_KEY`, and `vite.config.ts` injects
the resolved key through `define`. Any non-empty value can therefore become part
of browser-delivered source or the built artifact. This does not satisfy the
planned server-side credential boundary. A built-secret scan remains required
before release.

The client also sends an `engine` query parameter, while the live OpenAPI does
not document that parameter on `/analyze/fast` or `/analyze/rhythm`. Provider
identity must not be inferred from that client-supplied value.

## Ownership and authority checklist

| Required Phase 0 fact | Status | Evidence needed to clear |
| --- | --- | --- |
| Service owner | Unknown | Named accountable team/person |
| Source repository | Unknown | Repository URL and deploy branch/tag |
| Deployment platform/config owner | Unknown | Deployment runbook and access owner |
| Valid server-side credential | Blocked | Rotated/confirmed key stored outside browser output |
| Synchronous upload limit | Unknown | Proxy and application limits plus an authenticated boundary test |
| Authority to add `/v1/analyses` | Unknown | Written owner approval |
| Current contract mode | Verified synchronous | Live OpenAPI snapshot above |

## Required follow-up

1. Identify the service/repository/deployment owner and record written authority
   for `/v1/analyses`.
2. Rotate or confirm the API key and keep it behind a server-side proxy.
3. Declare upload size, media-type, and error contracts; verify authenticated
   success, invalid media, unsupported media, and `413` behavior.
4. Capture a fresh OpenAPI snapshot after any service change and pin the deployed
   image/config used for reproducibility.
