# Ghost Arcade — peer analysis

- **URL:** https://github.com/riskcapital/ghost-arcade
- **Cloned:** 2026-09-06 (shallow)
- **Stars / activity:** 46 · last push 2026-09-05
- **License:** AGPL-3.0
- **Analyst:** Cursor research session

## Stack

| Layer | Choice |
|-------|--------|
| UI framework | **Svelte 5** + Electron desktop |
| Build | Vite |
| WebGPU | Primary output path; WebGL fallback |
| Video source | HTMLVideo, ISF shaders, 3D, Spout, screen capture |
| Audio / rhythm | BPM-synced quantize, audio-reactive ISF uniforms, MIDI clock |
| Other GPU | WebGL effect path, native renderer sync for some outputs |

## Render path

```text
Layer content (video / ISF / 3D)
  → effect chain (200+ catalog)
  → mixer / crossfader
  → WebGPU presenter OR WebGL fallback
  → multi-output windows / Spout / MP4
```

Production zero-copy output window:

```text
Editor VideoFrame ──postMessage──► output window
  → device.importExternalTexture({ source: videoFrame })
  → fullscreen WGSL blit
```

## Video texture approach

- [x] `importExternalTexture` per frame — `videoFrameBridge.ts`, `outputSharedTexturePresenter.ts`
- [x] `VideoFrame` handoff between windows (not just HTMLVideoElement)
- [ ] Persistent external texture cache (correctly avoids cross-task cache)
- [x] ISF shader catalog with parsed uniform metadata cache

## Audio / rhythm analysis

- BPM-synced clip launcher quantize (VJ mode)
- `audioBroadcast.ts` — shared analyzer contract for ISF uniforms on output displays
- MIDI clock sync + learn
- Not Essentia-class offline grid — performance-oriented

## Shader packaging

- **ISF-first** — `parseISF()`, drag-drop custom shaders, 200+ built-in effects
- Effect categories: Color, Stylize, Blur, Feedback, Glitch, 3D SDF, etc.
- `vjShaderInputCache` — Map shader source → parsed inputs (avoid re-parse)
- AI-assisted GLSL generation (BYO API keys)

## Performance / latency notes

- Explicit **4K60 zero-copy** output via WebGPU presenter (no encode/decode round-trip)
- WebGL fallback when WebGPU unavailable (Beatsmaxxer is WebGPU-only — study fallback UX only)
- Multi-output crop/rotate per display
- AGPL license — careful if copying code directly into MIT project

## Overlap with Beatsmaxxer Pro

| Beatsmaxxer feature | This repo |
|---------------------|-----------|
| 8 stable slot IDs | 16-channel clip launcher (similar rack mental model) |
| PGM beat director | Dual-deck crossfader + quantize (different UX, same domain) |
| `importExternalTexture` + idle copy | **Yes** — VideoFrame bridge pattern |
| Feedback ping-pong | Yes — feedback/trails effect category |
| Essentia / Web Audio | Web Audio + BPM, not Essentia |
| SvelteKit | **Svelte 5** (Electron, not SvelteKit) |

## Ideas worth stealing

1. **VideoFrame cross-window bridge** — pattern for future multi-monitor PGM output without canvas readback.
2. **ISF parser + uniform cache** — if we expose user shader slots, ISF metadata is industry-standard.
3. **Clip launcher + quantize** — UX reference for beat-quantized PGM (we have director logic; they have performer UX).
4. **Effect catalog taxonomy** — 200+ effects organized by category maps well to our 18-module catalog expansion.
5. **Svelte 5 store patterns** for GPU-heavy apps (`vjClipLauncher.ts`, `stageEffects.ts`).

## Skip / not applicable

- Electron / Spout / native renderer sync (desktop branch territory)
- WebGL fallback implementation
- AGPL code copy without legal review
- AI shader generation pipeline

## Key files to grep

| Path | Why |
|------|-----|
| `src/lib/utils/videoFrameBridge.ts` | importExternalTexture from VideoFrame |
| `src/lib/sync/outputSharedTexturePresenter.ts` | Zero-copy output window |
| `src/lib/stores/vjClipLauncher.ts` | Clip rack + ISF cache |
| `src/lib/isf/parser.ts` | ISF metadata |

## References

- README: WebGPU output, 16-channel VJ, 200+ effects, MIDI
- https://ghostarcade.live

---

## Clone dissection (2026-09-06)

Local clone: `repos/ghost-arcade/` (gitignored). Line refs from shallow clone at session time.

### 1. Clip arm + `requestVideoFrameCallback` (steal candidate)

Ghost Arcade **pre-decodes and parks** the first visible frame while a clip is inactive, so trigger latency is `play + reveal` — no seek on the cut frame.

```739:818:research/webgpu-peers/repos/ghost-arcade/src/lib/stores/vjClipLauncher.ts
function waitForPresentedVideoFrame(videoEl: HTMLVideoElement, timeoutMs = 500): Promise<void> {
  // ...
  if (typeof videoEl.requestVideoFrameCallback === 'function') {
    frameHandle = videoEl.requestVideoFrameCallback(finish);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }
}
// ...
// seeked does not guarantee presentation — rVFC prevents activation race
await waitForPresentedVideoFrame(videoEl);
```

**Beatsmaxxer today:** `VideoPool.prewarm()` uses rVFC after play for decode readiness, but does **not** seek-to-trim + park paused at first frame the way `armVideoClipForTrigger` does.

```261:272:svelte/src/lib/media/VideoPool.ts
private waitForDecodedFrame(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(() => resolve());
  } else {
    video.addEventListener('loadeddata', () => resolve(), { once: true });
  }
}
```

**Backlog item:** Tier 1.3 in [`IMPLEMENTATION-BACKLOG.md`](../IMPLEMENTATION-BACKLOG.md) — consider `armAtTrimStart(slotId)` before PGM cut for zero-latency channel switches.

### 2. VideoFrame bridge vs direct HTMLVideo import

Ghost Arcade wraps **canvas/video → VideoFrame → importExternalTexture** with mandatory `.close()` and dev leak counter:

```151:185:research/webgpu-peers/repos/ghost-arcade/src/lib/utils/videoFrameBridge.ts
export function withExternalTexture<T = void>(device, source, fn, options?) {
  videoFrame = new VideoFrame(source, { timestamp: ..., alpha: ... });
  const externalTexture = device.importExternalTexture({ source: videoFrame });
  return fn(externalTexture);
} finally {
  videoFrame.close();
}
```

Documents `texture_external` is **fragment-only**; provides `blitExternalToTexture2D()` when compute/feedback needs `texture_2d`.

**Beatsmaxxer today:** Direct `importExternalTexture({ source: HTMLVideoElement })` per task in `importAndBindExternalVideo` — correct for our path; no VideoFrame wrapper needed unless we bridge WebGL or cross-window.

```1041:1067:svelte/src/lib/rendering/webgpu/WebGpuEngine.ts
/** External textures expire after the current JavaScript task. Import and bind
 * together at the render call site; callers must never cache either result. */
export function importAndBindExternalVideo(...) {
  externalTexture = device.importExternalTexture({ source });
  // ...
}
```

**Steal:** `checkVideoFrameLeaks()` pattern behind `__BMX_QA__` if we add VideoFrame paths (desktop multi-monitor output).

### 3. Beat-quantized switching — different layer than ours

| | Ghost Arcade | Beatsmaxxer Pro |
|---|--------------|-----------------|
| Clip rack | 16-channel launcher, crossfader decks | 8 stable slot IDs + palette |
| Quantize | Performer UX (deck/launcher); BPM/MIDI in ISF uniforms | `PgmDirector` → `audioEngine.configurePgmSchedule()` |
| Clock | Performance-oriented Web Audio | Essentia grid + `TransportClock` + live schedule |

```22:84:svelte/src/lib/runtime/pgm/PgmDirector.ts
/** Beat-quantized PGM cuts via AudioEngine live schedule — no React rAF promotion. */
audioEngine.configurePgmSchedule({
  active, sources, queued, autoRandom, intervalBeats, feel
});
```

Ghost Arcade is a **UX reference** for launcher + output; our **director logic is already deeper** on transport integration. No code copy needed for quantize — study clip-arm timing only.

### 4. WebGPU output presenter (future desktop)

`docs/WEBGPU_MIGRATION.md` cites ~155µs gpu-submit @ 1080p via GpuMemoryBuffer `VideoFrame` + MessageChannel to a second window. Relevant when desktop branch adds audience monitor — AGPL, pattern-only.

### 5. License gate

**AGPL-3.0** — grep and document patterns; do not paste ISF parser or launcher stores into MIT tree without clean-room rewrite.

## Updated “ideas worth stealing” (post-clone)

1. **`waitForPresentedVideoFrame` after seek** — extend `VideoPool` arm path (Tier 1.3).
2. **`withExternalTexture` + leak debug** — only if we add VideoFrame/canvas bridge.
3. **`blitExternalToTexture2D`** — aligns with FreeCut dual-path + feedback modules needing `texture_2d`.
4. **Clip arm-at-trim** — `armVideoClipForTrigger` state machine (`armedVideoStates` Map keyed by clip id + trim key).
5. **Skip:** ISF catalog, Electron output sync, WebGL fallback.
