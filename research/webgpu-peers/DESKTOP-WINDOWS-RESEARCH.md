# Desktop Windows app — research lane (platform 1)

**Surface:** Tauri 2 installer on Windows · full rack · `bun run dev:desktop`  
**Not:** mobile Chrome (`MOBILE-BROWSER-RESEARCH.md`) · not a separate renderer rewrite

---

## Short answer: Rust shell, not Rust/C++ compositor

| Layer | Language | Role in perf |
|-------|----------|--------------|
| **Shell** | **Rust** (compiled) | Window, `.env`, Essentia HTTP, updater — **not on the render hot path** |
| **UI + engine** | **TypeScript + WGSL** (bundled JS) | Rack, WebGPU, audio, PGM — **this is where desktop perf lives** |
| **GPU** | **WebGPU in WebView2** (Chromium/D3D12) | Same API as Chrome; not native wgpu/Metal/DirectX app code |
| **C++** | MSVC **build toolchain only** | Links Tauri on Windows; **no app C++ source** |

There is **no** active C++ compositor, Rust wgpu renderer, or WASM video pipeline in this repo. An older **VideoToolbox/Metal native compositor was removed**; `desktop/README.md` says any future macOS build should reuse the webview path.

**Implication for research:** “Optimize the desktop app” means **optimize the shared Svelte/WebGPU engine** with **Tauri/WebView2-specific policy** — not “rewrite hot loops in Rust.”

---

## Architecture (what actually runs)

```text
┌─────────────────────────────────────────────────────────┐
│  beatsmaxxer-pro-desktop.exe  (Rust — ~4 source files)  │
│  · window size / focus / updater                        │
│  · essentia_configured · analyze_rhythm (reqwest)       │
├─────────────────────────────────────────────────────────┤
│  WebView2 (Chromium)                                    │
│  · svelte/build — SvelteKit 5 + WebGpuEngine + WGSL      │
│  · HTMLVideo → importExternalTexture / texture copy     │
│  · Web Audio + SoundTouch                               │
└─────────────────────────────────────────────────────────┘
         ↓ D3D12 / GPU driver
```

Rust entry: `desktop/src-tauri/src/lib.rs` · Essentia: `essentia.rs` · deps: `tauri`, `reqwest`, updater plugins — see `Cargo.toml`.

---

## Where desktop already differs from web (in-tree)

These are **TypeScript** forks, not Rust:

| Policy | Desktop (Tauri) | Web app (browser) | Code |
|--------|-----------------|-------------------|------|
| Preview FPS | **60** | **30** | `desktopPerformance.ts` |
| Audio latency | **`interactive`** always | **`interactive`** | `audioLatencyHint()` |
| Video → GPU | **Persistent GPUTexture copy** for all modules | External texture path (lower overhead) | `shouldUsePersistentVideoTexture()` in `WebGpuEngine.ts` |
| Essentia | Rust `invoke('analyze_rhythm')` | Vite proxy / fetch | `tauriInvoke.ts` vs dev proxy |
| QA shell | `shellKind: 'tauri-desktop'` | `browser` | `proofEnvironment.ts` |

The **persistent video texture** path exists because WebView2 can import externals but show black — desktop trades CPU/GPU copy cost for correctness.

---

## What peer research applies (prioritized for platform 1)

Same clones as [`README.md`](./README.md). Order if **desktop Windows is the product focus**:

### Tier A — rack + 11 canvases @ 60fps (shared engine, desktop gains most)

| Item | Why desktop cares | Peer / doc |
|------|-------------------|------------|
| **Bind group frequency split** | 8 previews + PGM; Tauri runs **2× preview rate** vs web | Toji bind-groups · Babylon cache |
| **`wgslLib.ts` + golden tests** | Safe refactors under higher FPS | Beatform |
| **`requestVideoFrameCallback`** | Less wasted imports on 8 slots | webgpu-samples |
| **`FixedFeedbackClock`** | Export/QA determinism | Beatform |

### Tier B — WebView2 / Tauri quirks (desktop-only investigation)

| Topic | Status | Next step |
|-------|--------|-----------|
| External vs copy texture | **Implemented** (`shouldUsePersistentVideoTexture`) | Profile copy cost @ 60fps × 8; consider selective copy |
| Background throttle | Window focus handled in `lib.rs` (show + focus) | Minimize → restore: device loss? re-attach tests |
| WebView2 vs Chrome delta | Assumed same WebGPU | Run `test:local` + visual proof **in Tauri**, not only Chrome tab |
| File / origin | `tauri.localhost` bundled static | QA provenance already in `eightVideoProof.ts` |

### Tier C — Rust shell (correctness, not frame time)

| Topic | Notes |
|-------|-------|
| Essentia upload | Blocking `reqwest` — OK for analyze button, not per-frame |
| Updater | `desktopUpdater.ts` — ship path only |
| `.env` | Dev ergonomics |

**Do not prioritize:** Rust-side video decode, wgpu crate, C++ DLL, OpenCut-style native compositor unless product direction explicitly abandons HTMLVideo → WebGPU.

---

## Explicitly out of scope (unless strategy changes)

- **C++ / WASM compositor** — OpenCut-style; backlog marks as skip unless offline export becomes a goal
- **Rust wgpu** — would duplicate `WebGpuEngine`; two render paths to maintain
- **Reviving Metal/VideoToolbox compositor** — removed by design
- **Electron** — Ghost Arcade patterns useful for ISF/lifecycle ideas only (AGPL)

---

## Suggested desktop research sprint

1. **Re-run visual proof inside Tauri** (`bun run build && bun run dev:desktop`) — baseline @ 60fps previews + copy path  
2. **Profile bind group rebuild** on 11 canvases — implement Tier 1.2 from [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md)  
3. **Measure persistent texture copy** vs external path — quantify WebView2 tax; document in this file  
4. **WebView2 device loss** — minimize window, sleep, restore; compare to Chrome tab  
5. **Essentia** — only if ANALYZE latency matters; Rust path is already optimal for CORS

---

## GitHits queries (desktop-focused)

Run via `.\scripts\githits.ps1`:

```powershell
.\scripts\githits.ps1 search "bind group cache webgpu" -l wgsl
.\scripts\githits.ps1 search "WebView2 WebGPU" -l typescript
.\scripts\githits.ps1 search "importExternalTexture copyExternalImageToTexture" -l typescript
.\scripts\githits.ps1 example "tauri webgpu performance" -l rust
```

Expect **WebGPU/TS hits**, not Rust render engines — that matches our architecture.

---

## Open questions

- [ ] Is 60fps preview cap worth the WebView2 copy load, or should Tauri match web @ 30 until bind groups land?
- [ ] Can any modules return to external texture on Windows WebView2 after driver/WebView2 version X?
- [ ] Tauri dev uses Vite :5175 — does HMR + 11 canvases exaggerate perf vs release `svelte/build` bundle?
- [ ] Multi-monitor / fullscreen: Ghost Arcade output windows — relevant for desktop perform mode?

---

## Related

| Doc | Purpose |
|-----|---------|
| [`PLATFORMS.md`](./PLATFORMS.md) | Three-surface map |
| [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md) | Tier 1–3 tasks |
| [`desktop/README.md`](../../desktop/README.md) | Build, Essentia, updater |
| `svelte/src/lib/platform/desktopPerformance.ts` | 60fps + audio policy |
| `svelte/src/lib/rendering/webgpu/WebGpuEngine.ts` | Tauri texture copy |
