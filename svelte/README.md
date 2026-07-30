# Beat Surfer Pro — Svelte + WebGPU

<p align="center">
  <img src="../docs/beat-surfer-pro.webp" alt="Beat Surfer Pro UI with live clips and beat-synced PGM" width="100%" />
</p>

Browser-only rewrite: **SvelteKit 5** shell + **WebGPU-only** render engine. No Three.js, no WebGL fallback — progressive WGSL shader port behind a single `WebGpuEngine` loop.

**Status: not production-ready.** Do not treat unchecked items below as done until browser acceptance + manual recording pass.

## Commands

```bash
bun install
bun run dev          # http://localhost:5174
bun run test:local   # full local suite (unit + build + browser gates) — see docs/LOCAL_TESTING.md
bun run build        # production build → build/
bun run check        # svelte-check
bun run test         # vitest only
bash scripts/setup-qa-media.sh   # QA clips (cloud-safe tiny fixtures)
bash scripts/link-qa-media.sh    # local dev: symlink 8 MP4s + Redline from ~/Downloads/archive (2)
bun run verify:browser           # browser gates only
```

From repo root: `bun run dev:svelte`

## QA mode

```
http://localhost:5174/?qa=1&qaAutoplay=1
```

Uses fixtures in `tests/fixtures/media/` — run `bash scripts/link-qa-media.sh` locally for real clips, or `setup-qa-media.sh` for bundled stubs. On every refresh, `?qa=1` auto-loads song + 8 rack clips via [`loadQaMedia.ts`](src/lib/qa/loadQaMedia.ts).

## Architecture

| Piece | Location |
|-------|----------|
| UI + stores | `src/lib/components/`, `src/lib/stores/` |
| WebGPU engine | `src/lib/rendering/webgpu/WebGpuEngine.ts` |
| WGSL shaders | `src/lib/rendering/webgpu/shaders/` |
| Video pool | `src/lib/media/VideoPool.ts` |
| Audio + Essentia + SoundTouch | `src/lib/audio/` |
| PGM beat cuts | `src/lib/runtime/pgm/PgmDirector.ts` |
| QA hook | `window.__BSP_QA__` (`src/lib/qa/bspQa.ts`) |

## Ship gate checklist (honest)

Only check when **browser-verified** with artifacts or manual recording.

### P0 — must work before anything else

- [x] Video pool loads clips; free-run playback independent of transport
- [x] Per-module clip status (LOAD / RDY / ERR) in patch bay
- [x] `window.__BSP_QA__` debug hook for acceptance scripts (`sampleTimeModules`, `exerciseLiveControls`, `exerciseAllShaderModes`, `auditShaderCatalog`)
- [x] QA `?qa=1` auto-loads Redline + 8 rack clips on refresh (IDE browser verified; WebGPU `crossOrigin` + qa-media CORS)
- [x] Automated `verify:playback` — 8/8 `hasReadyFrame`, video time advances (headless)
- [x] Automated `verify:interaction` — controls fire without JS errors (headless)
- [x] Automated `verify:stutter` — p95 delta gate on free-run modules (headless)
- [x] Automated `verify:audio` — Essentia ready + SoundTouch KEY/PITCH/TEMPO + beat motion (headless)
- [x] Automated `verify:beat` — beat phase advances with transport (headless)
- [x] IDE browser: 8/8 rack viewports show real video; live param exercise; 18/18 WGSL effect modes registered; speedramp rate varies with beat cycle
- [ ] **Manual:** upload via CLIP, drag-drop, top-bar bulk — visible motion in every preview
- [ ] **Manual:** upload mp3 — audible playback + `RHY·OK` (or documented fallback)
- [ ] **Manual:** 60s play while tweaking knobs, dragging modules, swapping clips — no freeze / black >200ms
- [ ] **Manual:** screen recording + screenshots attached to PR

### P1 — shader / FX parity

- [x] Ping-pong feedback textures (offscreen FX → blit to canvas)
- [x] Unified WGSL with beat-synced FX stubs per module + idle graphics
- [ ] Full React GLSL parity (16 transition types, tapdelay trails, loop-seam hold, etc.)
- [ ] Side-by-side screenshot diff vs React QA session per module

### P2 — audio / transport

- [x] SoundTouch.js integrated (`@soundtouchjs/audio-worklet`) — KEY / PIT / TMP / VOL
- [ ] SoundTouch verified by ear on uploaded track (tempo without chipmunk, pitch shift)
- [x] Essentia dev proxy (`/__api/analyze/*` → hosted analysis with `X-API-Key`) — acceptance via `verify:audio`
- [ ] Essentia on production (`VITE_ESSENTIA_API_BASE_URL` on Vercel — not deployed yet)
- [x] Beat-synced time modules (speedramp / tapdelay / timesampler / transition) driven by transport clock — IDE `sampleTimeModules` + unit tests; full accent/stutter ear-check still manual

### P3 — UI

- [x] PresetBrowser removed from side rail; 8 macro dots in top bar
- [x] SoundTouch controls in top bar (KEY, pitch, tempo, volume)

### P4 — deploy

- [x] `vercel.json` points at `svelte/build`
- [x] `bun run build` succeeds
- [ ] Vercel preview/production checked on Chrome + Safari with WebGPU
- [ ] Merge to `main` only after all unchecked items above are checked

## Stack

- Svelte 5, Vite 8, Tailwind CSS 4, WebGPU/WGSL
- Vitest (transport, timesampler, PGM stress)
- SoundTouchJS audio-worklet for pitch/tempo

See also: [`docs/ESSENTIA.md`](docs/ESSENTIA.md), [`docs/MODULES.md`](docs/MODULES.md)
