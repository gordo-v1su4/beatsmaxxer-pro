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
bash scripts/setup-qa-media.sh   # QA clips (cloud-safe)
bun run verify:browser           # browser gates only
```

From repo root: `bun run dev:svelte`

## QA mode

```
http://localhost:5174/?qa=1&qaAutoplay=1
```

Uses bundled fixtures in `tests/fixtures/media/` (see `bash scripts/setup-qa-media.sh`).

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
- [x] `window.__BSP_QA__` debug hook for acceptance scripts
- [x] Automated `verify:playback` — 8/8 `hasReadyFrame`, video time advances (headless)
- [x] Automated `verify:interaction` — controls fire without JS errors (headless)
- [x] Automated `verify:stutter` — p95 delta gate on free-run modules (headless)
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
- [x] Essentia dev proxy (`/__api` → hosted analysis)
- [ ] Essentia on production (`VITE_ESSENTIA_API_BASE_URL` on Vercel — not deployed yet)
- [ ] Beat-synced modules align to bar at QA BPM (133) — not acceptance-tested

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
