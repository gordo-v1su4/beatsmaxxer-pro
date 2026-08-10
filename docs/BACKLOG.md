# Backlog

Captured 2026-08-10. Findings traced to `file:line` where known, so the next
session can start from evidence rather than re-deriving it.

Order: **modules → mobile → arrangement.** Everything else is independent.

---

## Cross-cutting (highest leverage)

### 1. Preview cards must run the real effect
Each module's preview card is a hand-drawn *impression* written separately from
the effect itself — an illustration beside it, not a rendering of it. Nothing
keeps them honest.

**Audited: 13 of 19 idle cards reference no `u.p0/p1/p2` at all**, so they cannot
respond to any control.

- param-blind: SPEEDRAMP, PUNCH ZOOM, HANDHELD, DRIFT CAM, RACK FOCUS,
  ANAMORPHIC, FILM GRAIN, LIGHT LEAK, DUTCH ANGLE, HALATION, LENS BULGE,
  VHS/CAM, PRISM
- param-aware: TRANSITION, STUTTER, TIMESAMPLER, MOTION STREAK, INCEPTION,
  SPECIALTY LENS

This is why grain's `16MM / GATE / WEAVE` selector and its SIZE/DRIFT sliders
change nothing.

**The pattern already exists.** INCEPTION was fixed and the reasoning is in the
file: its card "used to draw a radial kaleidoscope, which is the one thing this
effect explicitly is not, so the preview advertised a look the module could not
produce." Run the real effect function over a synthetic source in both places.

Goal, in Gordo's words: *play with all the previews without any videos, then put
your videos in and know what it was going to look like.*

Do this **before** tuning grain / leak / halation — those were noticed *through*
a lying preview, so their true severity is unknown.

### 2. Preview goes stale after a module swap
Swapping a module updates colour and title, but the card only repaints once
playback starts. Across the board; a loaded video updates fine.

`renderAll()` is the only render path and AppLoop owns the sole rAF
(`engine.start()` is a no-op). Each binding's `BindingScheduleState`
(`lastChangeKey`, `nextRenderContextTimeSeconds`) throttles previews against
**timeline context time**, which does not advance while stopped — so the redraw
is never scheduled. Video bypasses this by driving its own texture upload.

Invariant: changing what a module *is* must repaint its card immediately, with
no transport dependency. `__BSP_QA__` already exposes `catalogHotSwap*` and
`stressCatalogModule`, so this should reproduce headlessly.

### 3. MIDI as an interchangeable source for any beat-driven param
Not "MIDI triggers effects", and not every module. The rule:

> Wherever a module has a beat slider, MIDI is an interchangeable source for
> that same slot.

The value is that MIDI need not follow the beat — "on the beat, not on the beat,
on the vocal, all over." A rhythm source beat detection cannot produce.

- Triggered effects (transition, speedramp, punch, timesampler, tapdelay): the
  source fires the event.
- Filters/overlays (vhs, grain, leak, halation, prism, focus): the source gates
  MIX, bringing the look in and out.

Both are the same mechanism. Modules with no beat-reactive param are the only
genuine exclusions.

**Blocked by #4** — swapping the source changes nothing if the param cannot gate.

UI: use the **IN knob** for amount. Verified free — `in_` is rendered by
`rack/MixSection.svelte:52`, has defaults in `catalog.ts` and a value in every
preset, and is filtered out of the generic grid at `ModuleControls.svelte:488`,
but `paramsForGpu()` (`AppLoop.ts:69`) never maps it to a shader slot. Sibling
`out` is dead the same way. Repurposing IN means revisiting all three presets
per module.

Existing wiring: only `timesampler` consumes MIDI, via
`AppLoop.configureTimeSampler` (`midiNotes`, `onsetSensitivity` from `chance`).
Its comment records the trap: "A MIDI layer used to win simply by existing,
which made loading one an irreversible decision." Default to MIDI on load, but
keep a toggle back.

Also: the note lane should brighten **on** the hit, not continuously.

### 4. Beat amount must gate, not add on top
On VHS, turning BEAT to zero leaves the effect fully on; only MIX disables it.
The beat param is additive over an always-on base, so "this look appears only on
the beat" — the most useful thing a beat slider can express — is impossible.

Start with `vhs`, then audit grain, leak, halation, prism, focus for the same
additive-base pattern. Gordo also wants VHS glitch and TV-roll to hit at chosen
moments rather than run continuously; that falls out of the same fix.

---

## Per-module

| Module | Issue |
|---|---|
| **INCEPTION** | ✅ **Fixed, untested.** `moduleFx.wgsl.ts:1068` folded the coordinate then *clamped* it, smearing one border texel into a streak. Now folds via the existing `mirrorRepeat` helper. Compiles clean; the look is unverified. `sampleSource` clamps for every module, so `punch`, `shake`, `dutch`, `bulge` likely need the same one-line change. |
| **ANAMORPHIC** | Squishes instead of cropping. `effectAnamorphic:842` divides X by a squeeze factor while leaving Y alone — desqueeze math applied to already-correct footage. Drop the squeeze, keep the existing letterbox (`barHeight`/`aperture`, 845-846), sample a 2.39 slice at native X scale. Gordo notes it arguably belongs at the output stage but said **leave it where it is**. |
| **LIGHT LEAK** | `effectLeak:876` is `col + warm * leak` — purely additive, exactly as reported. Needs to blend/multiply so it reads as light in the scene. Warm-only palette (`vec3f(1,0.28,0.04)`→`vec3f(1,0.75,0.24)`); wants cool leaks, anamorphic streaks, glass/mirror characters, and presets for how much / how many / where. Top row, so there is room for preset buttons. |
| **FILM GRAIN** | Preview and live are unrelated implementations (idle `mode == 10.0` fixed 110-cell field vs `effectGrain` cellScale 180–1400). Also: `hash21(floor(guv * cellScale))` hashes a **square cell grid** so grain reads as blocks, not noise; `guv = uv + weave * p2 * 0.008` (859-860) jitters the *picture*, which is unwanted; and grain is applied as flat additive monochrome (863) ignoring luminance. Wants film-stock presets — light, medium, 16mm, 35mm, plus an extreme — and more slider range. **Blocked by #1.** |
| **HALATION** | `name: 'HALATION'` vs `shortName: 'GLOW'` — same effect under two labels on one screen (the split is catalog-wide by design, so consider showing both rather than renaming one). Too weak, too little variety; should key off the **luminance** channel and bloom from highlights. |
| **VHS / TAPE** | See #4. Always on; only MIX disables it. Beat param reads as intensity and never gates off. |
| **TIMESAMPLER** | Luminance channel works intermittently — "kinda works and doesn't work sometimes." Reproduce before changing. Worth doing before HALATION, since it is the reference Gordo wants HALATION to match. |

---

## Mobile

A *representation* of the app, not the whole app: one video at a time, swipeable
full-screen module cards, portrait to prepare, **landscape to perform**.
References: beat-surfer v1/v2 prototypes in `test_media`, plus two mobile drawer
shells.

The native-iOS planning package (`docs/iphone`) was merged in #20 and reverted
as dated — **not** the native route. This is the responsive layout of the
existing Svelte app, shipping through the same Vercel deploy. The old package is
still readable at commit `1088907` if any of its UX thinking is worth mining.

---

## Arrangement (after mobile)

- **No way to remove imported MIDI tracks.** Import appends lanes; nothing
  deletes them. Needs clear-all and/or per-track delete, visually distinct from
  the existing CLEAR CUTS.
- **Timeline offset — playhead and content do not line up.** Repro order
  matters: import MIDI, then load the song, let AUTO-RHY analyze. It finds 125
  BPM, the grid rescales, lanes shift, and playback then starts with the seek bar
  in blank space while vocals are already audible.
  *Hypothesis:* lanes are laid out against the pre-analysis BPM and never
  re-laid-out after it changes — a stale bars-per-second mapping. Would explain
  the truncated audio lane too, as one root cause.
- **AUDIO lane renders only ~45%** of the arrangement while other lanes run full
  width. Likely the same stale mapping; if not, check whether the waveform
  decodes the whole file.
- **Bar numbers illegible.** Selecting the text does not reveal them, which
  points at fill colour — possibly canvas-drawn rather than DOM text.
- **Section detection suspect** (INTRO/VERSE/CHORUS/BRIDGE) — but unjudgeable
  until the offset is fixed. Do not tune the detector first.
- **Gordo has more arrangement notes to give.** Ask before starting.

---

## Ship / infra

- **v0.1.0 Windows release is ready.** Pipeline proven — a `workflow_dispatch`
  dry run passed green in 14m53s. `git tag v0.1.0 && git push origin v0.1.0`
  builds on a Windows runner and attaches the `.msi` + NSIS `-setup.exe` to a
  **draft** release. Bump `version` in `tauri.conf.json` before later tags — the
  installer filename comes from that field, not the tag.
- **Code signing.** Installers are unsigned; Windows shows a SmartScreen
  warning. Needs an OV/EV certificate. Not blocking v0.1.0.
- **macOS build.** Deferred. Must reuse the webview path — do **not** revive the
  deleted VideoToolbox/Metal compositor. Tauri does not cross-compile, so add a
  macOS entry to the release matrix (already structured for it) plus an Apple
  Developer account for notarization.
- **SoundTouch.** Gordo wants to consider the original C++ via WASM, or Rust.
  Recommendation: **measure first, rank last.** The AudioWorklet's 128-sample
  quantum (~2.9 ms) is fixed by spec, and SoundTouch's WSOLA time-stretch needs a
  lookahead window that is identical in any language — so a port does not reduce
  the dominant latency. WASM buys CPU headroom and upstream quality, not latency.
  Rust would be a rewrite of ~10k lines of tuned DSP, and would only run on
  desktop — re-forking web and desktop, which was just deliberately un-forked.
  If profiling shows dropouts under 8-video load, go WASM. Note AudioWorklets
  cannot `fetch()`; the `.wasm` must be passed in as an ArrayBuffer via
  `processorOptions`.
- **Cloud-agent / Docker tooling — decision needed, not action.** Gordo is no
  longer using cloud agents here. Files existing only for that: `Dockerfile`,
  `docker-compose.yml`, `.cursor/environment.json`,
  `.cursor/install-cloud-tools.sh`, `scripts/cloud-agent-start.sh`,
  `docs/cursor-cloud-setup.md`, `verify:cloud-smoke`. **Do not delete without
  confirming** — the GPU sandbox is also the only way to run WebGPU browser
  gates on the 4090, which is useful independently of cloud agents.
