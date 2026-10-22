# WebGPU update for Beatsmaxxer Pro

Checked: 2026-10-21. Local revision: `ef651b4` plus existing working-copy changes. Research only; no renderer changes, dependency upgrades, or performance measurements.

## Recommendation

Start with optional GPU pass timing plus CPU frame instrumentation, then benchmark immediates for small dynamic effect parameters. Separately investigate sharing the shader interface between external video and owned textures. Expand browser acceptance before claiming wider support. The newest APIs provide useful experiments, but none establishes a measured speedup for this app.

## Current implementation, verified locally

- `svelte/src/lib/rendering/webgpu/SharedGpuDevice.ts:38-72` requests a default adapter/device without optional features, retains its context, and handles device loss. Timestamp queries and shader-f16 would need explicit feature negotiation and compatible fallback behavior.
- `svelte/src/lib/rendering/webgpu/WebGpuEngine.ts:1317-1342` already imports live external video textures and creates the corresponding bind group. This is not a missing optimization to rediscover.
- `svelte/src/lib/rendering/webgpu/VideoTextureCache.ts:26-146` already retains owned textures, tracks frame revisions, and reuses frames during seeks. Preserve the cut-cover/seek-gap contract.
- `svelte/src/lib/rendering/webgpu/WebGpuEngine.ts:992-1016` writes uniform data during rendering, including an additional write in a cached-video branch. That identifies a measurement target, not proof of a bottleneck.
- `svelte/src/lib/rendering/webgpu/shaders/moduleFx.wgsl.ts:1785-1790` creates an idle/owned-texture shader variant by replacing the external texture declaration and sampling operation.
- `svelte/src/lib/export/arrangementExport.ts:98-222` uses canvas capture and MediaRecorder, coordinated with audio and timing preparation. A deterministic frame encoder would be a separate export project.

The continuity document records previous peer research and shipped caching work, but its September sprint status is older than the current repository. This update does not reopen those completed tasks or redefine release scope.

## Ranked opportunities

| Priority | Development and availability | Project benefit and next check |
| --- | --- | --- |
| 1 | Timestamp queries: established optional WebGPU feature, not a new 2026 release. GitHits located the official sample. | Add optional pass timing with asynchronous readback, alongside CPU encoding time, frame availability, upload counts, dropped frames and cut latency. GPU pass timestamps alone cannot diagnose decoding or end-to-end latency. |
| 2 | Immediates, Chrome 149–150, article June 17, 2026. `var<immediate>` and `setImmediates()`, gated by `immediate_address_space`. | Benchmark tiny changing beat/effect values against existing uniform writes. Keep buffers for larger data and preserve existing shader paths on unsupported browsers. Improvement is conditional on measured CPU overhead. [Official announcement](https://developer.chrome.com/blog/new-in-webgpu-149-150). |
| 3 | Compatible GPUTextureView accepted for an externalTexture binding since Chrome 137, May 26, 2025. Older, but directly relevant. | Investigate a common interface for live video and cached/intermediate textures, potentially reducing shader variants and startup compilation. Validate formats, sampling, color conversion, feedback and browser behavior before removing variants. [Official announcement](https://developer.chrome.com/blog/new-in-webgpu-137). |
| 4 | Faster writeBuffer/writeTexture implementation in Chrome 144, January 7, 2026. | Compare supported browser/runtime versions with the same workload before changing the renderer. Upstream transfer benchmarks do not predict whole-app speed or video-import throughput. [Official announcement](https://developer.chrome.com/blog/new-in-webgpu-144). |
| 5 | Broader browser/platform support, current GPUWeb matrix updated October 2, 2026. | Expand acceptance on Safari 26 and Firefox Windows/Apple Silicon. Test decoding, external/owned textures, zero-flash cuts, device recovery and export, rather than checking navigator.gpu alone. [Official implementation matrix](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status). |
| 6 | WebCodecs plus frame-based muxing/export: established adjacent APIs, not a new WebGPU feature. | A scoped deterministic export prototype could improve explicit frame timing and preview/export parity. It would need encoder backpressure, codec detection, audio timing, resource closure and cancellation. Mediabunny is an evaluation candidate, already restricted to a spike by the local demux gate. [Official sample API](https://mediabunny.dev/guide/packets-and-samples), [backpressure API](https://mediabunny.dev/api/VideoSampleSource). |

## Most recent announcements and lower-priority work

Chrome 155–156 is the latest WebGPU article found, listed October 7, 2026 in the Chrome blog index. It adds linear sRGB/Display-P3 canvas spaces, unaligned compressed-texture dimensions, a packed vertex format, and shader-f16 support on Linux with recent NVIDIA drivers. Linear output is relevant to future color-managed compositing; it does not establish correct HDR import, effects or encoded output. The other changes have less direct value for the current fullscreen video pipeline. These are version/platform-specific announcements, not universal browser guarantees. [Release article](https://developer.chrome.com/blog/new-in-webgpu-155-156), [dated index](https://developer.chrome.com/blog).

Chrome 153–154 (September 15, 2026) adds `buffer_view` and `swizzle_assignment`. These could simplify packed compute data or shader authoring; swizzle assignment is not itself a performance upgrade. The article's experimental native Dawn mapping feature is not a browser JavaScript capability. [Official announcement](https://developer.chrome.com/blog/new-in-webgpu-153-154).

Chrome 151–152 (August 12, 2026) adds optional subgroup size control. Reserve this for a measured compute workload, such as reductions or analysis, rather than rewriting ordinary fragment effects. [Official announcement](https://developer.chrome.com/blog/new-in-webgpu-151-152).

Chrome 146 (February 25, 2026) introduces compatibility mode on OpenGL ES 3.1, initially Android. This remains the WebGPU API, with restricted capabilities; it could broaden device reach only after a binding/format/limit audit. Transient attachments may reduce traffic for temporary depth/MSAA resources, but do not suit sampled persistent feedback textures. [Official announcement](https://developer.chrome.com/blog/new-in-webgpu-146).

Bindless rendering remains an early experiment in the latest article. The same article explicitly says `fragment_depth` is temporarily disabled because of Windows compilation errors. Neither should become a production dependency here. [Current status](https://developer.chrome.com/blog/new-in-webgpu-155-156).

## Browser reach is still conditional

The official matrix lists Safari 26 enabled on Apple's OS 26 platforms; Firefox stable on Windows and Apple Silicon Macs; and Chromium Linux support on Intel Gen12+ and NVIDIA Wayland with specified drivers. Firefox Linux and Intel Macs remain Nightly, Firefox Android experimental, and some Chromium configurations still need flags. Consult the matrix rather than asserting all browsers/devices work. Tauri's installed webview must also be tested independently of desktop Chrome. [GPUWeb matrix](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status).

## Reddit: useful leads, not performance evidence

- An April 2026 Framecompose post describes using WebCodecs/Mediabunny/WebGPU across playback, scrubbing and export, while highlighting decoder lifecycle, frame availability and stale-frame problems. Treat the author's architecture description as a lead; their priority/first-ever claim is not established. [Discussion](https://www.reddit.com/r/webgpu/comments/1sm4ujx/i_built_what_i_believe_is_the_first_nle_that_runs/).
- A June follow-up reports device-specific scrubbing work across Apple Silicon, Intel Macs and Windows. It supports testing multiple machines, not assuming the demo's responsiveness transfers here. [Discussion](https://www.reddit.com/r/webgpu/comments/1u064wq/webgpu_video_editor_scrubbing_test_on_a_longer/).
- A recent browser-editor post describes worker decoding, reuse of drawing logic for export, missing worker fonts, and export fast paths omitting edits. These are useful regression scenarios. Its AudioContext slowdown is explicitly a single-machine observation: do not add an audio workaround without reproducing it. Search-result and rendered relative dates disagree, so no exact publication date is asserted. [Discussion](https://www.reddit.com/r/webdev/comments/1x28bdm/i_built_a_video_editor_that_runs_entirely_in_the/).

## GitHits evidence and limits

The MCP connector initially returned a local authentication error. The existing `scripts/githits.ps1` wrapper successfully supplied process-local credentials without printing them.

Search: `videoUploading timestampQuery`, scoped to `github:webgpu/webgpu-samples`, code source, five hits returned. Focused read: `sample/timestampQuery/TimestampQueryManager.ts:1-106`. The code checks device feature support, uses pass start/end timestamp writes, resolves queries, and asynchronously maps a readback buffer. It supplies an implementation reference for profiling rather than an application speed claim. [Official sample source](https://github.com/webgpu/webgpu-samples/blob/main/sample/timestampQuery/TimestampQueryManager.ts), [sample entry](https://github.com/webgpu/webgpu-samples/blob/main/sample/timestampQuery/main.ts).

GitHits returned default-branch evidence without a commit identifier; these links are mutable, not a pinned snapshot. The five search hits are a bounded result set, not an exhaustive OSS survey. Shipping dates above were checked separately against official browser announcements. No new dependency was installed and no GPU/browser benchmark was run for this note.

## Proposed acceptance for the first experiment

Use the existing eight-source and sequencer-cut QA workloads. Record CPU frame-time percentiles, supported GPU pass timings, uploads/reuse, memory pressure, dropped/stale/black frames and cut latency, with identical media/output/effects. Compare baseline against one optional optimization at a time on Windows and an Apple Silicon machine. Preserve unsupported-feature and device-loss behavior. Keep the current implementation unless measurements show a worthwhile improvement without visual or timing regressions.
