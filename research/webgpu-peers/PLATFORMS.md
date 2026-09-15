# Three platforms — research & implementation map

Beatsmaxxer Pro ships **one Svelte app** with **three runtime surfaces**. WebGPU + WGSL engine is shared; UI shell, performance policy, and platform services differ.

| Platform | How it runs | UI shell | Dev command |
|----------|-------------|----------|-------------|
| **1. Desktop Windows app** | Tauri 2 + WebView2 | Full rack (same as desktop web) | `bun run dev:desktop` → port 5175 |
| **2. Web app** | Browser tab (Chrome/Edge, wide viewport) | Full rack — `+page.svelte` | `bun run dev` → port 5174 |
| **3. Mobile web** | **Chrome on phone** (same build as web) | `MobileShell` — one stage | HTTPS URL to dev/prod (`?mobile=1` to force) |

**Not three codebases:** `detectRuntime()` → `'web' | 'tauri'` and `isMobileShell` pick shell + policy. Mobile is **not** a native app; it is web + `MobileShell` when viewport matches phone bounds (`mobileEnv.ts`).

Desktop branch note: `cursor/desktop-tauri-*` is separate from `main`; do not merge until promoted (`AGENTS.md`).

---

## Shared core (all three)

Same files, same behavior:

- `WebGpuEngine` · `AppLoop` · `AudioTimeline` · `PgmDirector`
- `importExternalTexture` per task · feedback ping-pong · uber-shader `effectMode`
- `VideoPool` · `MediaRuntime` · eight slot IDs (mobile session uses one)
- Essentia rhythm (path differs — see below)

---

## Platform differences (what research applies where)

| Concern | Desktop Windows (Tauri) | Web app (desktop browser) | Mobile web (Chrome phone) |
|---------|-------------------------|---------------------------|---------------------------|
| **UI** | Full rack + PGM + rails | Full rack + PGM + rails | `MobileShell` — 1 canvas, module pager |
| **WebGPU canvases** | 11 (8 previews + PGM + …) | 11 | **1** (`pgm` only) |
| **Video slots live** | 8 | 8 | 1 (`top-0` session) |
| **Preview FPS cap** | **60** (`DESKTOP_PREVIEW_TARGET_FPS`) | **30** (`WEB_PREVIEW_TARGET_FPS`) | N/A (no preview grid) |
| **Audio latency hint** | **`interactive`** (always) | **`interactive`** | **`playback`** |
| **Render budget / adaptive PGM scale** | Off (fixed sizing) | Off | Designed for phone — **`?budget=1`** today |
| **Lifecycle / background** | Window minimize (mild) | Tab background (mild) | **Lock, app switch, bfcache** — critical |
| **GPU device loss** | Possible | Possible | **Ordinary** (memory pressure, background) |
| **Secure context** | WebView2 origin | localhost / HTTPS prod | **HTTPS required** (Tailscale serve for dev) |
| **Essentia analysis** | Rust `analyze_rhythm` + `.env` | Vite dev proxy / hosted | Same as web — cellular latency matters |
| **Desktop-only** | Updater, `.env` on disk | — | — |
| **Peer research: 8-slot / NLE** | **High** | **High** | Low |
| **Peer research: mobile browser** | Low | Low | **High** — [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) |
| **Peer research: bind group split** | **High** (8 previews) | **High** | Low (one canvas) |

---

## Research doc routing

| Question type | Read first |
|---------------|------------|
| FreeCut, shader registry, 8-slot import | [`githits-sweep-findings.md`](./githits-sweep-findings.md) · [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md) |
| Svelte + WebGPU lifecycle | [`analyses/svelte-peers.md`](./analyses/svelte-peers.md) |
| Phone Chrome, background, HTTPS, thermal | [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) |
| Cloned repos | [`README.md`](./README.md) · `repos/` |

---

## Implementation backlog by platform

### All platforms (engine)

| Task | Tier | Files |
|------|------|-------|
| `wgslLib.ts` + golden tests | 1 | `shaders/` |
| `FixedFeedbackClock` | 2 | `feedback.ts` |
| Timestamp QA profiling | 2 | `WebGpuEngine.ts` |
| `rVFC` on video (where not audio-locked) | 1 | `VideoPool` / `AppLoop` |

### Desktop Windows + Web app (full rack)

| Task | Tier | Notes |
|------|------|-------|
| Bind group frequency split | 1 | 8 preview canvases — both Tauri @ 60fps and web @ 30fps |
| FreeCut `destRect` slot aspect-fit | 3 | Mixed aspect 8-slot rack |
| ExternalCopyPipeline multi-pass | 3 | Shared engine |

Tauri **additionally** benefits from 60fps preview cap already; bind-group win reduces CPU on Windows WebView2.

### Web app only

| Task | Notes |
|------|-------|
| Essentia Vite proxy / hosted path | Dev vs prod |
| Desktop browser QA gates | `test:local` on GPU desktop |

### Mobile web only (Chrome phone)

| Task | Tier | Notes |
|------|------|-------|
| **Internal PGM render scale** (no canvas resize) | **1** | Unblocks adaptive budget — see `renderBudget.ts` |
| Async WebGPU capability probe | 1 | `MobileStage` / Ghost Arcade pattern |
| MasterSelects Safari checklist | 2 | iOS Chrome = WebKit |
| Field matrix: background + device loss | A | [`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) |
| In-app browser matrix | A | Often no WebGPU |

### Desktop Windows app only (Tauri / Rust)

| Task | Notes |
|------|-------|
| Essentia via Rust (no CORS) | Already shipped — not peer-research |
| Auto-updater | `desktopUpdater.ts` — not WebGPU peers |
| Do **not** apply mobile `playback` audio hint | `audioLatencyHint(..., 'tauri')` → always `interactive` |

---

## Runtime detection (for agents)

```typescript
// svelte/src/lib/platform/runtime.ts
detectRuntime() === 'tauri'  // Desktop Windows app
detectRuntime() === 'web'     // Browser (desktop or mobile)

// svelte/src/lib/mobile/mobileEnv.ts
get(isMobileShell)            // true → MobileShell (platform 3)
```

Same Tauri build on a narrow window does **not** switch to MobileShell — viewport test is independent of Tauri (phone-sized Tauri window still gets rack unless you add an override).

---

## Suggested investigation order by platform goal

**Ship mobile Chrome perform better:**  
[`MOBILE-BROWSER-RESEARCH.md`](./MOBILE-BROWSER-RESEARCH.md) → internal PGM scale → field tests on HTTPS

**Ship desktop rack smoother (web + Windows app):**  
Bind groups → wgslLib → FreeCut patterns from [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md)

**Ship Windows app parity with web:**  
Shared engine tasks only; Rust/updater separate from WebGPU peer work

---

## Open questions (cross-platform)

- [ ] Should Tauri on a small window ever offer MobileShell (`?mobile=1` already works in browser)?
- [ ] Same `renderBudget` governor on Tauri if window is phone-sized?
- [ ] QA visual proof: three matrices (Tauri Windows, desktop Chrome, mobile Chrome HTTPS)?
- [ ] Preview 60fps on Tauri vs 30fps on web — intentional; document in SHIP_PLAN?

---

## Related code entry points

| Platform | Key files |
|----------|-----------|
| All | `svelte/src/lib/rendering/webgpu/WebGpuEngine.ts` |
| Shell pick | `svelte/src/routes/+page.svelte`, `mobile/mobileEnv.ts` |
| Mobile UI | `mobile/MobileShell.svelte`, `mobile/MobileStage.svelte` |
| Desktop rack | `components/RackSlot.svelte`, `MainViewer.svelte` |
| Tauri | `desktop/`, `platform/runtime.ts`, `platform/tauriInvoke.ts` |
| Perf policy | `platform/desktopPerformance.ts`, `runtime/renderBudget.ts` |
| Background | `runtime/lifecycle.ts`, `rendering/webgpu/SharedGpuDevice.ts` |
