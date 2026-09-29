# Stack scorecard — live Time Shaper only

**Pass date:** 2026-09-11  
**Filter:** stutter / speed remap of **video playback position** on a **locked grid**. Not UI, not NLE chrome, not color FX, not VJ launchers.

**Method:** Read existing notes first (`analyses/`, the earlier status and sweep notes, `desktop-native/SUMMARY.md` in webgpu-research, experimental tables). Then visit listed peers one at a time via GitHub + GitHits source (no local GPU boot — dual spikes already crashed the machine). Demos noted, not launched.

**Sibling reference (not a peer):** `../video-timeshaper/` is the Time Shaper *behavior* spec. It does not answer “which GPU path.”

---

## Verdict

**Stay on web.** The live-lane path that can hold up next to native is already the one the harness uses:

```text
locked-grid clock → source-time remap (ours)
  → HTMLVideo seek / playbackRate  or  WebCodecs frame pick
  → importExternalTexture (+ owned copy when multi-pass)
  → WGSL blit / FX → PGM
```

No listed peer ships **live envelope/trigger time-remap + locked beat grid**. Peers prove **ingest** (external texture, rVFC) and **NLE speed** (clip `speed`, shuttle). Time Shaper is **our clock on that ingest**, not a stack we adopt.

Native (fastiplayer, mpv, Clypra) is the **ceiling** for seek/speed latency — score against it later, do not start a native spike in a stack session.

---

## Score key

| Mark | Meaning |
|------|---------|
| **yes** | Does this on the live path |
| **nle** | Timeline / export only — not a live rack |
| **shader** | Looks like stutter; it is a look, not playback-position remap |
| **no** | Absent |
| **ceiling** | Native reference only this session |

**Steal** = copy the pattern into a later *harness* session. **Back burner** = write down, do not build now.

---

## Listed peers (clone set)

| Peer | Path | Stutter | Speed | Locked grid | Decode | GPU | Time Shaper |
|------|------|---------|-------|-------------|--------|-----|-------------|
| [walterlow/freecut](https://github.com/walterlow/freecut) | web | nle | **nle** (clip `speed`, shuttle 1/2/4×, clamp 0.0625–16) | no | HTMLVideo + WebCodecs + Mediabunny | WebGPU dual path | **Steal:** scrub cache + `getBrowserMediaPlaybackRate`. Demo: [freecut.net](http://freecut.net) — do not boot this session. |
| [riskcapital/ghost-arcade](https://github.com/riskcapital/ghost-arcade) | web | **shader** (“Zoom Stutter” ISF) | no (MIDI `currentTime` seek = transport, not warp) | BPM/MIDI, not Essentia lock | HTMLVideo + VideoFrame | WebGPU + WebGL fallback | **Steal:** `waitForPresentedVideoFrame` after seek. AGPL — clean-room. |
| [0langa/beatform](https://github.com/0langa/beatform) | web + Tauri | no | no | live spectral flux | generative, not clips | WebGPU | **Back burner:** `FixedFeedbackClock` if stutter trails. |
| [apssouza22/webgpu-video-rendering](https://github.com/apssouza22/webgpu-video-rendering) | web | no | no | no | WebCodecs `VideoFrame` | external → owned `texture_2d` | **Steal:** copy-before-multipass. 1× FX only. |
| [webgpu/webgpu-samples](https://github.com/webgpu/webgpu-samples) | web | no | no | no | HTMLVideo / VideoFrame | `videoUploading` | **Steal:** rVFC vs rAF. Debug only. |
| [kaltwrk/spektral](https://github.com/kaltwrk/spektral) | web lib | no | no | no | `copyExternalImageToTexture` | material graph | **Back burner:** shader runtime. |
| [kbrandwijk/webgpu-video-shaders](https://github.com/kbrandwijk/webgpu-video-shaders) | web lib | no | no | no | host supplies texture | compute WGSL | **Skip** for remap. LGPL donor shaders only. |

---

## Broad-sweep peers (2026-09-11 list)

| Peer | Path | Stutter | Speed | Locked grid | Time Shaper |
|------|------|---------|-------|-------------|-------------|
| [WeftCut/WeftCut](https://github.com/WeftCut/WeftCut) | desktop webview NLE | nle | **nle** (`VideoClip.speed`; comment: “variable speed deferred” / AE time-remap not on groups) | no | **Back burner.** Same family as FreeCut. |
| [yudgunH/XinChao-Cut](https://github.com/yudgunH/XinChao-Cut) | web NLE | nle | **nle** (clip `speed` + wall-clock-normalized sync) | no | **Steal (P0 for next harness):** `decideVideoSync` + `leadCompensatedSeekTarget` — see below. |
| [zsiec/prism](https://github.com/zsiec/prism) | web compositor | no | no | no | **Back burner.** Multi-source composite; `currentTime` is AudioContext only. |
| [SSFSKIM/designer](https://github.com/SSFSKIM/designer) | web UI | no | no | no | **Skip.** Liquid-glass / Vitrea. GitHits “live video FX” hit was a false positive. |
| [yassinsolim/AetherVSR](https://github.com/yassinsolim/AetherVSR) | web 1×→2× | no | no | no | **Steal:** import honesty (`external` vs `copy`, rVFC as frame clock). VSR itself = back burner. |
| [EmNudge/grade](https://github.com/EmNudge/grade) | web + ffmpeg sidecar | no | no | no | **Back burner.** Color grade on 1× frames. |
| [habemus-papadum/pdum_rfb](https://github.com/habemus-papadum/pdum_rfb) | web | — | — | — | **Skip this pass** (RFB/frame texture; not remap). Revisit only if ingest is broken. |

---

## Experimental / native (ceiling + prep)

| Peer | Path | Stutter | Speed | Locked grid | Time Shaper |
|------|------|---------|-------|-------------|-------------|
| [ajccarlson/flux-fidelity](https://github.com/ajccarlson/flux-fidelity) | Chromium extension | no | **interp** (RIFE tween; maps source time vs `playbackRate`) | no | **Steal for prep lane** (slow-mo frames). Not live remap. **Do not boot** — GPU-heavy. |
| [Bogdan7c/fastiplayer](https://github.com/Bogdan7c/fastiplayer) | native Rust/wgpu | no | **yes** (live scrub + pitch-preserving speed; trailer) | no | **Ceiling.** Decode/seek bar for a later native session. Demo: [YouTube trailer](https://www.youtube.com/watch?v=eMfzBhpSF8M). |
| [kevinraymond/fosfora](https://github.com/kevinraymond/fosfora) | native wgpu | no | no | live FFT/Kalman BPM | **Back burner.** 8-layer VJ, not warp. |
| [resonatrics/kinetic](https://github.com/resonatrics/kinetic) | web | no | no | MIDI note envelope | **Back burner.** Envelope modulates *heatmap params*, video stays 1×. |
| mpv / Clypra / ez-ffmpeg | native | nle / 1× | hard (filter rebuild) | no | Already scored in [`../desktop-native/SUMMARY.md`](https://github.com/gordo-v1su4/webgpu-research/tree/main/desktop-native/SUMMARY.md). Ceiling, not this session. |
| `gordo-v1su4/webgpu-video-looper` | — | — | — | — | **Not public** (GitHits `REPOSITORY_NOT_FOUND`). Ignore. |

---

## What to steal (Time Shaper only)

### 1. XinChao-Cut — seek settlement at ≠1× (P0)

[`video-sync.ts`](https://github.com/yudgunH/XinChao-Cut/blob/713de47bb6626e77fd0b471cd84c97971b70e0a2/src/components/preview/video-sync.ts)

When the clock remaps source time (stutter loop, speed ramp), `<video>.currentTime` drift must be measured in **wall time** (`sourceDrift / playbackRate`). A fixed 180 ms *source* threshold at 4× is 45 ms of wall time — shorter than a typical H.264 seek — so every seek aborts the last one and the picture wedges.

Also: a playing hard-seek must aim at **where the clock will be when the seek lands** (`src + rate × seekEta`), capped at the clip out-point. Seeking to “now” chases a moving target.

This is the only listed code that treats **live speed + seek** as a latency problem. Port the *idea* into the harness when stutter/speed hunts; do not port the NLE.

### 2. FreeCut — authored rate × transport rate

[`shuttle.ts`](https://github.com/walterlow/freecut/blob/main/src/shared/state/playback/shuttle.ts) — clamp `authored × transport` to `[0.0625, 16]`. Scrub cache (`copyExternalImageToTexture`) is the web way to survive sub-1× without looking thin — same job as our slow-mo **prep**, not a live interpolator.

### 3. Ghost Arcade — wait for a presented frame after seek

`waitForPresentedVideoFrame` (rVFC, rAF fallback). Use after a Time Shaper jump so PGM does not flash the pre-seek frame. Not a remap engine.

### 4. AetherVSR — import path honesty

`importExternalTexture` is not guaranteed zero-copy. Keep a forceable `copyExternalImageToTexture` path. Drive the loop from **rVFC**, not `currentTime`-gated rAF.

### 5. flux-fidelity — RIFE for prep only

WebGPU RIFE that already accounts for `playbackRate` vs wall clock. Belongs in `lab/standalone/hf-rife/` / prep scripts, not on PGM.

---

## Back burner (interesting, not remap)

| Find | Why parked |
|------|------------|
| NLE compositors (FreeCut, WeftCut, prism) | Timeline clock ≠ locked-grid live remap |
| Ghost Arcade ISF catalog / 16-channel launcher | VJ FX and clip cuts, not Time Shaper |
| beatform feedback clock | Generative trails |
| designer / Vitrea | Glass UI |
| grade | Color, 1× |
| fosfora / OpenDrop / varda | Native / WebGL VJ layers |
| kinetic MIDI envelopes | Right trigger *shape*, wrong target (heatmap) |
| AetherVSR / flux-fidelity upscale | Quality, not position remap |
| Native rewrite (Clypra, libmpv, Tauri+mpv) | Ceiling; same-session native spike forbidden |

---

## Bake-off (web vs WebGL vs native vs WASM)

| Path | Live stutter/speed on a locked grid? | Call |
|------|--------------------------------------|------|
| **WebGPU + HTMLVideo / WebCodecs** | Yes, if *we* own the clock and settle seeks (XinChao-Cut). Ingest is proven. | **Winner for this pass** |
| WebGL | Ghost Arcade fallback, OpenDrop Milkdrop. No remap advantage. | Do not add a fallback |
| Native wgpu / libmpv | Best decode + live scrub (fastiplayer). Time warp still a filter-graph rebuild (mpv). | Ceiling only |
| WASM ffmpeg | Extra copies; no HW decode in-shell. | Skip for live lane |

---

## Not done this pass

- Did not open peer WebGPU demos (one GPU spike rule).
- Did not clone new repos.
- Did not touch `lab/` (wrong session type).
- pdum_rfb left as a skip until ingest is the problem.

Next stack pass: only if a *new* listed peer claims live time-remap, or a harness session reports seek-wedge at ≠1× (then port XinChao-Cut settlement).
