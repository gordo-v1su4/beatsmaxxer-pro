# fxlab — see what a shader actually does, without a GPU

Renders the module shader off-GPU and writes contact sheets, so an effect can be
judged by looking at it instead of by reading it.

```sh
bun run verify:fx            # every catalog module
bun run verify:fx leak vhs   # just these
```

Sheets land in `scripts/fxlab/.out/sheets/<module>.png` (git-ignored).

## Why it exists

Two problems it solves:

**WebGPU is not available everywhere the code is.** Cloud containers and CI have
no adapter (`navigator.gpu` resolves but `requestAdapter()` returns null, even
with SwiftShader forced), so shader work otherwise ships unseen. fxlab compiles
the shader to GLSL ES and runs it on WebGL2 over SwiftShader, which does work
headless.

**Looking at a preview is not the same as measuring it.** Rendering every type of
LIGHT LEAK side by side over a flat grey field is what showed that STREAK
produced *nothing at all* without a blown highlight in its path, and that VEIL
vanished at low SIZE. Neither was visible by reading the code, and both were
invisible over the QA clip.

## What the sheets show

Each sheet is two rows over one module:

- **row 1** the preview card (`hasVideo == 0`, so `sampleSource` falls back to
  `testCard`)
- **row 2** the same settings applied to a picture

with `p0` swept low/mid/high across each row. A module passes when the two rows
show the **same effect** and sweeping the control visibly changes **both**.

A card that hand-draws an impression of its own effect fails the first test: the
effect then runs on top of the drawing, so the preview advertises a look the
module cannot produce. A card that reads none of its params fails the second.
Note that a *neutral* card should ignore the params — the effect running over it
supplies the response. The question is whether the card draws a **subject** or
draws the **effect**.

## What it cannot show

fxlab feeds a **fixed frame** and a **black feedback texture**, at one beat
position. Four modules therefore render an unchanged video row, and that is
correct rather than a fault in them:

| Module | Where its effect actually happens |
|---|---|
| TIMESAMPLER | seeks the video element upstream of the shader |
| SPEEDRAMP | changes playback rate upstream of the shader |
| STUTTER | holds a frame in the feedback texture, which is black here |
| TRANSITION | only fires for a window every few bars, not continuously |

For these four the card is the only preview there can be, so it legitimately
draws the *gesture* -- a playhead that locks, ticks that accelerate -- rather
than a subject. Judge them on whether the card responds to its controls; the
video row cannot be evidence either way.

Everything else does the work in the fragment shader and shows up in both rows.

## Why naga

`build-glsl.ts` compiles `MODULE_FX_IDLE_WGSL` — the shader the app actually
ships — with [naga](https://github.com/gfx-rs/wgpu/tree/trunk/naga), the
reference WGSL front end. A hand-written GLSL copy would drift from the real
shader and the sheets would quietly start lying, which is the exact failure this
tool exists to catch.

The idle variant is used because `texture_external` cannot be compiled outside
WebGPU. It is `MODULE_FX_WGSL` with two string replacements swapping the video
texture for a 2D one, and the app depends on those paths being equivalent, so
the maths is identical.

## Prerequisites

| Needs | Install | Override |
|---|---|---|
| naga | `cargo install naga-cli` | `NAGA_BIN` |
| Chromium | `bunx playwright install chromium` | `FXLAB_CHROME` |

Both fail with an explanation rather than a stack trace.

## Environment traps

Three things cost real time to discover; they are handled in the code and
documented here so they are not rediscovered:

- **Y is flipped.** WebGL's framebuffer origin is bottom-left, the shader's UVs
  assume WebGPU's top-left. `render.ts` flips on readback.
- **naga must target `es300`.** `es310` compiles fine but WebGL2 rejects the
  version directive.
- **The bundled ffmpeg cannot read PNGs.** The Playwright build has a PNG
  *encoder* but no decoder, no `image2` demuxer and no pipe protocol, so frame
  sequences cannot be muxed with it. Video encoding goes through `MediaRecorder`
  in the browser instead (`pngs-to-webm.ts`).

## Uniform layout

`render.ts` packs uniforms by index, copied from `WebGpuEngine.encodeBinding`.
That layout is the contract between the two — change one and change the other,
or the sheets will render with the wrong parameters in the wrong slots.
