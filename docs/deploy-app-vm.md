# Self-hosted app and preparation service

The SvelteKit adapter produces a static browser build. WebGPU rendering, timing,
playback and export stay in the browser. `runtime/server.ts` serves that build
and the credential-holding access, analysis, upload and media APIs from one
origin. The separate GPU worker prepares distinct Speedramp clips and returns
verified files through RustFS; repeated sections reuse the content-hash cache.
Only Speedramp assignments require interpolation. The minimum prepared source
rate is 96 FPS; existing native sources at or above that rate bypass preparation.
The default playback/output cadence is 24 FPS, and Speedramp spans 0.25× to 2×.
For a 24 FPS original, fourfold interpolation supplies 96 unique source frames
per second so quarter-speed playback still has 24 unique frames per second.

Docker runs both services on VM100 `app-vm`. Hostinger runs the Dockhand control
panel, and Hawser connects it to VM100's Docker daemon. Video bytes and GPU
processing do not pass through the Dockhand host or Vercel. Public ingress uses
the existing Cloudflare/Caddy route; signed render downloads go to RustFS.
The canonical public-to-private mappings live in `proxmox-home/docs/endpoint-index.md`.

## Runtime ownership

| Surface | Container / owner | Private runtime |
|---|---|---|
| Static app and authenticated API | `beatsmaxxer-pro-web`, Dockhand stack `beatsmaxxer-pro` | Loopback18074, `/opt/hawser-stacks/beatsmaxxer-pro` |
| GPU preparation | `beatsmaxxer-interpolation-worker`, Dockhand stack `media-worker` | Loopback18096, `/opt/hawser-stacks/media-worker` |
| Durable queue and source staging | Existing external volume `media-worker_interpolation-work` | Mounted at `/work` |
| Stored sources, renders and provenance | App-owned RustFS bucket | VM114; gateway settings supply its location |

Dockhand owns the managed Compose files and environments in its persistent
`/app/data/stacks/app-vm/` directory. The public snapshots are
[`infra/app-vm/dockhand-compose.yaml`](../infra/app-vm/dockhand-compose.yaml) and
[`media-worker/compose.dockhand.yaml`](../media-worker/compose.dockhand.yaml).
The app's original build/recovery Compose remains
[`infra/app-vm/compose.yaml`](../infra/app-vm/compose.yaml).

Use masked Dockhand secrets for `APP_ACCESS_PIN`, `MEDIA_GATEWAY_TOKEN` and
`ESSENTIA_API_KEY`; the worker masks its gateway token. Reference all managed
variables explicitly in Compose. Masked fields are supplied by interpolation,
so a raw `env_file` loader is insufficient. Preserve BWS as the credential
source and the original mode600 private runtime files for recovery. Verify
environment parity without printing values.

The app private file is `/opt/beatsmaxxer-pro/private.env`. Set `APP_ORIGIN` to
the public HTTPS origin, `INTERPOLATION_WORKER_URL` to the owned worker, and
analysis/gateway values as documented in `.env.example`. Backend locations and
secrets must not be placed in browser code. Image builds need the non-secret
`ESSENTIA_API_BASE_URL` build argument to enable hosted analysis controls.

## Exact-main deployment

The [deployment workflow](../.github/workflows/deploy-app-vm.yml) uses the
repository-scoped `beatsmaxxer-app-vm` runner, label `beatsmaxxer-production`,
under `/home/gordo/actions-runner-beatsmaxxer`. The GitHub environment
`production-app-vm` permits only main. The runner's job-start hook is outside
its installation at `/home/gordo/beatsmaxxer-deploy-hooks/main-only.sh` and
rejects other repository/ref combinations. Pull requests use the existing
cloud CI and review workflows.

[`scripts/deploy-app-vm.mjs`](../scripts/deploy-app-vm.mjs) exports the exact
main SHA to an immutable release directory, runs Bun checks and unit tests in
a pinned dependency container, builds the app image tagged by that SHA, saves
the new image in Dockhand, and requests managed redeployment. Deployment passes
only when the exact image is healthy, origin/public revision health matches
the SHA, the anonymous access gate is locked, and anonymous media requests are
rejected. The previous managed Compose is saved with the release and restored
if app activation or verification fails. GPU worker releases remain separate,
as with Review Room's media worker.

Deployment locations are read from mode600 `/opt/beatsmaxxer-pro/deploy.env`:
`DOCKHAND_URL`, `DOCKHAND_ENV_ID` and `APP_RELEASE_ROOT`. Application secrets
remain on the server; GitHub receives no application credential copies.
The runner service is
`actions.runner.gordo-v1su4-beatsmaxxer-pro.beatsmaxxer-app-vm.service`.

## Worker updates and recovery

Build and test a worker image on the GPU server before changing its Dockhand
image reference. Check that the durable queue has no queued/processing job
before a planned restart; do not interrupt another service's GPU work. Preserve
the external queue volume, RustFS originals and shared GPU lock. Do not use
`down --volumes`. Pin local images with `pull_policy: never` and disable
automatic image updates. Follow the owning Proxmox worker runbook for runtime
paths, health checks and recovery.

The October10 acceptance container uses an `acceptance-20261010` app image.
Dockhand managed redeployment, authenticated public-browser cache attachment
and 96 FPS artifact checks passed. The old public Vercel site remains separate
until the reviewed release is merged and exact-main deployment is verified.
