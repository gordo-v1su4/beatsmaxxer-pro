# Svelte + WebGPU — peer analysis (GitHits sweep)

- **Sweep date:** 2026-09-06
- **Tool:** `.\scripts\githits.ps1`
- **Beatsmaxxer entry:** `svelte/src/lib/components/WebGpuCanvas.svelte`

## Landscape

| Repo | Svelte | WebGPU | Live video | Notes |
|------|--------|--------|------------|-------|
| **Beatsmaxxer Pro** | SvelteKit 5 | Native (no Three.js) | 8 slots + PGM | Central `WebGpuEngine`, single `AppLoop` |
| **Ghost Arcade** | Svelte 5 | WebGPU + WebGL fallback | Yes | Closest product peer; mixed Three/WebGPU |
| **jpaquim/svelte-webgpu** | SvelteKit (old) | Raw demos | No | Surma-style samples; stale (2022) |
| **fancy-ui** | Svelte + React port | WebGPU fluid/fireworks | No | `webgpu-engine.ts`, device-loss recovery |
| **matterviz** | Svelte 5 | WebGPU in `$effect` | No | `bind-renderer.svelte.ts` |
| **threlte** | Svelte 3D | WebGPURenderer path | No | Three.js wrapper — wrong stack for us |

**GitHits VJ + Svelte query:** no cross-project example for beat-quantized clip rack + WebGPU video.

---

## GitHits Svelte patterns vs Beatsmaxxer

### 1. `$effect` owns GPU lifecycle (modern Svelte 5)

GitHits distilled pattern: `$effect` with `disposed` flag, `ResizeObserver`, `device.lost` → `{#key canvasEpoch}` remount.

**Beatsmaxxer today:** hybrid — `onMount`/`onDestroy` for attach + observers; `$effect` for module/accent hot-swap and PGM resize budget.

```141:157:svelte/src/lib/components/WebGpuCanvas.svelte
  $effect(() => {
    if (!ready || id === 'pgm') return;
    webGpuEngine.setCanvasModule(id, moduleId);
    webGpuEngine.setCanvasAccent(id, color);
  });

  $effect(() => {
    const scale = $renderScale;
    if (!ready || id !== 'pgm' || !canvas) return;
    void scale;
    if (applySize()) void attach();
  });
```

**Verdict:** Our split is intentional — engine owns device; component owns canvas DOM. Don't move full GPU init into `$effect` per canvas (9 canvases × device init would be wrong). Ghost Arcade uses central renderer + Svelte stores (`webgpuCapability.ts` reactive probe).

### 2. Device loss recovery

| Approach | Source |
|----------|--------|
| `{#key canvasEpoch}` remount canvas | GitHits / barnguard EngineHost |
| `onDeviceLost` callback → re-`attachCanvas` | **Beatsmaxxer** |
| WebGPU → WebGL2 fallback once | fancy-ui fireworks-hdr |

**Verdict:** We already handle loss correctly via `webGpuEngine.onDeviceLost` → re-attach. Optional steal: fancy-ui's single retry + `onLost` teardown contract for QA messaging.

### 3. Resize coalescing

GitHits + our code align: coalesce `ResizeObserver` → one rAF → one reconfigure.

**Beatsmaxxer:** PGM-only `ResizeObserver` + rAF coalesce (phone URL bar collapse). Rack previews fixed 320×180 — no observer needed.

### 4. Video + `importExternalTexture` in Svelte

GitHits synthesized Svelte component with rVFC + per-frame import in `$effect` or mount handler.

**Beatsmaxxer:** Video lives in `VideoPool`; import happens in `WebGpuEngine.renderAll` — **correct separation**. Svelte components should not own rAF render loops (we have one `AppLoop`).

**Optional steal:** rVFC per slot in `VideoPool` when not audio-clock-locked (Tier 1 from main sweep).

### 5. IntersectionObserver skip off-screen work

**Beatsmaxxer:** `setCanvasActive(id, isIntersecting)` on rack canvases — **already ahead** of GitHits Svelte demos.

---

## Ghost Arcade (Svelte 5) — what to grep

| File | Pattern |
|------|---------|
| `src/lib/renderer/webgpuCapability.ts` | Async WebGPU probe as **Svelte store** (UI unsticks after probe) |
| `src/lib/renderer/gpuEffectRunner.ts` | WebGPU effect encode path |
| `src/lib/utils/videoFrameBridge.ts` | VideoFrame → importExternalTexture |
| `docs/WEBGPU_MIGRATION.md` | Phased WebGPU migration notes |

AGPL — study patterns, don't copy code.

---

## Recommendations for Beatsmaxxer (Svelte-specific)

1. **Keep** central `WebGpuEngine` + thin `WebGpuCanvas.svelte` — better than per-component `$effect` GPU loops.
2. **Keep** `$effect` for module/accent/budget only — matches Svelte 5 runes best practice.
3. **Consider** async WebGPU capability store (Ghost Arcade) if gate UI flickers before probe completes.
4. **Consider** `{#key}` remount as fallback if device-loss re-attach ever fails on mobile Safari.
5. **Do not** adopt Threlte/Three WebGPURenderer — conflicts with WebGPU-only architecture.

---

## Rerun

```powershell
.\scripts\githits.ps1 example "SvelteKit 5 WebGPU canvas mount effect" -l typescript
.\scripts\githits.ps1 search "WebGPU canvas Svelte" "--in" "github:riskcapital/ghost-arcade" "--limit" "8"
```
