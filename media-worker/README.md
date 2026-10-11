# GPU interpolation worker

Timing playback stays in the browser. This optional service prepares slow-motion media before playback: browser upload → RustFS staging → durable SQLite queue → GPU RIFE → RustFS render → verified download → resident WebGPU frames.

For a 24 FPS source, the output is 96 FPS (4x). The Timing renderer and default arrangement export output remain 24 FPS. Native high-frame-rate sources do not need interpolation. Uploaded sources are identified by SHA-256 plus the interpolation profile, so completed jobs are reused across reloads and renamed files.

## Requirements

- NVIDIA discrete GPU with CUDA, NVDEC and NVENC available inside Docker.
- An existing media gateway and app-owned RustFS bucket.
- A shared GPU lock directory mounted into every cooperating GPU service.
- Bun worker container and persistent `/work` volume for the queue.

There is **no CPU interpolation fallback**. Startup health reports GPU availability; a job fails explicitly if the GPU cannot be used. Failed jobs require an explicit retry. Only one job is claimed at a time. The shared file lock also serializes this worker with other cooperating GPU services. Interrupted jobs return to the queue on restart.

The pixel pipeline uses NVIDIA NVDEC hardware decoding, zero-copy CUDA frame tensors, RIFE v4.6 FP16 inference with CUDA graphs, and NVENC hardware encoding. It does not extract, compress or decode PNG frames. Output verification decodes through NVDEC too. The network implementation and MIT license are vendored at a pinned upstream commit; the model weights are SHA-256 checked during the container build. See `rife4_cuda/PROVENANCE.md`.

The Docker image pins PyTorch 2.8.0 / CUDA 12.9 and PyNvVideoCodec 2.2.3. This path was tested on the actual RTX 4070 Ti (12 GiB), rather than assuming the previous 4090 is installed. Queue control, file hashing and MP4 muxing still use ordinary CPU work; the pixel-processing stages require the GPU. The worker is limited to one CPU core and frees GPU allocations when its per-job process exits.

## Configuration

Copy existing media gateway configuration into a private, ignored `media-worker/.env`:

- `MEDIA_GATEWAY_URL`
- `MEDIA_GATEWAY_TOKEN`
- `MEDIA_GATEWAY_BUCKET`
- `MEDIA_GATEWAY_USER_ID`
- `MEDIA_GATEWAY_UPLOAD_PREFIX`

Set server-side `INTERPOLATION_WORKER_URL` for the web app. No gateway or worker token belongs in the browser bundle. The app proxy derives a purpose-specific worker token from the server-side gateway credential. Production proxy calls require the application's access session and trusted origin.

Deploy with `docker compose -f media-worker/docker-compose.yml build` and `docker compose -f media-worker/docker-compose.yml up -d`. Adapt the GPU device mappings and shared lock mount to the deployment host. The service binds to loopback by default; expose it through the established authenticated proxy route. `/health` returns readiness without credentials. All `/jobs` routes require the derived bearer token.

## Storage and recovery

App-owned renders use `<upload-prefix>/<year>/<month_day>/<job-id>/original.mp4`, `rife4.mp4`, and `interpolation.json`. Input chunks use the separate `source-video/chunks/<upload-id>/` staging layout. Job metadata persists in `/work/jobs.sqlite`; preserve that named volume during deployment. Do not remove other applications' objects or GPU locks.

The browser displays upload, queue, GPU, download and local frame preparation stages. PLAY, arrangement REC/PLAY and export remain blocked while required work is pending or failed. Retry is available after failures. Finished renders are downloaded and content-hash/frame-rate verified once, then played from local Blob URLs and resident GPU frames; cuts do not fetch frames from the server.

Current limits: source up to 1 GiB, video duration up to 120 seconds, source FPS 6–96 for interpolation, processing dimensions capped at 1280×720. GPU-lock wait and interpolation execution have bounded timeouts. Sources with at least 96 FPS bypass interpolation. Non-24 FPS clips choose an integer factor of at least four to reach at least 96 FPS.
