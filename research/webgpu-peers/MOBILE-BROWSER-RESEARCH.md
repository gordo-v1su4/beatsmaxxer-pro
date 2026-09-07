# Mobile browser research lane (Chrome / mobile web)

**Scope:** Platform **3** only — phone **through Chrome** (same web build, `MobileShell`).  

**Not:** Desktop Windows Tauri app (platform 1 — full rack, see [`PLATFORMS.md`](./PLATFORMS.md)).

**Companion:** [`PLATFORMS.md`](./PLATFORMS.md) · [`IMPLEMENTATION-BACKLOG.md`](./IMPLEMENTATION-BACKLOG.md)

---

## Why this is a different chunk from desktop peer research

Desktop GitHits sweep focused on **multi-canvas racks, NLE compositors, VJ clip launchers, shader registries**. Mobile browser performance is dominated by **platform policy and browser lifecycle**, not WGSL architecture.

| Topic lane | Desktop web peers | Mobile **browser** peers / sources |
|------------|-------------------|-------------------------------------|
| 8-slot `importExternalTexture` | FreeCut, webgpu-samples | **N/A** — one canvas, one slot |
| Shader registry / ISF rack | Ghost Arcade, spektral | Low priority |
| Beat-quantized PGM director | Beatform, Ableton transport | Same engine — audit only |
| **Secure context / HTTPS** | localhost OK in dev | **Tailscale serve**, prod TLS — `vite.config.ts` |
| **Background tab / device loss** | Rare | **Ordinary** — `SharedGpuDevice.ts`, `lifecycle.ts` |
| **AudioContext suspend** | Uncommon | **Lock screen, app switch** — `startLifecycleWatch()` |
| **Audio buffer size** | `interactive` | **`playback` hint on mobile web** — `desktopPerformance.ts` |
| **Thermal / adaptive resolution** | Fixed PGM size | **`renderBudget.ts`** (needs internal-scale fix) |
| **Video autoplay policy** | Lenient | **muted + playsinline** — verify on real devices |
| **Safari WebKit quirks** | Secondary | **Primary on iOS** (all browsers) — MasterSelects docs |
| **In-app browsers** | N/A | Instagram / Discord WebViews — often no WebGPU |
| **120 Hz rAF vs video FPS** | Minor | **Major** — rVFC |

---

## What Beatsmaxxer already has (mobile browser)

| Mechanism | File | Mobile-browser relevance |
|-----------|------|--------------------------|
| Separate `MobileShell` (1 canvas) | `mobile/MobileShell.svelte`, `MobileStage.svelte` | Avoids 11-canvas desktop load |
| One slot session | `mobile/mobileSession.ts` | `top-0` only; module paging without reload |
| Shell pick before first paint | `mobile/mobileEnv.ts`, `+layout.ts` SSR off | Prevents attach/detach race |
| Device loss → re-attach | `WebGpuCanvas.svelte`, `SharedGpuDevice.ts` | **Critical on phone background** |
| Foreground audio resume | `runtime/lifecycle.ts` | **Critical** — suspended AudioContext |
| Mobile `playback` latency hint | `platform/desktopPerformance.ts` | Reduces stutter vs GPU contention |
| PGM DPR cap + 720p max | `WebGpuCanvas.svelte` | Fragment cost control |
| Render budget governor | `runtime/renderBudget.ts` | **Designed for phone** — off until internal blit scale |
| GPU probe flash guard | `MobileStage.svelte` | Needs async store polish |
| HTTPS dev via Tailscale | `vite.config.ts` comments | WebGPU requires secure context on phone |
| Sequencer background catch-up | `stores/sequencer.ts`, tests | Transport keeps time; UI must recover |

---

## Research topics to dig next (mobile browser only)

### A. Platform gates (do first on real hardware)

| # | Question | Where to look | Tool |
|---|----------|---------------|------|
| A1 | Does `navigator.gpu` exist on **HTTPS Tailscale URL** vs http IP? | In-app note; Chrome `chrome://gpu` | Manual + QA checklist |
| A2 | Chrome Android vs Safari iOS adapter limits (max texture size, buffer limits) | gpuweb spec, Chrome status, Can I Use | GitHits `site:developer.chrome.com WebGPU` |
| A3 | WebCodecs + WebGPU both available on target phones? | `capabilities` store | Extend probe in `capability.ts` |
| A4 | **In-app browser** matrix (Instagram, Messages link preview) | WebGPU often missing | Manual matrix doc |

### B. Lifecycle (high value — mostly in-tree)

| # | Topic | Peer / reference | Implement |
|---|-------|------------------|-----------|
| B1 | Background tab → rAF stop → frame gap | GitHits mobile Chrome example (visibility + device.lost) | Verify `recordFrame` ignores >250ms gap ✓ |
| B2 | Long background → **GPU device lost** | fancy-ui fireworks device-loss recovery | Harden retry once in `WebGpuCanvas` |
| B3 | iOS **bfcache** restore | `pageshow` in `lifecycle.ts` ✓ | Test back-navigation on iPhone |
| B4 | Video decode pause in background | HTMLVideo spec / Chrome behavior | Does `VideoPool` need `visibilitychange` nudge? |
| B5 | Screen lock during perform | Audio + GPU together | Field test landscape perform posture |

### C. Performance (mobile browser specific)

| # | Topic | Notes |
|---|-------|-------|
| C1 | **Internal render scale** (no canvas resize) | #1 from backlog — unlocks `?budget=1` default |
| C2 | **`requestVideoFrameCallback`** on single slot | Saves imports on 120Hz phones |
| C3 | **Avoid orientation canvas remount** | `MobileStage` single markup ✓ — do not branch canvas on orientation |
| C4 | **Feedback texture memory** at phone PGM size | 1280 cap helps; measure on Adreno / Mali |
| C5 | Timestamp queries on Android Chrome | QA flag for field diagnostics |
| C6 | Essentia upload on cellular | Hosted analysis latency — mobile UX consent flow exists |

### D. Video + texture (mobile Chrome)

| # | Topic | Peer |
|---|-------|------|
| D1 | `importExternalTexture` + **off-screen video** throttling | webgpu-samples, Chrome 116+ notes |
| D2 | **Low Power Mode** / thermal throttling | No OSS peer — field metrics |
| D3 | HTMLVideo **seek** + external texture expiry | MasterSelects `consensus-B-pitfalls.md` |
| D4 | **`copyExternalImageToTexture`** fallback on seek gaps | Already in `VideoTextureCache` — verify mobile Safari |
| D5 | Multiple **codec** paths (H.264 vs VP9) on Android Chrome | Mediabunny docs if moving to WebCodecs |

### E. UX / shell (not GPU peers — product research)

| # | Topic | In repo |
|---|-------|---------|
| E1 | Perform posture (landscape fullscreen) | `MobileStage.svelte`, `isPerformPosture` |
| E2 | Clip grid + file picker on mobile | `MobileClipGrid.svelte` |
| E3 | Macro pad touch + `navigator.vibrate` | `MobileMacroPad.svelte` |
| E4 | Module sheet / drawer gestures | `MobileModuleSheet`, `MobileDrawer` |
| E5 | Beat-synced PGM on one slot — needed? | Open question vs instant module swipe |

---

## Suggested GitHits queries (mobile browser lane)

Run via `.\scripts\githits.ps1`:

```powershell
.\scripts\githits.ps1 example "Page Visibility API WebGPU device lost mobile browser resume" -l typescript
.\scripts\githits.ps1 example "AudioContext suspended visibilitychange resume mobile" -l typescript
.\scripts\githits.ps1 search "visibilitychange device.lost" "--in" "github:webgpu/webgpu-samples" "--limit" "6"
.\scripts\githits.ps1 search "HTMLVideoElement importExternalTexture mobile Safari" "--in" "github:Sportinger/MasterSelects" "--limit" "6"
```

Broader (not GitHits): Chrome developer docs, WebKit blog WebGPU, W3C WebGPU spec § external texture on mobile.

---

## Repos less relevant for mobile browser lane

Skip deep clones for mobile-specific work:

- FreeCut / localcut (NLE timeline — desktop workflow)
- Ghost Arcade Electron output / Spout (native shell patterns)
- 8-slot grid examples (desktop rack)
- TypeGPU / spektral (shader tooling — future)

**Still useful as read-only:** webgpu-samples (video + timestamp), MasterSelects (Safari video pitfalls), fancy-ui (device loss), apssouza22 (single-video pipeline).

---

## Mobile browser vs Desktop Windows app (clarification)

| | Mobile **Chrome** (platform 3) | Desktop **Windows app** (platform 1) |
|---|-------------------------------|----------------------------------------|
| Runtime | `detectRuntime() === 'web'` | `detectRuntime() === 'tauri'` |
| UI | `MobileShell` | **Full rack** (same as desktop web) |
| WebGPU | Browser Chrome/WebKit | **WebView2** (Chromium) |
| Secure context | HTTPS required on device | Embedded app origin |
| Audio hint | `playback` on phone | **`interactive`** always |
| Essentia | Web/proxy path | **Rust invoke** + `.env` |
| Updater | — | Tauri plugin |

Platform 1 and **2** (desktop browser web app) share rack UI; differ on preview FPS (60 vs 30) and Essentia path. See [`PLATFORMS.md`](./PLATFORMS.md).

---

## Recommended next investigation session

1. **Field matrix** — 2–3 phones, Chrome, HTTPS URL: WebGPU probe, one clip, background 30s, return — log device loss + audio resume.
2. **GitHits B lane queries** — lifecycle + visibility (above).
3. **Read MasterSelects** pitfall docs in clone or via GitHits — Safari iOS checklist.
4. **Prototype internal PGM scale** (C1) — biggest perf win for mobile browser without new peers.

Capture results in a new section at the bottom of this file or in `IMPLEMENTATION-BACKLOG.md` open questions.

---

## Open questions (mobile browser)

- [ ] Default-on adaptive budget after internal blit scale — yes/no?
- [ ] iOS Safari: does `importExternalTexture` from backgrounded-then-foreground video need explicit `video.play()` nudge?
- [ ] Chrome Android low-memory kill: full page reload vs device lost only?
- [ ] PWA “Add to Home Screen” — different WebGPU / storage behavior?
- [ ] Essentia analysis on LTE — timeout and fallback to Web Audio rhythm only?
- [ ] Should mobile shell expose desktop rack via `?desktop=1` on large phones (foldables)?
