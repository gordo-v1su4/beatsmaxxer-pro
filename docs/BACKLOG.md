# Backlog

Updated 2026-08-10. Findings traced to `file:line` where known, so the next
session starts from evidence rather than re-deriving it.

Order: **modules → mobile → arrangement.** Ship/infra items are independent.

---

## Done (2026-08-10)

| Fix | Commit |
|---|---|
| v0.1.0 Windows release — draft with `.msi` + NSIS installer | — |
| INCEPTION folded then clamped, smearing one edge texel into a streak | `9f38463` |
| Preview never repainted on a state change while the transport was stopped | `88244b8` |
| ANAMORPHIC squished instead of cropping (`squeeze` → `zoom`) | `5473780` |
| HALATION appeared as two effects (`GLOW` → `HALO`) | `1a2802d` |
| Desktop window opened at 1440 and clipped the rack; splash for first load | `9b4092a` |
| Arcade title card — BEATS/MAXXER collide, segmented pipeline meter | `d9f4ba7` |
| VHS beat gating, LIGHT LEAK screen-blend, FILM GRAIN de-grid | `9cbfd4a` |
| Bar numbers legible; DROP STEMS to clear imported MIDI | `47db8ae` |
| HALATION keyed off luminance, two-ring bloom, cool→warm range | `cedcca9` |
| AUDIO lane marks where onset analysis stops | `a24d7da` |
| Mobile shell (#2) — phone surface, first complete pass | — |

---

## Open — highest leverage first

### 1. Preview cards must run the real effect (#22)
**This is smaller than it looks.** `MODULE_FX_IDLE_WGSL` is not a separate
shader — it is `MODULE_FX_WGSL` with two string replacements swapping the
external texture for a `texture_2d` (see the bottom of `moduleFx.wgsl.ts`). So
the idle shader **already contains every effect function**, and `sampleSource`
already falls back to `testCard(uv)` when `hasVideo` is 0. A filter-type module
can therefore call its real effect over the test card instead of drawing a
bespoke illustration, with no new plumbing. Start with the ones Gordo hit:
GRAIN, LEAK, HALATION, VHS, ANAMORPHIC.

Each module's preview card is a hand-drawn *impression* written separately
from the effect itself — an illustration beside it, not a rendering of it.

**Audited: 13 of 19 idle cards reference no `u.p0/p1/p2` at all**, so they
cannot respond to any control. That is why grain's `16MM / GATE / WEAVE`
selector and its SIZE/DRIFT sliders changed nothing.

- param-blind: SPEEDRAMP, PUNCH ZOOM, HANDHELD, DRIFT CAM, RACK FOCUS,
  ANAMORPHIC, FILM GRAIN, LIGHT LEAK, DUTCH ANGLE, HALATION, LENS BULGE,
  VHS/CAM, PRISM
- param-aware: TRANSITION, STUTTER, TIMESAMPLER, MOTION STREAK, INCEPTION,
  SPECIALTY LENS

**The pattern already exists.** INCEPTION was fixed and the file records why:
its card "used to draw a radial kaleidoscope, which is the one thing this
effect explicitly is not, so the preview advertised a look the module could
not produce." Run the real effect function over a synthetic source in both
places.

Goal, in Gordo's words: *play with all the previews without any videos, then
put your videos in and know what it was going to look like.*

Several module fixes below were noticed *through* a lying preview, so do this
before tuning anything by eye.

### 2. MIDI as an interchangeable source for any beat-driven param (#15)
> Wherever a module has a beat slider, MIDI is an interchangeable source for
> that same slot.

The value is that MIDI need not follow the beat — "on the beat, not on the
beat, on the vocal, all over." Triggered effects fire the event; filters gate
MIX. Same mechanism. Modules with no beat-reactive param are the exclusions.

The gating half is now done (`9cbfd4a`), so the parameter this feeds can
actually reach zero — that was the blocker.

UI: use the **IN knob**. Verified free — `in_` renders in
`rack/MixSection.svelte:52`, has values in every preset, but `paramsForGpu()`
(`AppLoop.ts:69`) never maps it to a shader slot. Sibling `out` is dead the
same way. Repurposing IN means revisiting all three presets per module.

Existing wiring: only `timesampler` consumes MIDI, via
`AppLoop.configureTimeSampler`. Its comment records the trap: "A MIDI layer
used to win simply by existing, which made loading one an irreversible
decision." Default to MIDI on load, keep a toggle back. The note lane should
brighten **on** the hit, not continuously.

### 3. Arrangement timeline offset (#10)
Repro order matters: import MIDI, load the song, let AUTO-RHY analyze. It
finds 125 BPM, the grid rescales, lanes shift, and playback then starts with
the seek bar in blank space while vocals are already audible.

**The original hypothesis is now weaker.** The truncated AUDIO lane turned out
to be the 90-second analysis window (`a24d7da`), not a stale bars-per-second
mapping — so it is no longer evidence for one. Investigate the offset on its
own terms: check whether `beatAt()` in `stores/triggerLane.ts` is being handed
a beat grid that starts at the first detected beat rather than at zero, which
would shift everything by the track's lead-in.

Blocks #13 — section detection cannot be judged until this is right.

### 4. TIMESAMPLER luminance channel intermittent (#20)
"It kinda works and doesn't work sometimes." Reproduce before changing.
Note `configureTimeSampler` is also the only place MIDI reaches a trigger, so
this module has more moving parts than most.

### 5. Gordo has more arrangement notes (#14)
Ask before starting the arrangement phase, so it can be scoped in one pass.

---

## Mobile (#2) — first pass shipped, now needs Gordo's eyes

Built as a **second component tree, not a breakpoint**. `svelte/src/lib/mobile/`
is the whole surface; `+page.svelte` picks a shell and the two share nothing but
the engine. The rack is untouched — verified at 1440x900: still 10 slots, 11
canvases, 1729px wide.

### The shape it took
- **One live canvas, ever.** `MobileStage` mounts `pgm` and nothing else.
  Measured: 1 canvas on the phone against 11 on the rack. Anywhere the desktop
  shows a module preview, the phone draws a **static poster** —
  `ModulePosterTile` hand-draws a glyph per effect at 28x20/1.8 stroke (exactly
  2x `FoldGlyph`'s 14x10/0.9, so INCEPTION reuses the rack's own diagram).
- **One video, ever.** `mobileSession.ts` rewrites the rack to a single slot
  (`top-0`) and swaps which effect occupies it. This works with no engine change
  because `videoLayers` is keyed by *slot*, and `PgmDirector.normalizeSelection`
  already follows the stable slot across an effect replacement — so paging
  modules changes the look without reloading the video.
- **Row affinity is deliberately ignored** on the phone. `top`/`bottom` is a
  desktop layout convention; honouring it would have forced a second decode lane
  purely to host bottom-row effects.
- **The module editor is a swipe-up sheet, not a screen.** Measured portrait:
  62% of viewport, resting at a 76px peek, leaving 309px of picture live above
  it. Landscape it becomes a 46%-width right panel instead, because a bottom
  sheet would cover the thing you are dialling.
- **Drawer matches the reference exactly**: 319px = 85.1% of 375,
  `rgba(12,12,12,0.6)`, `blur(20px)`, `transform 0.3s cubic-bezier(0.2,0,0,1)`.
- **Advance is musical, not clip-driven.** `VideoPool` sets `video.loop = true`,
  so a rack clip never fires `ended` — LINEAR/RANDOM run off the bar counter
  (`advanceBars`, default 8), the same way PGM cuts already quantise.

### Two things that had to change outside `lib/mobile/`
- **`+layout.ts` sets `ssr = false`.** `attachCanvas` awaits device init before
  registering its binding, so a rack that mounts for one frame and unmounts
  registers ten bindings *after* their `detachCanvas` already ran — ten ghost
  canvases for the life of the session. The shell must be known before the first
  render. Nothing was server-rendered anyway, and `adapter-static` already emits
  `fallback: 'index.html'`, so the Vercel deploy shape is unchanged (verified:
  build succeeds, `index.html` is a 1.3KB shell with no rack markup).
- **`touch-action` now exists.** The app had none anywhere, so a knob drag and
  the browser's pan gesture both claimed the first 10px of every stroke.

### Measured
375x812: document width **375px, down from 870** — no horizontal scroll. **0 of
49 controls under 44px** across the sheet and all three drawer tabs. Slider
drag (not just tap) moves a param. Import → poster → stage → ON AIR works end to
end and produces exactly one `<video>`. 850x390 landscape: perform posture, no
overflow, transport floating over the picture. `svelte-check` 0 errors, 307
unit tests pass, production build clean.

### Open / needs a decision
- **Hosted rhythm analysis is off on the phone.** The desktop gates it behind a
  per-upload disclosure that has no mobile home yet, so mobile song loads run
  local realtime (`RHY·RT`) and get the weaker beat grid.
- **`advanceBars` is fixed at 8** with no UI. It wants to be a control, or to
  follow arrangement sections once #10 is fixed.
- **WebGPU-absent path is written but unexercised** — `NoGpuPanel` renders in
  place of the picture and `CapabilityGate` stands down when the phone shell is
  up, but no real GPU-less device has been tested against it.
- The in-app browser pane does not composite while hidden, so **rAF never runs
  and the loading splash never dismisses there**. Everything above was measured
  through the DOM; a real device pass is still owed.

---

## Ship / infra

- **Releases.** Bump `version` in `desktop/src-tauri/tauri.conf.json`, commit,
  then `git tag vX.Y.Z && git push origin main vX.Y.Z`. Builds on a Windows
  runner (~6 min warm) and attaches installers to a **draft** release.
  Publish with `gh release edit vX.Y.Z --draft=false`.
- **Code signing (#6).** Installers are unsigned; Windows shows a SmartScreen
  warning. Needs an OV/EV certificate.
- **macOS build (#5).** Must reuse the webview path — do **not** revive the
  deleted VideoToolbox/Metal compositor. Add a macOS entry to the release
  matrix, plus an Apple Developer account for notarization.
- **SoundTouch (#3).** Measure first, rank last. The AudioWorklet's
  128-sample quantum (~2.9 ms) is fixed by spec, and WSOLA's lookahead is
  identical in any language — a port does not reduce the dominant latency.
  WASM buys CPU headroom and upstream quality. Rust would be a rewrite of
  ~10k lines of tuned DSP that only runs on desktop, re-forking web and
  desktop right after that fork was deliberately removed. AudioWorklets
  cannot `fetch()`; the `.wasm` must arrive via `processorOptions`.
- **Cloud-agent / Docker (#7) — decision, not action.** Gordo no longer uses
  cloud agents here. Files existing only for that: `Dockerfile`,
  `docker-compose.yml`, `.cursor/environment.json`,
  `.cursor/install-cloud-tools.sh`, `scripts/cloud-agent-start.sh`,
  `docs/cursor-cloud-setup.md`, `verify:cloud-smoke`. **Do not delete without
  confirming** — the GPU sandbox is the only way to run WebGPU browser gates
  on the 4090, useful independently of cloud agents.

---

## Notes for whoever edits next

- `moduleFx.wgsl.ts` is **WGSL inside a TypeScript template literal**. A
  backtick in a comment terminates the string and the errors surface far from
  the cause.
- `sampleSource` clamps UV for every module, so any effect that samples
  outside the frame smears the edge texel. INCEPTION now folds via
  `mirrorRepeat`; `punch`, `shake`, `dutch` and `bulge` likely want the same
  one-line change.
- `?splash=hold` keeps the title card up for design work.
- Analysis only sees the first 90 seconds of a track
  (`prepareAnalysisUpload.ts`), capped by Vercel's serverless body limit.
