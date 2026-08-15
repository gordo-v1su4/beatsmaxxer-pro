/** Unified param-driven FX shader — beat-synced, no fake wall-clock rhythm. */
export const MODULE_FX_WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5));
  return output;
}

struct Uniforms {
  beat: f32,
  beatPhase: f32,
  bpm: f32,
  playing: f32,
  amplitude: f32,
  bassAmp: f32,
  mix: f32,
  effectMode: f32,
  p0: f32,
  p1: f32,
  p2: f32,
  p3: f32,
  accent: f32,
  pitchSemitones: f32,
  hasVideo: f32,
  colorR: f32,
  colorG: f32,
  colorB: f32,
  pitchNorm: f32,
  aspect: f32,
  aux1: f32,
  aux2: f32,
  positionSeconds: f32,
  fixedStepSeconds: f32,
  fixedStepIndex: u32,
  fixedStepPhase: f32,
  playbackRate: f32,
  generation: u32,
  deterministicSeed: u32,
  audioFrameId: u32,
  /** Beats since this module's last MIDI trigger, or < 0 to follow the beat
      grid. Same units as beatPhase, which is what lets it substitute directly.
      See beatPulse. */
  triggerAge: f32,
  /** The rack's groove from the PGM rail: 0 straight, 1 swing, 2 dotted. */
  feel: f32,
  /** Third and fourth live slots. LEAK carries BLADES and SQUEEZE here: it has
      seven real controls and only four p-slots, and both of these are physical
      properties of the lens rather than tuning knobs. */
  aux3: f32,
  aux4: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var videoTex: texture_external;
@group(0) @binding(2) var videoSampler: sampler;
@group(0) @binding(3) var feedbackTex: texture_2d<f32>;
@group(0) @binding(4) var feedbackSampler: sampler;

/**
 * How far into the current hit we are, decaying from 1 at the hit.
 *
 * This is the single point where MIDI substitutes for the track. Every module
 * that reacts to rhythm already routes through here, so handing this one
 * function a different clock makes the whole rack MIDI-drivable without a line
 * of per-module plumbing -- which is the reason the trigger is expressed as an
 * AGE IN BEATS rather than as a ready-made envelope. beatPhase is already
 * beats-since-the-last-beat, so a MIDI note's age drops straight into its place
 * and every caller keeps its own sharpness.
 *
 * triggerAge is negative when the module follows the transport, which is the
 * default and costs one comparison.
 */
fn beatPulse(sharpness: f32) -> f32 {
  let phase = select(u.beatPhase, u.triggerAge, u.triggerAge >= 0.0);
  return u.playing * exp(-phase * sharpness);
}

/** How much of an effect is on right now, given its BEAT control.
 *
 * The rack had two different ideas of what a BEAT knob does: some modules used
 * it to scale a small extra wobble on top of an always-on effect, others had no
 * beat term at all and simply sat there. Neither is what the control implies.
 * Here it is one rule, everywhere: at 0 the effect runs flat out and constant,
 * and as BEAT rises the effect is increasingly shaped by the beat envelope, so
 * it snaps in on the hit and falls away between hits.
 *
 * bass folds in the low end, so a kick drives the gate harder than a hi-hat.
 * With the transport stopped u.playing is 0, which collapses this to 1 and
 * leaves the effect fully on rather than stuck off.
 *
 * Declared after beatPulse deliberately: WGSL requires a function to be defined
 * before it is called.
 */
fn beatGate(amount: f32, sharpness: f32, bass: f32) -> f32 {
  let env = clamp(beatPulse(sharpness) + u.bassAmp * bass, 0.0, 1.0);
  return mix(1.0, env, clamp(amount, 0.0, 1.0) * u.playing);
}

/**
 * Where the groove puts the current segment: x = start beat, y = its length.
 *
 * The TypeScript twin of grooveSegment in runtime/groove.ts, and the rule has to
 * match it exactly -- one side quantising differently from the other is how
 * STUTTER ended up carrying its own copy with the swing ratio rounded to
 * 1.34/0.66 while the PGM rail used 4/3.
 *
 *   STRAIGHT  an even grid
 *   SWING     each PAIR splits 2:1, first hit at 4/3 of an interval
 *   DOTTED    an even grid of 1.5x
 *
 * Length is returned because under swing the two halves of a pair are different
 * sizes, so anything easing across a segment has to stretch with it.
 */
fn grooveSegmentFeel(beat: f32, intervalBeats: f32, mode: f32) -> vec2f {
  let safeBeat = max(beat, 0.0);
  let base = max(intervalBeats, 0.25);

  if (mode > 1.5) {
    let step = base * 1.5;
    return vec2f(floor(safeBeat / step) * step, step);
  }

  if (mode > 0.5) {
    let pairLength = base * 2.0;
    let pairStart = floor(safeBeat / pairLength) * pairLength;
    let longStep = base * (4.0 / 3.0);
    if (safeBeat < pairStart + longStep - 0.0001) {
      return vec2f(pairStart, longStep);
    }
    return vec2f(pairStart + longStep, pairLength - longStep);
  }

  return vec2f(floor(safeBeat / base) * base, base);
}

/** The rack groove, from the PGM rail. Modules with a local FEEL call
    grooveSegmentFeel directly and override it. */
fn grooveSegment(beat: f32, intervalBeats: f32) -> vec2f {
  return grooveSegmentFeel(beat, intervalBeats, floor(u.feel + 0.5));
}

fn accentRgb() -> vec3f {
  return vec3f(u.colorR, u.colorG, u.colorB);
}

fn rot2(p: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

/** Smooth value noise on a lattice. hash21 alone is white noise -- it can only
    ever produce grain. Interpolating it gives a field with SHAPE at a chosen
    scale, which is what separates fog from speckle. */
fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

/** Three octaves, rotated between each so the square lattice never lines up
    into visible axis-aligned structure. Normalised to 0..1. */
fn fbm3(p0: vec2f) -> f32 {
  var p = p0;
  var f = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 3; i = i + 1) {
    f = f + amp * valueNoise(p);
    p = rot2(p, 0.73) * 2.03;
    amp = amp * 0.5;
  }
  return f / 0.875;
}

/** Domain-warped fbm: fbm(p + fbm(p)). Feeding noise back into its own
    coordinates is what turns smooth blobs into the curdled, marbled structure
    real fog has. Plain fbm still reads as an airbrush; warped fbm does not. */
fn warpedFbm(p: vec2f) -> f32 {
  let q = fbm3(p);
  return fbm3(p + vec2f(q * 1.7, q * 1.1));
}

/** Per-pixel triangular dither at one 8-bit step.
    The render targets are rgba8unorm, and a light leak is a wide, shallow
    gradient -- the exact signal that bands into visible stair-steps at 8 bits.
    Two hashes make the noise triangular rather than uniform, which removes the
    banding without the flat "sand" a single uniform hash lays over the frame. */
fn dither8(uv: vec2f, seed: f32) -> f32 {
  let a = hash21(uv * 311.7 + vec2f(seed, seed * 1.7));
  let b = hash21(uv * 517.3 + vec2f(seed * 2.3, seed));
  return (a + b - 1.0) / 255.0;
}

/** Mirrored repeat that maps 0.5 back to 0.5, so a fold centred on the frame
    stays centred on the source. Folding with fract(x + 0.5) instead lands the
    centre of the frame on the corner of the source. */
fn mirrorRepeat(x: f32) -> f32 {
  return 1.0 - abs(fract(x * 0.5) * 2.0 - 1.0);
}

/** Fold x back into the band [c-h, c+h] by repeated reflection. Identity inside
    the band; outside it the source repeats mirrored, which is what draws the
    combed walls and picture-frame recursion the fold family is built on. */
fn foldBand(x: f32, c: f32, h: f32) -> f32 {
  let hh = max(h, 0.0008);
  let period = 4.0 * hh;
  let t = x - c + hh;
  let m = t - period * floor(t / period);
  return c + hh - abs(m - 2.0 * hh);
}

/** Reflect everything past a single plane back across it. Unlike foldBand this
    keeps one side of the frame verbatim — a plain mirror, not a tunnel. */
fn foldHalf(x: f32, pivot: f32, keepLow: f32) -> f32 {
  let d = abs(x - pivot);
  return pivot + select(d, -d, keepLow > 0.5);
}

/** The INCEPTION fold itself, in aspect-corrected centred space.
    Shared by the live effect and its idle card: the card used to draw a radial
    kaleidoscope, which is the one thing this effect explicitly is not, so the
    preview advertised a look the module could not produce. Running the real
    fold in both places means they cannot describe different effects again.
    kind selects one of twelve folds, shift walks it, band sets slab width,
    spin rotates the axis, pulse is the beat reaction. */
fn mirrorFoldPoint(
  p0: vec2f, kind: f32, shift: f32, band: f32, spin: f32, asp: f32, pulse: f32
) -> vec2f {
  var p = p0;
  if (kind < 0.5) {                        // MIR-L: keep the left, mirror right
    p.x = foldHalf(p.x, shift, 1.0);
  } else if (kind < 1.5) {                 // MIR-R
    p.x = foldHalf(p.x, shift, 0.0);
  } else if (kind < 2.5) {                 // MIR-D: the water-reflection look
    p.y = foldHalf(p.y, shift, 1.0);
  } else if (kind < 3.5) {                 // MIR-U
    p.y = foldHalf(p.y, shift, 0.0);
  } else if (kind < 4.5) {                 // QUAD: both planes at once
    p.x = foldHalf(p.x, shift, 1.0);
    p.y = foldHalf(p.y, shift, 1.0);
  } else if (kind < 5.5) {                 // SLAB-V: centre strip, combed walls
    p.x = foldBand(p.x, shift, band);
  } else if (kind < 6.5) {                 // SLAB-H
    p.y = foldBand(p.y, shift, band);
  } else if (kind < 7.5) {                 // BOX: the picture-frame recursion
    p.x = foldBand(p.x, 0.0, band * asp);
    p.y = foldBand(p.y, 0.0, band);
  } else if (kind < 8.5) {                 // COR-A: 45-degree corner fold
    let r = rot2(p, 0.7853982);
    p = rot2(vec2f(foldHalf(r.x, shift, 1.0), r.y), -0.7853982);
  } else if (kind < 9.5) {                 // COR-B: the other diagonal
    let r = rot2(p, -0.7853982);
    p = rot2(vec2f(foldHalf(r.x, shift, 1.0), r.y), 0.7853982);
  } else if (kind < 10.5) {                // TUNNEL: box driven deeper by beat
    let z = 1.0 + u.p2 * 2.5 + pulse * 1.6;
    let q = p * z;
    p = vec2f(foldBand(q.x, 0.0, band * asp), foldBand(q.y, 0.0, band));
  } else {                                 // SPIN: the fold axis rotates
    let r = rot2(p, spin);
    p = rot2(vec2f(foldBand(r.x, shift, band), r.y), -spin);
  }
  return p;
}

/** Shared idle-card treatment: graphics fade to black toward the top and bottom
    of the lower band so every module's idle reads as one family. */
fn idleFade(y: f32) -> f32 {
  return 0.22 + 0.78 * smoothstep(0.50, 0.18, abs(y - 0.5));
}

/**
 * The shared subject for every module that FILTERS the picture rather than
 * moving it: LEAK, GRAIN, HALATION, VHS, ANAMORPHIC and STREAK.
 *
 * Each of those used to hand-draw an impression of its own output -- speckle for
 * GRAIN, a bloom for HALATION, scanlines and a tear for VHS -- and the real
 * effect then ran on top of that drawing. The preview showed a fake plus a real
 * one, and the fake, being unconnected to any control, always won.
 *
 * A filter needs something to act ON, and a flat card supplies none of what any
 * of them key off. This subject carries all of it in one place:
 *
 *   deep shadow ground   fog and bleed lift the blacks first; on a bright card
 *                        there is nothing to lift
 *   a blown practical    HALATION, LEAK's core and STREAK's flare are all
 *                        highlight-selective and render NOTHING without one
 *   a highlight ladder   four marks from dim to blown, so sweeping a THRESHOLD
 *                        visibly changes which of them survive
 *   hard-edged midtones  a directional blur or a chroma bleed is only legible
 *                        against an edge
 *
 * Six callers, one implementation: this replaced six separate bespoke drawings,
 * so the idle branch of the shader got materially smaller, not larger.
 *
 * The subject is built as TONE and tinted by the caller's accent. Every cue
 * above is a brightness cue, so the tint costs none of them, and it settles the
 * one thing this card got wrong: hardcoded in warm greys and beiges it was the
 * single photograph in a rack of accent-coloured schematics, which read as a
 * different app pasted into the slot. LEAK's card is now orange, GRAIN's straw,
 * VHS's neutral -- each the colour of its own title, like every other module.
 */
fn idlePictureSubject(p: vec2f, asp: f32, fade: f32, acc: vec3f) -> vec3f {
  var col = vec3f(0.0);
  let horizon = 0.62;

  // Sky: dark at the top, lifting toward the horizon.
  col += mix(acc * 0.05, acc * 0.26, smoothstep(0.05, horizon, p.y)) * fade;
  // Ground: near black, the region fogging is measured against.
  col += acc * 0.03 * step(horizon, p.y);

  // Blown practical, off centre and pinned near 1.0. The core stays near-white
  // deliberately: HALATION, LEAK's core and STREAK's flare are all
  // highlight-selective, and an accent-tinted highlight is by definition not a
  // blown one -- the tint spends the very luminance they threshold against. The
  // falloff around it carries the module colour instead, which is also what a
  // hot practical actually looks like.
  let lamp = vec2f((p.x - 0.66) * asp, p.y - 0.34);
  let lr = length(lamp);
  col += vec3f(1.0, 0.97, 0.92) * smoothstep(0.055, 0.0, lr);
  col += acc * smoothstep(0.22, 0.03, lr) * 0.55 * fade;

  // Midtone blocks with hard edges.
  let b1 = step(0.06, p.x) * step(p.x, 0.20) * step(0.30, p.y) * step(p.y, horizon);
  let b2 = step(0.24, p.x) * step(p.x, 0.34) * step(0.44, p.y) * step(p.y, horizon);
  let b3 = step(0.82, p.x) * step(p.x, 0.95) * step(0.38, p.y) * step(p.y, horizon);
  col += acc * 0.22 * (b1 + b2 + b3) * fade;
  // No lit-window grid on the blocks. It was pure set dressing -- none of the
  // six filters keys off it -- and at card size it stopped reading as windows
  // and just became a rash of little squares competing with the practical and
  // the ladder, which are the two things that actually have to be seen.

  // Highlight ladder along the ground: 0.30, 0.50, 0.72, 1.00. The rungs walk
  // from accent toward white as they climb, so the ladder still spans the whole
  // tonal range a THRESHOLD sweeps through -- the dim end simply reads in the
  // module's colour rather than in grey.
  for (var i = 0; i < 4; i = i + 1) {
    let fi = f32(i);
    let d = length(vec2f((p.x - (0.12 + fi * 0.13)) * asp, p.y - 0.78));
    col += mix(acc, vec3f(1.0), fi / 3.0) * (0.30 + fi * 0.235)
         * smoothstep(0.030, 0.012, d);
  }

  // Accent baseline on the horizon, keeping the house style.
  col += acc * smoothstep(0.006, 0.0, abs(p.y - horizon)) * 0.55 * fade;
  return col;
}

/** Per-module idle graphic, drawn in the lower band of the test card. Each one
    shows what the module DOES before any clip is loaded, in a shared house style:
    dark ground, accent-coloured marks, faded top and bottom.
    p = position in the band (0-1 across, 0-1 down), t = beat clock. */
fn idleGraphic(p: vec2f, mode: f32, t: f32) -> vec3f {
  let asp = max(u.aspect, 0.0001);
  let fade = idleFade(p.y);
  let acc = accentRgb();
  var col = vec3f(0.045, 0.05, 0.06);

  if (mode == 1.0) {
    // TRANSITION — chevrons marching in the direction of the selected move
    let gr = fract(p * vec2f(asp * 5.0, 5.0));
    col += vec3f(0.045) * step(0.95, max(gr.x, gr.y));
    let kind = floor(clamp(u.p2, 0.0, 1.0) * 100.0 + 0.5);
    var dir = vec2f(1.0, 0.0);
    if (kind < 0.5) { dir = vec2f(-1.0, 0.0); }
    else if (kind < 1.5) { dir = vec2f(1.0, 0.0); }
    else if (kind < 2.5) { dir = vec2f(0.0, 1.0); }
    else if (kind < 3.5) { dir = vec2f(0.0, -1.0); }
    let along = dot(p - vec2f(0.5), dir) * 4.0 - t * 1.4;
    let lane = abs(dot(p - vec2f(0.5), vec2f(-dir.y, dir.x)));
    let chev = smoothstep(0.78, 0.9, fract(along + lane * 1.5)) * smoothstep(0.42, 0.0, lane);
    col += acc * chev * 0.6 * fade;
  } else if (mode == 2.0) {
    // SPEEDRAMP — film-strip ticks that visibly accelerate and crawl with the rate
    let x = fract(p.x * 7.0 - t * 1.4 * max(u.aux1, 0.05));
    let tick = smoothstep(0.10, 0.03, abs(x - 0.5));
    col += acc * tick * (0.2 + 0.55 * smoothstep(0.4, 0.0, abs(p.y - 0.5))) * fade;
    col += vec3f(0.35) * smoothstep(0.004, 0.0, abs(p.x - 0.5)) * 0.5;
  } else if (mode == 3.0) {
    // STUTTER — a playhead that runs, then LOCKS for the rest of the division.
    // Previously this drew delay taps sweeping across the frame, which described
    // an echo the module no longer performs. What it does now is hold a frame:
    // so the card runs a marker forward for a sliver at the top of each division
    // and freezes it in place until the next one, which is the gesture itself.
    // p0 = LEN, p1 = HOLD, p2 = FEEL.
    var seg3 = stutterLenBeats(u.p0);
    let feel3 = floor(clamp(u.p2, 0.0, 1.0) * 100.0 + 0.5);
    if (feel3 > 1.5) {
      seg3 = seg3 * 1.5;
    } else if (feel3 > 0.5) {
      let pair3 = floor(u.beat / (seg3 * 2.0));
      let inPair3 = u.beat - pair3 * seg3 * 2.0;
      if (inPair3 < seg3 * 1.34) { seg3 = seg3 * 1.34; } else { seg3 = seg3 * 0.66; }
    }
    let prog3 = clamp((u.beat - floor(u.beat / seg3) * seg3) / seg3, 0.0, 1.0);
    let holdAmt = clamp(u.p1, 0.0, 1.0);

    // Ghost of the free-running playhead, so the freeze is legible as a freeze.
    let free = fract(u.beat / max(seg3, 0.0001));
    col += acc * smoothstep(0.010, 0.0, abs(p.x - free)) * 0.18 * fade;

    // The held position: advances only during the capture window.
    let heldX = min(prog3, 0.10) / 0.10 * mix(1.0, 0.12, holdAmt);
    col += acc * smoothstep(0.014, 0.0, abs(p.x - heldX))
         * (0.45 + 0.55 * smoothstep(0.45, 0.0, abs(p.y - 0.5))) * fade;

    // Division ticks, so the grid FEEL produces is visible without a clip.
    for (var i = 0; i < 8; i = i + 1) {
      let tx = f32(i) / 8.0;
      col += acc * smoothstep(0.004, 0.0, abs(p.x - tx)) * 0.10 * fade;
    }
    col += acc * exp(-prog3 * 9.0) * 0.20 * holdAmt * fade;
  } else if (mode == 4.0) {
    // TIMESAMPLER — a piano roll that SCRUBS AND TELEPORTS, because that is what
    // the module does: the picture jumps to another slice and plays on from
    // there. The roll used to advance as a plain linear ramp, which is the
    // one thing a sampler never does — it read as a metronome, so nothing in the
    // card told you a jump had happened.
    // p0 = rate, p1 = slices. jumpIdx changes on every slice division; the roll
    // snaps to a new offset there and scrubs on until the next one.
    let slices = 4.0 + floor(clamp(u.p1, 0.0, 1.0) * 12.0);
    let rate = 0.5 + clamp(u.p0, 0.0, 1.0) * 2.2;
    let playhead = t * rate;
    let jumpIdx = floor(playhead);
    let slot = floor(hash21(vec2f(jumpIdx, 3.7)) * slices);
    let jump = slot / max(slices, 1.0) * 5.0;
    let gx = p.x * asp * 3.2 + fract(playhead) * 1.6 + jump;
    let gy = p.y * 6.0;
    let ci = floor(gx);
    let fx = fract(gx);
    let isBar = step(fract(ci * 0.25), 0.01);
    col += vec3f(0.05, 0.055, 0.065) * step(0.95, fract(gy)) * (0.4 + 0.6 * fade);
    col += acc * smoothstep(0.06, 0.0, fx) * isBar * 0.22 * fade;
    let lane = fract(ci / 6.0) * 6.0;
    let len = 0.55 + 0.30 * hash21(vec2f(ci, 9.1));
    let inLane = step(floor(lane), gy) * step(gy, floor(lane) + 1.0);
    let body = smoothstep(0.02, 0.12, fx) * smoothstep(len, len - 0.14, fx);
    let laneBody = smoothstep(0.10, 0.24, fract(gy)) * smoothstep(0.92, 0.78, fract(gy));
    let note = inLane * laneBody * body;
    col += acc * note * (0.55 + 0.35 * hash21(vec2f(ci, 5.3))) * 0.6 * fade;
    col += vec3f(0.9) * smoothstep(0.006, 0.0, abs(p.x - 0.5)) * 0.45;
    // The landing needs to be legible or the teleport just looks like a stutter:
    // brief wash right after each jump, decaying over the first part of the slice.
    col += acc * exp(-fract(playhead) * 9.0) * 0.30 * fade;
  } else if (mode == 5.0) {
    // PUNCH ZOOM — feathered bullseye target the crash zoom reads against
    let c = vec2f((p.x - 0.5) * asp, p.y - 0.5);
    let r = length(c);
    let rings = smoothstep(0.030, 0.010, abs(r - 0.12))
              + smoothstep(0.030, 0.010, abs(r - 0.27))
              + smoothstep(0.030, 0.010, abs(r - 0.42));
    let halo = smoothstep(0.065, 0.0, abs(r - 0.12))
             + smoothstep(0.065, 0.0, abs(r - 0.27))
             + smoothstep(0.065, 0.0, abs(r - 0.42));
    col += acc * (rings * 0.62 + halo * 0.26) * fade;
    let cross = min(abs(c.x), abs(c.y));
    col += acc * (smoothstep(0.016, 0.004, cross) * 0.42) * step(r, 0.5) * fade;
    col += vec3f(0.95) * smoothstep(0.045, 0.0, r) * 0.7 * fade;
  } else if (mode == 6.0) {
    // HANDHELD — horizon and level grid, so the wobble reads against straight lines
    let hLine = smoothstep(0.009, 0.0, abs(fract(p.y * 4.0 + 0.5) - 0.5) / 4.0);
    let vLine = smoothstep(0.009, 0.0, abs(fract(p.x * asp * 4.0 + 0.5) - 0.5) / (asp * 4.0));
    col += vec3f(0.16, 0.17, 0.20) * max(hLine, vLine) * (0.35 + 0.65 * fade);
    col += acc * (smoothstep(0.022, 0.006, abs(p.y - 0.5)) * 0.7
                + smoothstep(0.07, 0.0, abs(p.y - 0.5)) * 0.26) * fade;
    let marks = step(abs(p.y - 0.5), 0.07) * smoothstep(0.82, 0.92, fract(p.x * asp * 8.0));
    col += acc * marks * 0.55 * fade;
  } else if (mode == 7.0) {
    // DRIFT CAM — map grid with X landmarks the dolly pans across
    let g = p * vec2f(asp * 6.0, 6.0);
    col += vec3f(0.09, 0.10, 0.12) * step(0.92, max(fract(g.x), fract(g.y))) * (0.35 + 0.65 * fade);
    for (var i = 0; i < 5; i = i + 1) {
      let fi = f32(i);
      let lp = vec2f(hash21(vec2f(fi, 2.7)), hash21(vec2f(7.7, fi)));
      let d = vec2f((p.x - lp.x) * asp, p.y - lp.y);
      let xm = smoothstep(0.014, 0.004, abs(abs(d.x) - abs(d.y)))
             * smoothstep(0.036, 0.028, max(abs(d.x), abs(d.y)));
      col += acc * xm * 0.8 * fade;
      col += acc * smoothstep(0.10, 0.0, length(d)) * 0.20 * (1.0 + 0.5 * sin(t * 2.0 + fi * 2.1)) * fade;
    }
  } else if (mode == 8.0) {
    // RACK FOCUS — outlined shapes sitting at different depths: far = small and
    // soft, near = big and crisp, so a focus pull is unmistakable
    let g = p * vec2f(asp * 6.0, 6.0);
    col += vec3f(0.05, 0.055, 0.065) * step(0.93, max(fract(g.x), fract(g.y))) * (0.35 + 0.65 * fade);
    for (var i = 0; i < 5; i = i + 1) {
      let fi = f32(i);
      let z = fi / 4.0;
      let sp = vec2f(0.14 + fi * 0.18 + sin(t * 0.25 + fi * 2.1) * 0.012,
                     0.35 + 0.34 * hash21(vec2f(fi, 4.2)));
      let d = vec2f((p.x - sp.x) * asp, p.y - sp.y);
      let sz = 0.035 + z * 0.075;
      let m3 = fract(fi / 3.0) * 3.0;
      var m = length(d);
      if (m3 >= 0.5 && m3 < 1.5) { m = abs(d.x) + abs(d.y); }
      else if (m3 >= 1.5) { m = max(abs(d.x), abs(d.y)); }
      let w = 0.014 - z * 0.006;
      col += acc * smoothstep(w + 0.010, w * 0.5, abs(m - sz)) * (0.22 + z * 0.42) * fade;
    }
  } else if (mode == 9.0) {
    // ANAMORPHIC -- the subject, not the bars.
    //
    // This drew its own scope bars at a FIXED 0.17/0.83 plus a blue flare, and
    // effectAnamorphic then drew bars at 0.055 + BARS * 0.155 and a flare of its
    // own on top. Two sets of bars at different heights, and the drawn pair did
    // not move when BARS did -- so the control looked broken while working.
    col += idlePictureSubject(p, asp, fade, acc);
  } else if (mode == 10.0) {
    // FILM GRAIN -- the stock, not the grain.
    //
    // This drew its own speckle at a fixed 110 cells on a fixed weave, and
    // effectGrain then added real grain over it. The drawn speckle was coarser
    // than anything SIZE could produce and swamped it, which is exactly why the
    // 16MM/GATE/WEAVE selector and the SIZE and DRIFT sliders appeared dead.
    // effectGrain also weights itself by 4L(1-L) so grain lives in the midtones,
    // which needs a real tonal range to show.
    col += idlePictureSubject(p, asp, fade, acc);
  } else if (mode == 11.0) {
    // LIGHT LEAK -- a gradient only. Nothing on this card is a drawn shape.
    //
    // Two earlier versions put discrete marks here: first three accent discs,
    // then three highlight dots to feed the ghost chain. Both read as OBJECTS
    // sitting on the card, and because neither depended on p0-p3 they stayed
    // put through all seven TYPEs -- exactly the fault this file already
    // documents for PRISM and ANAMORPHIC, committed twice more.
    //
    // A third attempt replaced the dots with a bright directional wash, which
    // removed the objects but broke the card the other way: subject and leak are
    // both painted in the accent, so a bright card leaves the leak nothing to
    // read against and the preview showed a plain gradient.
    //
    // The requirements only looked contradictory. IRIS and ANAMO now synthesise
    // a virtual light source whenever no clip is loaded, so they need nothing
    // drawn here at all -- which frees this card to be what a leak actually
    // needs: black. Every lit pixel on it comes from effectLeak.
    let q = vec2f((p.x - 0.5) * asp, p.y - 0.5);
    col += acc * 0.05 * (1.0 - smoothstep(0.10, 0.66, length(q)));
  } else if (mode == 12.0) {
    // DUTCH ANGLE -- a LEVEL horizon. The card must not tilt.
    //
    // This used to rotate its own grid by sin(t * 0.6) * 0.42, and effectDutch
    // then rotated the result again. The card's own angle was large, fixed by
    // the clock rather than by the controls, and swamped the module's actual
    // tilt -- so the preview showed the same steep diagonal at TILT 15, 50 and
    // 90. A tilt is only readable against something known to be straight, so
    // the subject is now level and the effect supplies every degree of angle.
    let q = vec2f((p.x - 0.5) * asp, p.y - 0.5);
    col += vec3f(0.09, 0.10, 0.12) * step(0.93, fract(q.y * 5.0 + 0.5)) * fade;
    col += vec3f(0.09, 0.10, 0.12) * step(0.93, fract(q.x * 5.0 + 0.5)) * fade;
    col += acc * smoothstep(0.014, 0.003, abs(q.y)) * 0.9 * fade;
    col += acc * smoothstep(0.06, 0.0, abs(q.y)) * 0.18 * fade;
    // Verticals at the sides: a horizon alone can read as level when it is not.
    col += vec3f(0.30, 0.32, 0.38)
         * smoothstep(0.010, 0.002, abs(abs(q.x) - 0.34 * asp)) * 0.5 * fade;
  } else if (mode == 13.0) {
    // HALATION -- the highlights, not the halo.
    //
    // This pre-drew the bloom: a hot core and two soft rings, which is the
    // module's output rather than its input. effectHalation keys off luminance
    // above THRESHOLD, so the honest subject is a set of highlights at DIFFERENT
    // brightnesses -- the ladder in the shared subject -- and sweeping THRESHOLD
    // then visibly changes which of them bloom and which stay clean.
    col += idlePictureSubject(p, asp, fade, acc);
  } else if (mode == 14.0) {
    // BARREL -- a FLAT grid. The card must not bulge.
    //
    // This used to push its own grid out through the centre by
    // 1 + 1.5r^2 * (0.55 + 0.45 sin(t)), and effectBulge then bulged it again.
    // The card's warp was driven by the clock rather than by AMOUNT, so the
    // preview bulged identically whether the module was set to pinch, to bulge,
    // or to sit flat. Straight lines are the only thing a lens distortion is
    // legible against.
    let c = vec2f((p.x - 0.5) * asp, p.y - 0.5);
    let r = length(c);
    let gr = fract((c + vec2f(0.5)) * vec2f(asp * 7.0, 7.0));
    col += acc * step(0.90, max(gr.x, gr.y)) * 0.55 * fade;
    col += vec3f(0.85) * smoothstep(0.028, 0.0, r) * 0.3;
  } else if (mode == 15.0) {
    // VHS / CAM -- the tape's subject, not the tape damage.
    //
    // This drew scanlines, a rolling tear AND a chroma split, which is all three
    // things effectVhs does -- then effectVhs did them again. The drawn tear ran
    // on the wall clock at a fixed rate, so TRACKING, CHROMA, NOISE and BEAT all
    // appeared to do nothing against it. Chroma bleed and a tracking tear are
    // only legible across a hard edge, which the shared subject provides.
    col += idlePictureSubject(p, asp, fade, acc);
  } else if (mode == 17.0) {
    // PRISM -- deliberately NOT a drawing of a chromatic split.
    //
    // This used to hand-draw three coloured lines at a fixed spread of
    // 0.030 + 0.018*sin(t). It read none of p0/p1/p2, so SPLIT, ANGLE and EDGE
    // could not change the card no matter what they were set to, and the
    // picture it advertised was not the one the module produces.
    //
    // effectPrism runs over this card exactly as it runs over video, so the
    // honest subject is a neutral, high-contrast one: an RGB split is only
    // visible as fringing on edges that have luminance contrast and no colour
    // of their own. Splitting something already red, green and blue shows
    // nothing, which is the other half of why the controls looked dead.
    let bars = step(0.62, fract(p.x * 7.0));
    let ring = smoothstep(0.020, 0.004,
      abs(length(vec2f((p.x - 0.5) * asp, p.y - 0.5)) - 0.30));
    col += vec3f(0.90) * bars * fade * 0.5;
    col += vec3f(0.95) * ring * fade;
  } else if (mode == 18.0) {
    // MOTION STREAK -- the thing being smeared, not the smear.
    //
    // This drew four comet heads already dragging trails, and effectStreak then
    // smeared those trails again. A directional blur is legible only against a
    // SHARP edge, and the card supplied none -- everything in it was pre-blurred
    // along the same axis the effect blurs on, so LENGTH and DECAY had almost
    // nothing left to act on. The ladder of small bright marks in the shared
    // subject is what a streak pulls into lines.
    col += idlePictureSubject(p, asp, fade, acc);
  } else if (mode == 19.0) {
    // INCEPTION — the real fold, run over a deliberately lopsided scene.
    // A symmetric figure looks identical before and after mirroring, so the
    // card has to be asymmetric in both axes for MIR-L, MIR-D, QUAD and the
    // slabs to read as different from each other at all.
    let kind = floor(clamp(u.p0, 0.0, 1.0) * 11.0 + 0.5);
    let pulse = beatPulse(5.0) * u.p3;
    let shift = (u.p1 - 0.5) * 0.7;
    let band = mix(0.42, 0.07, abs(u.p1 - 0.5) * 2.0) * (1.0 - pulse * 0.35);
    let spin = (u.p2 - 0.5) * 3.14159265 + pulse * 0.5;

    let src = mirrorFoldPoint(
      vec2f((p.x - 0.5) * asp, p.y - 0.5), kind, shift, band, spin, asp, pulse
    );
    let g = vec2f(src.x / asp + 0.5, src.y + 0.5);

    // Lopsided scene: a tall pillar left of centre, a low horizon, and a disc
    // up and to the right. Drifts slowly so folds stay legible while static.
    let drift = sin(t * 0.35) * 0.04;
    var s = 0.0;
    s += smoothstep(0.022, 0.0, abs(g.x - (0.30 + drift))) * smoothstep(0.78, 0.74, g.y);
    s += smoothstep(0.014, 0.0, abs(g.y - 0.76)) * 0.85;
    s += smoothstep(0.075, 0.045, length((g - vec2f(0.70, 0.34)) * vec2f(asp, 1.0)));
    col += acc * clamp(s, 0.0, 1.4) * 0.85 * fade;

    // Seam marker: where the fold plane actually sits, so walking p1 is visible.
    col += vec3f(0.85) * smoothstep(0.004, 0.0, abs(src.x - shift)) * 0.20 * fade;
  } else if (mode == 20.0) {
    // SPECIALTY LENS -- a FLAT grid and a TRUE circle. The card must not bend.
    //
    // This used to bend its own grid by 1 + 2r^2 and pulse its ring on the beat,
    // and effectLens then bent the result again through its own glass and beat
    // gate. Both halves of the module were therefore pre-drawn: the preview
    // showed a fisheye whether GLASS was set to fisheye, to neutral, or to tele
    // crush, and it breathed on the beat whether or not BEAT was up.
    //
    // A circle is the honest reference here: tele flattening and fisheye bulge
    // pull it out of round in opposite directions, which a grid alone shows far
    // less clearly.
    let c = vec2f((p.x - 0.5) * asp, p.y - 0.5);
    let r = length(c);
    let gr = fract((c + vec2f(0.5)) * vec2f(asp * 6.0, 6.0));
    col += acc * step(0.90, max(gr.x, gr.y)) * smoothstep(0.62, 0.08, r) * 0.65 * fade;
    col += acc * smoothstep(0.012, 0.003, abs(r - 0.30)) * 0.8 * fade;
    col += vec3f(0.85) * smoothstep(0.035, 0.0, r) * 0.32;
  } else {
    // any future module before it earns bespoke art: fine scan lines
    col += acc * step(0.5, fract(p.y * 120.0 + t * 2.0)) * 0.08 * fade;
  }
  return col;
}

/** Test card shown when no clip is loaded: the module's own idle graphic fills
    the whole preview, matching the shared house style (dark ground, accent
    marks). */
fn testCard(uv: vec2f) -> vec3f {
  let t = u.beat;
  let mode = floor(u.effectMode + 0.5);
  var col = idleGraphic(uv, mode, t);
  // beat flash marker, top-left corner
  let mk = step(max(abs(uv.x - 0.03) * max(u.aspect, 0.0001), abs(uv.y - 0.04)), 0.028);
  col = mix(col, accentRgb(), mk * beatPulse(10.0) * 0.9);
  return clamp(col, vec3f(0.0), vec3f(1.0));
}

/* External-video sampling is explicitly clamped and does not use implicit
   derivatives, so it remains valid from effect branches with non-uniform UVs. */
fn sampleSource(uv: vec2f) -> vec3f {
  var col: vec3f;
  if (u.hasVideo > 0.5) {
    // Clean source read. A pitch-driven chroma split used to live here, which
    // meant ANY key/pitch offset smeared RGB fringing across every module at
    // once. Chroma split is now only where an effect actually asks for it
    // (tapdelay accents, timesampler RGB hit mode, prism/film looks).
    let c = textureSampleBaseClampToEdge(videoTex, videoSampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
    col = pow(max(c.rgb, vec3f(0.0)), vec3f(0.95));
  } else {
    col = testCard(uv);
  }
  return col;
}

/* For effects that MOVE the camera. Clamping a sample point that has walked
   off the frame pins it to one border texel and smears that pixel into a
   streak, which is the thing that reads as broken. Mirroring continues the
   shot back on itself instead, so the edge looks like more picture.

   Deliberately not used for blur or bloom taps: those want the edge colour
   held, and folding bright content back in would invent highlights. */
fn sampleSourceMirrored(uv: vec2f) -> vec3f {
  return sampleSource(vec2f(mirrorRepeat(uv.x), mirrorRepeat(uv.y)));
}

fn sampleFeedback(uv: vec2f) -> vec3f {
  let dims = textureDimensions(feedbackTex);
  if (dims.x < 2u || dims.y < 2u) { return vec3f(0.0); }
  return textureSampleLevel(feedbackTex, feedbackSampler, uv, 0.0).rgb;
}

/** Beats per transition cycle: the 7 zones the UI exposes (1BT .. 8BAR). */
fn transitionIntervalBeats(p: f32) -> f32 {
  let zone = min(6.0, floor(clamp(p, 0.0, 0.999) * 7.0));
  if (zone < 0.5) { return 1.0; }
  else if (zone < 1.5) { return 2.0; }
  else if (zone < 2.5) { return 4.0; }
  else if (zone < 3.5) { return 8.0; }
  else if (zone < 4.5) { return 16.0; }
  else if (zone < 5.5) { return 24.0; }
  return 32.0;
}

/** One sample of the moving frame at eased progress e. 16 real moves — each one
    re-samples the SOURCE at an offset/rotation/scale, so the picture actually
    travels rather than being tinted. */
fn transSample(uv: vec2f, kind: f32, e: f32) -> vec3f {
  let asp = max(u.aspect, 0.0001);
  if (kind < 0.5) { return sampleSource(fract(uv + vec2f(-e, 0.0))); }          // whip L
  else if (kind < 1.5) { return sampleSource(fract(uv + vec2f(e, 0.0))); }      // whip R
  else if (kind < 2.5) { return sampleSource(fract(uv + vec2f(0.0, e))); }      // push U
  else if (kind < 3.5) { return sampleSource(fract(uv + vec2f(0.0, -e))); }     // push D
  else if (kind < 4.5) {                                                        // wipe
    if (uv.x < e) { return sampleSource(vec2f(uv.x - e + 1.0, uv.y)); }
    return sampleSource(uv);
  }
  else if (kind < 5.5) {                                                        // camera roll
    var c = uv - vec2f(0.5);
    c.x *= asp;
    c = rot2(c, e * 6.28318530718);
    c.x /= asp;
    return sampleSource(fract(c + vec2f(0.5)));
  }
  else if (kind < 6.5) {                                                        // zoom punch
    let z = 1.0 + sin(e * 3.14159265) * 2.2;
    return sampleSource(clamp((uv - vec2f(0.5)) / z + vec2f(0.5), vec2f(0.0), vec2f(1.0)));
  }
  else if (kind < 7.5) {                                                        // glitch cut
    let burst = sin(e * 3.14159265);
    let row = floor(uv.y * 24.0);
    let d = (hash21(vec2f(row, floor(e * 14.0))) - 0.5) * burst * 0.5;
    var g = sampleSource(fract(uv + vec2f(d, 0.0)));
    let sp = burst * 0.02;
    g.r = sampleSource(fract(uv + vec2f(d + sp, 0.0))).r;
    g.b = sampleSource(fract(uv + vec2f(d - sp, 0.0))).b;
    return g;
  }
  else if (kind < 8.5) {                                                        // tilt / dutch rock
    var c = uv - vec2f(0.5);
    c.x *= asp;
    c = rot2(c, sin(e * 3.14159265) * 0.45);
    c.x /= asp;
    return sampleSource(fract(c + vec2f(0.5)));
  }
  else if (kind < 9.5) {                                                        // spin + zoom dip
    var c = uv - vec2f(0.5);
    c.x *= asp;
    c = rot2(c, e * 6.28318530718);
    c.x /= asp;
    let z = 1.0 - sin(e * 3.14159265) * 0.35;
    return sampleSource(fract(c / z + vec2f(0.5)));
  }
  else if (kind < 10.5) {                                                       // zoom pull-back
    let z = 1.0 - sin(e * 3.14159265) * 0.65;
    return sampleSource(fract((uv - vec2f(0.5)) / z + vec2f(0.5)));
  }
  else if (kind < 11.5) {                                                       // venetian bars
    let rowDir = (fract(floor(uv.y * 8.0) * 0.5) * 2.0 - 0.5) * 2.0;
    return sampleSource(fract(uv + vec2f(rowDir * e, 0.0)));
  }
  else if (kind < 12.5) {                                                       // iris
    let c = vec2f((uv.x - 0.5) * asp, uv.y - 0.5);
    let ap = 0.8 * (1.0 - sin(e * 3.14159265)) + 0.001;
    return sampleSource(uv) * (1.0 - smoothstep(ap, ap + 0.03, length(c)));
  }
  else if (kind < 13.5) {                                                       // diagonal slice
    let band = step(0.5, fract((uv.x + uv.y) * 3.0));
    let d = (band * 2.0 - 1.0) * e * 0.7;
    return sampleSource(fract(uv + vec2f(d, -d)));
  }
  else if (kind < 14.5) {                                                       // white flash
    return mix(sampleSource(uv), vec3f(1.0), sin(e * 3.14159265) * 0.9);
  }
  // defocus dip
  let b = sin(e * 3.14159265) * 0.05;
  var acc = vec3f(0.0);
  for (var i = 0; i < 6; i = i + 1) {
    let a = f32(i) / 6.0 * 6.28318530718;
    acc += sampleSource(clamp(uv + vec2f(cos(a), sin(a)) * b, vec2f(0.0), vec2f(1.0)));
  }
  return acc / 6.0;
}

/** Beat-quantized transition pack: fires at the tail of every N-beat cycle and
    motion-blurs along the move. p2 = type (0-15), p3 = interval zone,
    p1 = move length in beats, p0 = motion blur / intensity. */
fn effectTransition(col: vec3f, uv: vec2f) -> vec3f {
  let kind = floor(clamp(u.p2, 0.0, 1.0) * 100.0 + 0.5);
  let amount = u.p0;
  let intervalBeats = transitionIntervalBeats(u.p3);
  let durBeats = 0.15 + u.p1 * 0.85;

  // On the rack groove, not a plain modulo. This ran straight through a swung
  // song no matter what the PGM rail said, so the one module whose entire job is
  // arriving on the beat arrived on the wrong one.
  let seg = grooveSegment(u.beat, intervalBeats);
  let beatInCycle = u.beat - seg.x;
  // The move keeps its own length and lands ON the boundary, so a short swing
  // segment shortens the gap before the move rather than squashing the move.
  let start = max(seg.y - durBeats, 0.0);
  if (beatInCycle < start) { return col; }

  let p = clamp((beatInCycle - start) / max(seg.y - start, 0.0001), 0.0, 1.0);
  // ease in-out so the move snaps like a whip instead of sliding linearly
  var e = 2.0 * p * p;
  if (p >= 0.5) { e = 1.0 - pow(-2.0 * p + 2.0, 2.0) / 2.0; }

  let blurSpan = (0.02 + amount * 0.1) * sin(p * 3.14159265);
  var wet = vec3f(0.0);
  for (var i = 0; i < 6; i = i + 1) {
    let o = (f32(i) / 5.0 - 0.5) * blurSpan;
    wet += transSample(uv, kind, clamp(e + o, 0.0, 1.0));
  }
  wet /= 6.0;
  return wet * (1.0 + sin(p * 3.14159265) * amount * 0.25);
}

/** SPEEDRAMP is the time remap and nothing else. The remap happens upstream
    (video.playbackRate from the bezier solve in JS), so the shader's job here is
    to stay out of the way and pass the frame through untouched.

    This used to add a "look of speed" on top: a 5-tap horizontal blur, a chroma
    split, and a rate-driven gain shift, all scaled by distance from 1x. None of
    it was exposed as a parameter, so there was no way to turn it off — the ramp
    softened and fringed the picture on every curve and the operator had no
    control that explained why. The split also assigned wet.r/wet.b from sharp
    source samples while wet.g kept the blurred value, so the three channels
    disagreed about both position and sharpness at once. */
fn effectSpeedRamp(col: vec3f, uv: vec2f) -> vec3f {
  return col;
}

/** Stutter length in beats from the LEN zones the UI exposes (1/32 .. 1/4). */
fn stutterLenBeats(p: f32) -> f32 {
  if (p < 0.2) { return 0.125; }
  else if (p < 0.4) { return 0.25; }
  else if (p < 0.6) { return 0.33333; }
  else if (p < 0.8) { return 0.5; }
  return 1.0;
}

/** STUTTER — grab one frame on the division and hold it until the next one.

    This module was a feedback echo: it dragged the previous output through a
    zoom and a drift so trails smeared over time. That is neither of the two
    things the rack needs. A smear has no edge, so nothing landed on the beat,
    and it occupied the same ground as TIMESAMPLER without doing that job either.
    In Looperator terms the rack wants a LOOP and a SLICE: repeat a chunk in
    place, or jump between chunks. This is the LOOP half -- TIMESAMPLER, which
    genuinely seeks between slices upstream, is the SLICE half.

    The freeze is the ping-pong buffer used as a hold rather than as a trail:
    live source passes through for a sliver at the top of each division, and for
    the rest of it the previous output is fed straight back, so the picture locks
    to the exact frame that landed on the beat. HOLD at 0 is a clean bypass.

    p0 = LEN, p1 = HOLD, p2 = FEEL (0 straight, 1 swing, 2 dotted). */
fn effectTapDelay(col: vec3f, uv: vec2f) -> vec3f {
  let hold = clamp(u.p1, 0.0, 1.0);
  let len = stutterLenBeats(u.p0);
  let feel = floor(clamp(u.p2, 0.0, 1.0) * 100.0 + 0.5);

  // FEEL reshapes the repeat grid on top of whatever LEN is set, and STUTTER
  // keeps its own rather than following the rail -- it is the module you reach
  // for to put a stutter somewhere the song is not.
  //
  // It now goes through the shared groove rule, which fixes more than the
  // rounding. The old code picked a swung segment length and then took a plain
  // modulo of it, laying a UNIFORM grid at 1.34 (or 0.66) beats -- so the
  // repeats marched away from the pair structure instead of alternating long,
  // short, long. Swing was not slightly off, it was a different rhythm.
  let stutterSeg = grooveSegmentFeel(u.beat, len, feel);
  let seg = stutterSeg.y;
  let prog = clamp((u.beat - stutterSeg.x) / max(stutterSeg.y, 0.0001), 0.0, 1.0);

  // Capture window: wide enough to survive a dropped frame at any sane division,
  // narrow enough that the held frame is the one on the beat and not a later one.
  let capturing = step(prog, 0.08);
  let frozen = sampleFeedback(uv);

  // GATE is how much of the division the freeze occupies. Short gates read as a
  // stab -- lock on the beat, release back to live before the next one -- while
  // a full gate holds the whole division. Without it the freeze always ran edge
  // to edge, which is one gesture at one length.
  let gate = clamp(u.p3, 0.0, 1.0);

  // SENS ties the length of the freeze to how hard the track is hitting, so the
  // module plays the song instead of running a metronome over it: quiet bars
  // barely catch, loud ones lock for the full gate. Energy scales the gate
  // rather than arming a hard threshold on purpose -- a threshold evaluated per
  // frame would flicker mid-division, since nothing here holds state between
  // frames. At SENS 0 the gate is constant and this term disappears.
  let sens = clamp(u.accent, 0.0, 1.0);
  let energy = clamp(u.bassAmp * 1.5 + u.amplitude * 0.5, 0.0, 1.0);
  let drive = mix(1.0, energy, sens);
  let released = step(0.08 + gate * 0.92 * drive, prog);

  // Off the division the previous output feeds straight back with no offset and
  // no decay, which is what makes it a hold instead of a trail.
  let stutter = mix(frozen, col, max(capturing, released));
  return mix(col, stutter, hold * u.playing);
}

/** Simpler-style slice sampler: the actual slice jump is a real video seek done
    upstream (videoPool.seekModule from the live schedule frame), so the picture
    genuinely teleports. This adds the per-jump HIT accent — a quick pop right
    after each authoritative schedule jump that decays to clean playback — plus
    tape wobble when the rate is off 1x. aux1 = event pulse; aux2 = LUM/RGB/OFF. */
fn effectTimeSampler(col: vec3f, uv: vec2f) -> vec3f {
  let rate = 0.25 + u.p0 * 1.75;
  let wob = clamp(abs(rate - 1.0) - 0.05, 0.0, 1.0);
  var st = uv;
  st.x += sin(uv.y * 60.0 + u.beat * 9.0) * wob * 0.004;
  var wet = sampleSource(clamp(st, vec2f(0.0), vec2f(1.0)));

  // No beat reconstruction here: only the AudioContext-slaved schedule may
  // create a hit. The bounded treatment cannot synthesize a white test frame.
  let hit = clamp(u.aux1, 0.0, 1.0) * u.playing;
  if (u.aux2 < 0.5) {
    // LUM: restrained exposure lift, bounded below clipping.
    wet = min(
      pow(max(wet, vec3f(0.0)), vec3f(1.0 / (1.0 + hit * 0.18))) * (1.0 + hit * 0.22),
      vec3f(1.0)
    );
  } else if (u.aux2 < 1.5) {
    // RGB: short schedule-derived chroma hit without changing overall exposure.
    let split = hit * 0.012;
    wet.r = sampleSource(clamp(st + vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).r;
    wet.b = sampleSource(clamp(st - vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).b;
  }
  return wet * (1.0 + beatPulse(6.0) * 0.05);
}

/** Crash zoom: a beat-synced punch in or out with motion blur along the zoom,
    like a fake camera zoom hit. p1 = DIR (low in, mid alternate, high out),
    p0 = amount, p2 = snap (how sharply the pulse decays). */
fn effectPunch(col: vec3f, uv: vec2f) -> vec3f {
  let amt = u.p0;
  let snap = u.p2;
  // beatPulse rather than the same expression written out by hand. It was
  // identical maths, but writing it inline meant PUNCH was the one rhythmic
  // module reading u.beatPhase directly -- so it kept following the transport
  // when every other module had been switched to a MIDI part, and SNAP is
  // exactly the control you would want on a written kick.
  let pulse = beatPulse(3.0 + snap * 9.0);
  var dir = 1.0;
  if (u.p1 >= 0.66) { dir = -1.0; }
  else if (u.p1 >= 0.33) {
    // alternate in/out bar by bar
    if (fract(floor(u.beat) * 0.5) >= 0.25) { dir = -1.0; }
  }
  // gentle breathing keeps the frame alive between hits
  let breath = (0.5 - 0.5 * cos(u.beat * 1.2)) * (0.02 + amt * 0.03);
  let z = max(0.35, 1.0 + dir * pulse * (amt * amt * 1.4 + amt * 0.25 + u.bassAmp * 0.12) + dir * breath);

  var wet = vec3f(0.0);
  for (var i = 0; i < 5; i = i + 1) {
    let zz = mix(1.0, z, 0.55 + 0.45 * f32(i) / 4.0);
    wet += sampleSource(clamp((uv - vec2f(0.5)) / zz + vec2f(0.5), vec2f(0.0), vec2f(1.0)));
  }
  wet /= 5.0;
  return wet * (1.0 + pulse * 0.08);
}

/** Handheld operator: slow breathing sway from incommensurate sines, fast fine
    hand jitter, a footstep lurch on the beat, and a drifting roll. The frame is
    cropped in so translation/rotation never exposes an edge.
    p0 = handheld amount, p1 = footstep impact, p2 = sway/roll. */
fn effectShake(col: vec3f, uv: vec2f) -> vec3f {
  let hand = u.p0;
  let impact = u.p1;
  let sway = u.p2;
  let t = u.beat * 0.5;
  let amp = 0.006 + hand * hand * 0.05;

  let drift = vec2f(
    sin(t * 0.9) + 0.6 * sin(t * 1.73 + 1.3) + 0.3 * sin(t * 3.1 + 0.5),
    cos(t * 1.1) + 0.6 * sin(t * 2.17 + 2.1) + 0.3 * cos(t * 2.7 + 1.7)
  ) * amp;
  let jit = vec2f(sin(t * 17.0) + 0.5 * sin(t * 29.0), cos(t * 19.0) + 0.5 * sin(t * 31.0))
            * amp * 0.18 * (0.3 + hand);
  // footstep: a lurch that settles downward, randomised per step
  let boot = beatPulse(9.0) * impact;
  let stepOff = vec2f(
    hash21(vec2f(floor(u.beat), 3.7)) - 0.5,
    -abs(hash21(vec2f(floor(u.beat), 9.1)) - 0.5) * 1.4
  ) * boot * (0.03 + impact * 0.1);

  let ang = (sin(t * 0.6) + 0.5 * sin(t * 1.27 + 1.0)) * sway * (0.02 + sway * 0.07) + boot * sway * 0.04;
  let z = 1.07 + hand * 0.06 + boot * (0.03 + impact * 0.07);

  var c = uv - vec2f(0.5);
  c.x *= max(u.aspect, 0.0001);
  c = rot2(c, ang);
  c.x /= max(u.aspect, 0.0001);
  return sampleSourceMirrored(c / z + vec2f(0.5) + drift + jit + stepOff);
}

/** Drift cam: a flying dolly move across a cropped frame. The sweep runs on the
    beat clock as two incommensurate orbits so it never repeats obviously; the
    beat only adds a nudge on top. p0 = speed, p1 = travel distance, p2 = nudge. */
fn effectDrift(col: vec3f, uv: vec2f) -> vec3f {
  let spd = u.p0;
  let drift = u.p1;
  let nudge = u.p2;
  let t = u.beat * (0.12 + spd * 0.6 + spd * spd * 1.4) * 0.5;
  let pulse = beatPulse(4.0);

  let dist = 0.12 + drift * 0.26;
  let zoomBase = 1.18 + drift * 0.5;
  var offs = vec2f(
    sin(t * 0.8) + 0.5 * sin(t * 1.9 + 1.1),
    cos(t * 0.63) + 0.5 * cos(t * 1.7 + 0.4)
  ) * dist * 0.6;
  offs += vec2f(sin(u.beat * 1.7), cos(u.beat * 1.1)) * pulse * nudge * (0.03 + nudge * 0.06);
  let z = zoomBase * (1.0 + pulse * nudge * 0.06);
  return sampleSourceMirrored((uv - vec2f(0.5)) / z + vec2f(0.5) + offs);
}

/** Rack focus: a pull that ALWAYS lands back at sharp — the cosine envelope hits
    0 at the top of every cycle, like a focus pull settling. p0 = amount,
    p1 = pulse depth, p2 = bloom. */
fn effectFocus(col: vec3f, uv: vec2f) -> vec3f {
  let amt = u.p0;
  let pulseP = u.p1;
  let soft = u.p2;
  let xeye = u.p3;

  let rack = 0.5 - 0.5 * cos(fract(u.beat / 2.0) * 6.28318530718);
  let k = rack * (0.2 + pulseP * 0.8);
  let blur = k * (0.004 + amt * 0.045);

  var wet = vec3f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let a = f32(i) / 8.0 * 6.28318530718;
    wet += sampleSource(clamp(uv + vec2f(cos(a), sin(a)) * blur, vec2f(0.0), vec2f(1.0)));
  }
  wet /= 8.0;
  wet += max(wet - vec3f(0.62), vec3f(0.0)) * soft * min(1.0, blur * 45.0);
  if (xeye > 0.5) {
    let split = step(0.5, uv.x);
    let left = sampleSource(clamp(vec2f(uv.x * 0.92 + 0.04, uv.y), vec2f(0.0), vec2f(1.0)));
    let right = sampleSource(clamp(vec2f((uv.x - 0.5) * 0.92 + 0.54, uv.y), vec2f(0.0), vec2f(1.0)));
    wet = mix(left, right, split);
  }
  return wet;
}

/** Scope presentation: variable letterbox, a crop-in, and a timeline-locked
    blue flare. p0 = bars, p1 = zoom, p2 = flare.

    p1 used to divide only X, which is the desqueeze of an anamorphic negative.
    Footage that is already correctly proportioned has no squeeze to undo, so
    that just made everything narrow. It now scales both axes together, which
    crops into the frame and leaves the aspect alone. */
fn effectAnamorphic(col: vec3f, uv: vec2f) -> vec3f {
  let zoom = 1.0 + u.p1 * 0.45;
  let suv = clamp((uv - vec2f(0.5)) / zoom + vec2f(0.5), vec2f(0.0), vec2f(1.0));
  var wet = sampleSource(suv);
  let barHeight = 0.055 + u.p0 * 0.155;
  let aperture = 1.0 - step(uv.y, barHeight) - step(1.0 - barHeight, uv.y);
  let flareLine = exp(-abs(uv.y - (0.48 + 0.08 * sin(u.beat * 0.37))) * 90.0);
  let flareCore = exp(-abs(uv.x - (0.2 + 0.6 * fract(u.beat * 0.031))) * 14.0);
  wet += vec3f(0.18, 0.38, 0.9) * flareLine * flareCore * u.p2 * 0.8;
  return wet * clamp(aperture, 0.0, 1.0);
}

/** Deterministic film stock texture. Grain cells and gate weave are functions
    of the shared beat timeline, never render count. p0 = size, p1 = amount,
    p2 = gate drift. */
fn effectGrain(col: vec3f, uv: vec2f) -> vec3f {
  let cellScale = mix(1400.0, 180.0, u.p0);
  let frame = floor(u.beat * 24.0);
  let weave = vec2f(hash21(vec2f(frame, 2.1)), hash21(vec2f(4.7, frame))) - vec2f(0.5);
  let guv = clamp(uv + weave * u.p2 * 0.008, vec2f(0.0), vec2f(1.0));
  let stock = sampleSource(guv);
  // One hash over one floored grid is a grid: the cells line up and read as
  // woven blocks rather than grain. Two incommensurate scales, offset, break
  // the alignment so the structure disappears into noise.
  let n1 = hash21(floor(guv * cellScale) + vec2f(frame * 0.71, frame * 1.13));
  let n2 = hash21(floor(guv * cellScale * 1.73 + vec2f(0.37, 0.61)) + vec2f(frame * 1.31, frame * 0.57));
  let n = (n1 + n2) * 0.5;
  // Film grain lives in the midtones: silver halide has nothing to develop in
  // clipped blacks and little left in blown highlights. Flat additive noise
  // over the whole range is the other half of why this did not read as film.
  let lum = dot(stock, vec3f(0.2126, 0.7152, 0.0722));
  let response = 4.0 * lum * (1.0 - lum);
  return stock + vec3f(n - 0.5) * u.p1 * 0.42 * (0.30 + 0.70 * response);
}

/**
 * Seven kinds of light leak, built out of fogged noise rather than clean curves.
 *
 * The first version of this was a single geometry -- a soft falloff from
 * whichever side a slow sine pointed at -- so every preset was the same shape in
 * a different gel. Splitting it into seven types fixed the shapes but not the
 * look, because every type was still a smoothstep of a distance: an analytic
 * curve reads as an airbrush gradient no matter what outline you give it, which
 * is what "just a faded gradient thing" means.
 *
 * Three things separate this pass from that one:
 *
 *   1. The boundary is warped by domain-warped fbm, not multiplied by it.
 *      Perturbing the DISTANCE makes the edge of the fog ragged and curdled;
 *      multiplying the result only mottles an outline that is still a visibly
 *      smooth curve underneath.
 *   2. Two leak events run at once, at different scales and phases. Reference
 *      sheets of real fogged frames almost never show a single clean event --
 *      there is a dominant one and a weaker second, and the overlap is most of
 *      what makes it read as film damage instead of an overlay.
 *   3. It composites by MULTIPLYING its colour into the picture before it adds
 *      any light. See the composite note in effectLeak.
 *
 * The types are different light EVENTS, not different tints:
 *   0 EDGE    film gate bleed creeping in from one side
 *   1 STREAK  anamorphic flare, driven by what is actually bright in frame
 *   2 SHAFT   a hard-edged shaft sweeping across the frame
 *   3 CORNER  a hotspot burning in from a corner
 *   4 BURN    organic blotches, the way a scratched neg fogs
 *   5 VEIL    whole-frame veiling glare that breathes on the beat
 *   6 PRISM   the same fog split per wavelength into a spectral fringe
 *
 * p0 = size/reach, p1 = colour temperature, p2 = drift speed, p3 = type.
 */
/**
 * The colour through the leak, not the colour of the leak.
 *
 * A real leak is never one hue. Look at any reference sheet of them: a single
 * leak runs a blown white core out through orange into magenta at its fringe,
 * or white through cyan into violet -- the film is being fogged by light that
 * scatters differently at each wavelength as it falls off. Picking one tint and
 * multiplying the whole falloff by it is exactly what makes an effect read as a
 * gel taped over the lens.
 *
 * Param w is the WARMTH dial and chooses the family, cool at 0 to hot at 1.
 * Param i is the leak's own intensity at this pixel, so the ramp is walked from
 * fringe to core across the falloff.
 *
 * No backticks anywhere in this file: the whole shader is a TypeScript template
 * literal, so one in a comment ends the string and the errors land hundreds of
 * lines away from the cause.
 */
fn leakRamp(w0: f32, i: f32) -> vec3f {
  let k = clamp(i, 0.0, 1.0);
  // Sharpened, because the cool and warm families sit on opposite sides of the
  // wheel and a linear crossfade between them passes straight through grey. Mid
  // WARMTH produced a muddy tan that was neither, so most of the dial's travel
  // read as "slightly dirty" rather than as cool or warm.
  let w = smoothstep(0.10, 0.90, clamp(w0, 0.0, 1.0));

  // Cool family: violet fringe, cyan body, white-blue core.
  let coolFringe = vec3f(0.42, 0.24, 0.78);
  let coolMid = vec3f(0.30, 0.72, 1.00);
  let coolCore = vec3f(0.90, 0.97, 1.00);

  // Warm family: magenta fringe, orange body, blown amber-white core.
  let warmFringe = vec3f(1.00, 0.16, 0.48);
  let warmMid = vec3f(1.00, 0.52, 0.12);
  let warmCore = vec3f(1.00, 0.94, 0.74);

  let fringe = mix(coolFringe, warmFringe, w);
  let mid = mix(coolMid, warmMid, w);
  let core = mix(coolCore, warmCore, w);

  // Fringe holds the outer third, core only arrives where the leak is strong --
  // that late arrival is what makes the middle read as a blowout rather than a
  // flat wash.
  let ramp = mix(mix(fringe, mid, smoothstep(0.0, 0.55, k)), core, smoothstep(0.62, 1.0, k));

  // Push the saturation back up. Any mix of two hues loses chroma toward the
  // middle, and the ramp mixes twice -- once across the families and once along
  // the falloff -- so without this the body of the leak lands closer to beige
  // than to either colour it was built from. The core is left alone: it is
  // supposed to be blown and near-white.
  let lum = dot(ramp, vec3f(0.2126, 0.7152, 0.0722));
  let sat = mix(1.55, 1.0, smoothstep(0.55, 1.0, k));
  return max(vec3f(0.0), mix(vec3f(lum), ramp, sat));
}

/**
 * Stretched striation -- the internal texture a real leak actually carries.
 *
 * Reference plates do have structure inside their shapes, but it is nothing
 * like turbulence: it is drawn out along one axis into fine parallel lines, the
 * way light smears through a gate or across an anamorphic element. An fbm
 * cannot produce that however it is warped, because it carries the same detail
 * in every direction -- that isotropy is exactly what makes it read as smoke.
 *
 * So the lattice is sampled anisotropically: many cycles across the axis,
 * almost none along it.
 */
fn leakStriation(p: vec2f, ang: f32, fineness: f32) -> f32 {
  let d = rot2(p, ang);
  return fbm3(vec2f(d.x * fineness, d.y * 0.55));
}

/**
 * One defocused iris disc: flat-ish interior, hotter rim, soft outer edge.
 *
 * An out-of-focus point source does not render as a gaussian blob. The aperture
 * images itself, so it arrives as a DISC with a defined boundary and a brighter
 * ring where the blade edges pile up. A gaussian reads as a smudge; the rim is
 * the whole reason bokeh reads as bokeh.
 */
fn leakDisc(p: vec2f, centre: vec2f, radius: f32, soft: f32) -> f32 {
  let d = length(p - centre) / max(radius, 0.01);
  let body = 1.0 - smoothstep(1.0 - soft, 1.0 + soft * 0.35, d);
  let rim = exp(-pow((d - 0.88) / max(soft * 0.55, 0.02), 2.0));
  return body * 0.72 + rim * 0.55;
}

/**
 * The aperture, imaged. Returns the radius of the iris opening in direction p.
 *
 * A ghost is not a generic blob -- it is a PICTURE OF THE HOLE, formed when
 * light reflects between two lens elements and lands back on the sensor. That
 * is why a six-blade iris throws hexagons and a nine-blade rounded one throws
 * near-circles: you are looking at the diaphragm itself. In polar form the
 * distance to the nearest straight blade edge is
 *
 *   r = cos(pi/n) / cos(mod(t + pi/n, 2pi/n) - pi/n)
 *
 * and the round parameter lerps that back toward a plain circle, which is
 * exactly what rounded blades do physically.
 */
fn apertureNgon(p: vec2f, blades: f32, round: f32) -> f32 {
  let n = max(blades, 3.0);
  let seg = 6.2831853 / n;
  let half = seg * 0.5;
  let t = atan2(p.y, p.x) + half;
  let edge = cos(3.14159265 / n)
           / max(cos(t - floor(t / seg) * seg - half), 1e-4);
  return mix(edge, 1.0, clamp(round, 0.0, 1.0));
}

/**
 * One aperture image at the given centre, anisotropically scaled.
 *
 * SQUEEZE is the whole anamorphic story in one number. A desqueeze in post
 * stretches every internal reflection along the anamorphic axis, so a circular
 * ghost becomes a horizontal line. Round bokeh, oval bokeh and the anamorphic
 * streak are therefore the SAME primitive at three axis ratios, not three
 * separate effects -- which is why this function is shared by IRIS and ANAMO.
 */
fn leakAperture(
  q: vec2f, centre: vec2f, radius: f32, squeeze: f32, blades: f32, round: f32
) -> f32 {
  let d = (q - centre) / vec2f(max(squeeze, 0.05), 1.0) / max(radius, 0.008);
  let r = length(d);
  let e = apertureNgon(d, blades, round);
  // Body plus rim: the blade edges pile up light at the boundary, and that ring
  // is the whole reason bokeh reads as bokeh instead of as a smudge.
  let body = 1.0 - smoothstep(e * 0.70, e * 1.06, r);
  let rim = exp(-pow((r - e * 0.90) / 0.20, 2.0));
  return body * 0.78 + rim * 0.5;
}

/**
 * One leak event as a scalar field over the frame.
 *
 * seed offsets both the noise field and the drift, so calling this twice gives
 * two independent events rather than the same one drawn twice.
 */
fn leakField(uv: vec2f, kind: f32, reach: f32, phase: f32, seed: f32, fog: f32) -> f32 {
  let asp = max(u.aspect, 0.0001);
  // The two lens properties, read once. BLADES arrives as a real count (5..9)
  // because the polygon and the spike rule both need the integer, not a ratio.
  // SQUEEZE 0 leaves the aperture round; 1 stretches it into an anamorphic bar.
  let blades = clamp(round(u.aux3), 3.0, 12.0);
  let squeeze = 1.0 + clamp(u.aux4, 0.0, 1.0) * 13.0;
  // Rounded blades soften the polygon toward a circle, exactly as they do in a
  // real iris -- a nine-blade rounded stop is why modern bokeh reads circular.
  let blRound = clamp((blades - 5.0) / 4.0, 0.0, 1.0) * 0.7;
  // Aspect-corrected frame coordinates, so a round hotspot stays round on a
  // 16:9 canvas instead of stretching into an ellipse.
  let q = vec2f((uv.x - 0.5) * asp, uv.y - 0.5);

  // fog is passed in rather than computed here. It is a domain-warped fbm --
  // two fbm evaluations, six value-noise lookups, twenty-four hash21 calls --
  // and computing it per call meant PRISM paid for it six times over for what
  // is physically ONE fog bank seen through three wavelength displacements.
  let warp = (fog - 0.5) * 0.5;

  var v = 0.0;

  if (kind < 0.5) {
    // IRIS -- the ghost chain.
    //
    // Light reflecting between two elements re-images the aperture onto the
    // sensor, mirrored through the optical axis, once per reflection path. So
    // the ghosts are PLACED BY THE PICTURE: sample the frame along the vector
    // through centre, keep only what is bright, and stand an aperture image
    // there. That is why the reference plates are full of overlapping discs.
    //
    // It is also why they sweep so fast. Ghost i sits at uv + gv * i, so it
    // travels i times as far as the light source does -- a small camera move
    // swings the outer ghosts clear across frame. The quickness is geometric,
    // not a speed setting.
    if (u.hasVideo > 0.5) {
      // A ghost is the SOURCE, resampled along the vector through centre -- not
      // a shape drawn at the sample point. An earlier version stood an aperture
      // at c = uv + gv*i and measured the shaded pixel against it, but that
      // offset is relative to the pixel doing the shading, so length(q - c) came
      // out identical for every pixel on screen. The field was uniform, which
      // over video means invisible.
      let gv = (vec2f(0.5) - uv) * (0.22 + reach * 0.45);
      for (var i = 1; i < 6; i = i + 1) {
        let fi = f32(i);
        let suv = fract(uv + gv * fi);
        let lum = max(dot(sampleSource(suv), vec3f(0.2126, 0.7152, 0.0722)) - 0.38, 0.0);
        // Fade toward the frame edge, or fract() shows the wrap as a hard seam.
        let w = pow(max(1.0 - length(suv - vec2f(0.5)) * 1.42, 0.0), 4.0);
        // Aperture character: the iris polygon modulates the ghost by direction,
        // so a five-blade stop reads pentagonal and a nine-blade rounded one
        // reads circular. SQUEEZE stretches the same shape into oval bokeh.
        let d = (suv - vec2f(0.5)) / vec2f(squeeze, 1.0);
        let ap = apertureNgon(d, blades, blRound);
        v = v + lum * w * (1.30 - fi * 0.13) * (0.72 + 0.28 * ap);
      }
    } else {
      // No clip loaded: there is nothing to sample. Drawing a highlight on the
      // idle card just to feed this loop is what put fixed marks on the preview
      // twice over -- and a card bright enough to sample is also too bright for
      // the leak to read against, since both are painted in the accent.
      //
      // A virtual source instead. Same ghost chain, same mirrored geometry, no
      // drawn subject, so the card can stay black and every lit pixel on it is
      // the effect.
      let lp = vec2f(0.5 + 0.30 * cos(phase * 0.5 + seed),
                     0.5 + 0.22 * sin(phase * 0.42 + seed));
      let gv = (vec2f(0.5) - lp) * (0.55 + reach * 0.60);
      for (var i = 1; i < 5; i = i + 1) {
        let fi = f32(i);
        let c = lp + gv * fi;
        v = v + leakAperture(q, vec2f((c.x - 0.5) * asp, c.y - 0.5),
                             reach * (0.09 + fi * 0.05), squeeze, blades, blRound)
              * (1.25 - fi * 0.18);
      }
    }

  } else if (kind < 1.5) {
    // ANAMO -- the same aperture, squeezed hard on one axis.
    //
    // Not a drawn bar. An anamorphic streak IS a ghost that the desqueeze has
    // stretched along the anamorphic axis, which is why it is built from the
    // same primitive as IRIS and why it still has to come FROM something bright
    // or it reads as a painted line. The cool cast belongs to the lens COATING
    // rather than to the light, so the ramp supplies it, not this field.
    if (u.hasVideo > 0.5) {
      // Same correction as IRIS: the streak is the picture smeared along one
      // axis and kept where it is bright, not a bar drawn at a relative offset.
      // Kept inside the middle half of the frame: at +/-0.30 the band spent much
      // of its travel off the top or bottom edge, so the type read as "nothing
      // happening" for most of the cycle.
      let cy = 0.5 + 0.22 * sin(phase * 0.5 + seed);
      // SQUEEZE tightens the band: the anamorphic axis ratio is exactly what
      // decides whether a flare is a soft glow or a hard horizontal line.
      let bw = reach * mix(0.30, 0.085, clamp(u.aux4, 0.0, 1.0));
      let band = exp(-pow((uv.y - cy) / max(bw, 0.010), 2.0));
      var glare = 0.0;
      for (var i = 0; i < 11; i = i + 1) {
        let o = (f32(i) - 5.0) * (0.020 + reach * 0.055);
        let s = sampleSource(clamp(uv + vec2f(o, 0.0), vec2f(0.0), vec2f(1.0)));
        glare = glare + smoothstep(0.42, 0.95, dot(s, vec3f(0.2126, 0.7152, 0.0722)))
              * (1.0 - abs(f32(i) - 5.0) / 6.5);
      }
      // A floor under the glare: keyed purely off highlights the type renders
      // nothing over a shot with no blown source in the flare's path.
      v = band * (0.35 + clamp(glare * 0.75, 0.0, 2.0));
    } else {
      // Virtual source on the idle card, for the same reason as IRIS above.
      let lp = vec2f(0.5 + 0.28 * cos(phase * 0.44 + seed),
                     0.5 + 0.20 * sin(phase * 0.38 + seed));
      let gv = (vec2f(0.5) - lp) * (0.45 + reach * 0.45);
      for (var i = 1; i < 4; i = i + 1) {
        let fi = f32(i);
        let c = lp + gv * fi;
        // ANAMO floors the stretch well above SQUEEZE's own range: this type IS
        // the anamorphic one, so it reads as a streak even with the dial at 0.
        v = v + leakAperture(q, vec2f((c.x - 0.5) * asp, c.y - 0.5),
                             reach * 0.10, max(squeeze, 6.0) + reach * 5.0, blades, blRound)
              * (1.40 - fi * 0.25);
      }
    }
    // Striation along the streak axis. Stretched, never isotropic -- this is the
    // only place noise belongs, as texture inside a shape rather than as shape.
    v = v * (0.74 + 0.26 * leakStriation(uv, 0.0, 34.0));

  } else if (kind < 2.5) {
    // SPIKE -- the diffraction star.
    //
    // Every straight blade edge diffracts light perpendicular to itself, and a
    // spike runs BOTH ways from that edge. So an odd blade count shows 2n rays
    // while an even one shows n, because opposite edges are parallel and their
    // spikes superimpose: five blades give a ten-point star, six give six. That
    // is a rule of the optics, so the ray count is derived from the blade count
    // rather than dialled in by hand.
    let rays = select(blades, blades * 2.0, fract(blades * 0.5) > 0.25);
    let src = vec2f(cos(phase * 0.30 + seed) * 0.26, sin(phase * 0.26 + seed) * 0.18);
    let d = (q - src) / vec2f(squeeze, 1.0);
    let r = max(length(d), 1e-4);
    // Rounded blades diffract less sharply, so the star softens as BLADES rises
    // -- the same trade a real lens makes between clean sunstars and round bokeh.
    let sharp = mix(26.0, 9.0, blRound / 0.7);
    let star = pow(abs(cos(atan2(d.y, d.x) * rays * 0.5)), sharp);
    v = exp(-r / max(reach * 0.55, 0.03)) * (0.18 + star * 1.5);

  } else if (kind < 3.5) {
    // RINGS -- Newton fringes.
    //
    // The concentric colour rings on a leak plate are thin-film interference,
    // and their radii go as sqrt(m), so the fringes bunch progressively TIGHTER
    // toward the outside. Evenly spaced sin(d * k) rings are the obvious
    // implementation and they read as wrong for precisely that reason, so the
    // fringe phase here is quadratic in radius: m ~ r^2.
    let centre = vec2f(cos(phase * 0.19 + seed) * 0.22, sin(phase * 0.23 + seed) * 0.16);
    let r = length(q - centre) / max(reach * 1.10, 0.05);
    let m = r * r * (7.0 + reach * 14.0);
    let fringe = 0.5 + 0.5 * cos(m * 6.2831853);
    v = exp(-r * r * 1.5) * (0.30 + 0.70 * fringe);

  } else if (kind < 4.5) {
    // EDGE -- the actual light LEAK, as distinct from a lens flare.
    //
    // Light entering at the film edge or through the sprocket holes fogs the
    // emulsion inward, and the polyester base pipes it along like fibre optic.
    // The mechanism is a smooth exponential falloff from the border with a
    // periodic accent where the perforations sit. There is no turbulence
    // anywhere in it, which is exactly what the old fbm version got wrong.
    let side = step(0.0, sin(phase * 0.5 + seed * 2.1));
    let dx = mix(uv.x, 1.0 - uv.x, side);
    let perf = 0.80 + 0.20 * (0.5 + 0.5 * cos(uv.y * 6.2831853 * 8.0 + phase));
    v = exp(-dx / max(reach * 0.42, 0.02)) * perf * 1.5;
    // Striation runs ALONG the bleed, keeping it streaky rather than mottled.
    v = v * (0.78 + 0.22 * leakStriation(uv + vec2f(seed), 1.5708, 30.0));

  } else if (kind < 5.5) {
    // VEIL -- glare over the whole frame, pumped by the beat. Even a veil has
    // structure: a flat one is indistinguishable from lowering the contrast,
    // which is exactly what it used to look like.
    let breathe = 0.45 + 0.55 * beatPulse(3.0);
    let edgeBias = smoothstep(0.05, 0.95, length(q / vec2f(asp, 1.0)) * 1.5);
    // Floor plus reach rather than reach alone: scaled straight off the dial it
    // vanished entirely at low SIZE, so a third of the control did nothing.
    v = breathe * (0.30 + reach * 1.05) * (0.28 + 0.72 * edgeBias) * (0.42 + 0.58 * fog);

  } else {
    // PRISM -- a soft blob, displaced per channel by the caller so the three
    // evaluations land in slightly different places. That displacement IS
    // chromatic aberration, so the overlap reads as spectrum rather than as
    // three tinted copies of one shape.
    let centre = vec2f(cos(phase * 0.37 + seed), sin(phase * 0.31 + seed)) * 0.30;
    let d = length(q - centre) + warp * 0.26;
    v = clamp(1.0 - smoothstep(0.0, reach * 1.25, d), 0.0, 1.0);
  }

  return max(v, 0.0);
}

fn effectLeak(col: vec3f, uv: vec2f) -> vec3f {
  let kind = floor(clamp(u.p3, 0.0, 1.0) * 100.0 + 0.5);
  let phase = u.beat * (0.06 + u.p2 * 0.34);
  let asp = max(u.aspect, 0.0001);
  // Leaks are big. A ceiling that only fogs a band down one side is the other
  // half of why this read as an overlay -- the real thing routinely swallows
  // half the frame.
  let reach = 0.20 + u.p0 * 0.90;

  // ---- Firing cycle --------------------------------------------------------
  // A leak is an EVENT, not a state. Real ones catch the light as the camera
  // swings past it: they arrive, flood, and pass, and between passes there is
  // nothing at all. Every type here was permanently on at constant strength,
  // which is the single biggest reason the module read as a coloured sheet laid
  // over the picture rather than as light striking the lens.
  //
  // FREQ sets how often a pass happens; HOLD how long one lasts once it starts.
  // Between them they cover the whole range: quick flicker (high FREQ, low
  // HOLD), slow travelling pass (low FREQ, high HOLD), and silence.
  //
  // FREQ at 0 means the leak never fires -- fully off, not merely quiet.
  let freq = clamp(u.aux1, 0.0, 1.0);
  let hold = mix(0.06, 0.92, clamp(u.aux2, 0.0, 1.0));
  // Squared so the bottom half of the dial spreads events across bars rather
  // than bunching every useful setting into the last few percent.
  let period = mix(32.0, 0.5, freq * freq);
  let cyc = fract(u.beat / max(period, 0.125));
  // Fast attack, slower release: light arrives the moment the gap lines up and
  // drains as it swings away. Symmetric envelopes read as a square wave.
  var env = smoothstep(0.0, 0.05, cyc) * (1.0 - smoothstep(hold * 0.55, hold, cyc));

  // A written part outranks the internal clock. triggerAge counts beats since
  // this module's last MIDI note, so when a part is driving the rack it decides
  // WHEN a leak happens and FREQ is left setting only how long the tail runs.
  // Without this the module would keep firing on its own grid underneath the
  // part, which is the failure PUNCH had before it moved onto beatPulse.
  if (u.triggerAge >= 0.0) {
    let span = max(period * hold, 0.08);
    let a = clamp(1.0 - u.triggerAge / span, 0.0, 1.0);
    env = a * a;
  }

  if (freq <= 0.001) { env = 0.0; }
  // Stopped, u.beat is frozen so the cycle cannot advance -- but the preview
  // card still has to show what the module does, so it holds fully on.
  if (u.playing < 0.5) { env = 1.0; }

  // The two noise fields are evaluated ONCE here and handed down.
  //
  // Each is a domain-warped fbm -- twenty-four hash21 calls, every one of them a
  // sin -- and leakField used to compute its own. PRISM calls leakField six
  // times (three wavelengths x two layers), so it was paying for the same fog
  // six times over: ~216 hash21 per pixel, and PGM runs unthrottled. Hoisting
  // them is also more physically honest, because the three PRISM channels are
  // one fog bank seen through three displacements, not three separate banks.
  let fogScale = mix(5.2, 2.0, clamp(reach, 0.0, 1.0));
  let fogA = warpedFbm(uv * vec2f(asp, 1.0) * fogScale + vec2f(0.0, phase * 0.3));
  let fogB = warpedFbm(uv * vec2f(asp, 1.0) * fogScale * 1.7 + vec2f(27.7, phase * 0.5));

  var amount = 0.0;
  var spectral = vec3f(0.0);

  if (kind > 5.5) {
    // Three evaluations of the same field, displaced along one axis. Red trails
    // one way and blue the other, and where they overlap the fog goes white.
    let axis = vec2f(cos(phase * 0.4), sin(phase * 0.4));
    let disp = (0.05 + u.p0 * 0.16) / vec2f(asp, 1.0).x;
    for (var c = 0; c < 3; c = c + 1) {
      let off = (f32(c) - 1.0) * disp;
      let p = uv - axis * off;
      let band = leakField(p, 6.0, reach, phase, 0.0, fogA)
               + leakField(p, 6.0, reach * 0.62, phase * 1.7 + 2.3, 4.7, fogB) * 0.55;
      if (c == 0) { spectral.r = band; }
      else if (c == 1) { spectral.g = band; }
      else { spectral.b = band; }
    }
    amount = max(spectral.r, max(spectral.g, spectral.b));
  } else {
    // Two events, not one. The second is smaller, faster and offset in the
    // noise field, so it lands somewhere else in the frame and the two overlap
    // the way real fogging does. Summing rather than max-ing means the overlap
    // is genuinely hotter, which is where the blowout wants to be.
    let a = leakField(uv, kind, reach, phase, 0.0, fogA);
    let b = leakField(uv, kind, reach * 0.55, phase * 1.63 + 5.1, 3.9, fogB);
    amount = a + b * 0.6;
  }

  // Internal mottling, applied once to the combined field rather than inside
  // each layer. Light-struck emulsion is exposed silver, so the fogged area
  // carries grain of its own instead of being the one perfectly clean region of
  // the picture.
  amount = amount * (0.78 + 0.22 * fbm3(uv * vec2f(asp, 1.0) * 11.0 + vec2f(0.0, phase * 0.9)));

  // Take a little of the colour from the frame itself. Real spill picks up
  // whatever it is bouncing off. Dividing by luminance keeps the scene's hue
  // and discards its brightness, so a dark shot biases the leak as strongly as
  // a bright one.
  let sceneLum = max(dot(col, vec3f(0.2126, 0.7152, 0.0722)), 0.001);
  let sceneHue = clamp(col / sceneLum, vec3f(0.0), vec3f(2.0));

  // Keyed to the picture's own luminance. Light striking the stock lands on the
  // same emulsion the image is on, so a leak POOLS around what is already
  // bright -- a practical, a window, a blown sky -- and thins across the parts
  // of the frame carrying no light of their own. Without this the field is
  // placed purely by noise and lands wherever it likes, which is most of why it
  // sat on the picture instead of in it.
  //
  // Floored well above zero rather than scaled straight off luminance: keyed
  // purely to brightness the leak would vanish on a night shot, and fogging is
  // most visible on exactly that stock.
  let lumKey = 0.58 + 0.80 * smoothstep(0.04, 0.72, sceneLum);
  amount = amount * lumKey * env;

  amount = clamp(amount, 0.0, 1.6);
  let k = clamp(amount, 0.0, 1.0);

  // Two colours, not one.
  //
  // leakRamp runs fringe -> body -> near-white core, and walking it with the
  // leak's own strength meant that anywhere the field saturated -- which, with
  // two layers summed, is most of the leak -- the colour used was the blown
  // core. Every type came out the same cream haze no matter what WARMTH said,
  // because the ramp was pinned at its white end.
  //
  // The body keeps to the saturated part of the ramp and drives the tint and
  // the fog. The core is the white end and is reserved for the screened
  // blowout, so the picture goes properly warm or properly cool and only the
  // hottest centre of the leak goes white.
  var body = mix(leakRamp(u.p1, min(amount, 0.55)), sceneHue, 0.10);
  var coreTint = leakRamp(u.p1, 1.0);
  if (kind > 5.5) {
    // The spectral bands already carry the colour; warmth only biases which end
    // of the spectrum leads.
    let spec = normalize(spectral + vec3f(0.02))
             * mix(vec3f(0.82, 0.92, 1.00), vec3f(1.00, 0.84, 0.66), u.p1);
    body = spec * 1.5;
    coreTint = mix(spec * 1.5, vec3f(1.0), 0.55);
  }

  // ---- Composite -------------------------------------------------------
  // The old version screened a colour over the picture and stopped there, which
  // is why it looked like a coloured sheet laid on top: screen can only ADD
  // light, so every pixel it touched got brighter and flatter until the shot
  // was a milky haze with its blacks at mid grey.
  //
  // Light-struck film does two separable things, and the order matters:
  //
  //   1. The stock is exposed through the leak's colour, so the picture under
  //      it is TINTED -- the frame keeps its detail and its contrast and comes
  //      out warm, not washed. That is a multiply, and it is the step that was
  //      missing entirely.
  //   2. Then the fogging light is added on top, blowing the core out and
  //      lifting the shadows -- but only where the leak actually is.
  //
  // Multiply first, add second. Doing it the other way round tints light the
  // leak just deposited instead of tinting the picture.

  // Normalised so the brightest channel is 1: multiplying by a colour whose
  // peak is below 1 would darken the shot overall instead of shifting its hue.
  let tintMul = body / max(max(body.r, max(body.g, body.b)), 0.001);
  var wet = col * mix(vec3f(1.0), tintMul, k * 0.95);

  // Fog. Weighted by (1 - wet) so it lands in the shadows and leaves the
  // highlights alone -- fogging adds density to the parts of the neg that were
  // never exposed, so the blacks go first and the highlights barely move. This
  // is also the only term that reads at all on a night shot, where multiplying
  // a near-black pixel by anything leaves it near-black.
  // 0.42 was tuned against the old always-on wash, where the leak covered the
  // frame permanently and a light touch was the only thing keeping it bearable.
  // Now that FREQ makes it a passing event it has to actually register while it
  // is there, and the (1 - wet) weighting already protects the highlights -- on
  // a bright shot that term collapses on its own, which is why the effect was
  // invisible over lit footage even at full MIX.
  wet = wet + body * (k * 0.78) * (vec3f(1.0) - wet);

  // Core. Screened, and scaled by what is already bright so the leak blows out
  // where it crosses a highlight instead of ignoring the picture underneath.
  // pow keeps it off the weak fringe, so only the hot middle of the leak blows.
  // pow 2.1 kept the blowout off everything but a saturated field, so the core
  // -- the part that actually reads as light rather than as a grade -- almost
  // never rendered. 1.5 still holds it off the weak fringe.
  let coreK = pow(k, 1.5) * (0.45 + 1.00 * smoothstep(0.20, 1.0, sceneLum));
  let core = clamp(coreTint * coreK, vec3f(0.0), vec3f(1.0));
  wet = vec3f(1.0) - (vec3f(1.0) - clamp(wet, vec3f(0.0), vec3f(1.0))) * (vec3f(1.0) - core);

  // Dither. A leak is a wide shallow gradient across an 8-bit target, which is
  // the exact signal that stair-steps into visible bands.
  return clamp(wet + vec3f(dither8(uv, u.beat * 0.37)), vec3f(0.0), vec3f(1.0));
}

/** Rotating horizon with optional beat snap. p0 = tilt, p1 = drift,
    p2 = beat snap. */
fn effectDutch(col: vec3f, uv: vec2f) -> vec3f {
  let drift = sin(u.beat * (0.12 + u.p1 * 0.38)) * u.p1;
  let snap = beatPulse(8.0) * (fract(floor(u.beat) * 0.5) * 4.0 - 1.0);
  let angle = (u.p0 * 0.28) * (0.45 + drift * 0.55) + snap * u.p2 * 0.16;
  var c = uv - vec2f(0.5);
  c.x *= max(u.aspect, 0.0001);
  c = rot2(c, angle);
  c.x /= max(u.aspect, 0.0001);
  let zoom = 1.0 + abs(sin(angle)) * 0.35;
  return sampleSourceMirrored(c / zoom + vec2f(0.5));
}

/** Highlight-selective red bloom. p0 = threshold, p1 = spread,
    p2 = warm tint. */
fn effectHalation(col: vec3f, uv: vec2f) -> vec3f {
  // Halation is light scattering back through the emulsion from bright areas,
  // so the threshold has to key off LUMINANCE. Subtracting a threshold per
  // channel, as this did, biases the bloom toward whichever channel happens to
  // be hot and washes everything the same red regardless of the picture.
  let threshold = 0.20 + u.p0 * 0.64;
  let inner = 0.002 + u.p1 * 0.020;
  let outer = inner * 2.7;
  var bloom = vec3f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let a = f32(i) * 0.78539816339;
    let dir = vec2f(cos(a), sin(a));
    // Two rings rather than one: the near ring carries the core, the far one
    // the spread. A single radius gave a hard halo with nothing to vary.
    let s1 = sampleSource(clamp(uv + dir * inner, vec2f(0.0), vec2f(1.0)));
    let s2 = sampleSource(clamp(uv + dir * outer, vec2f(0.0), vec2f(1.0)));
    let l1 = max(dot(s1, vec3f(0.2126, 0.7152, 0.0722)) - threshold, 0.0);
    let l2 = max(dot(s2, vec3f(0.2126, 0.7152, 0.0722)) - threshold, 0.0);
    bloom += s1 * l1 + s2 * l2 * 0.55;
  }
  bloom /= 12.4;
  // Cool blue-white through neutral into the classic red-orange halation, so
  // the module covers more than one look. It only spanned orange to deep red.
  let tint = mix(vec3f(0.58, 0.80, 1.0), vec3f(1.0, 0.22, 0.10), u.p2);
  let amount = clamp(bloom * tint * (1.5 + u.p1 * 3.2), vec3f(0.0), vec3f(1.0));
  // Screen so a hot core glows outward instead of clipping to a flat plate.
  return vec3f(1.0) - (vec3f(1.0) - col) * (vec3f(1.0) - amount);
}

/** BARREL — radial lens warp that goes both ways.

    AMOUNT is signed around its midpoint now: below centre the frame pinches
    (pincushion), above it bulges (barrel). It used to run one direction only,
    so half the knob's travel did nothing but approach neutral.

    It also had no beat term at all — no u.beat, no beatPulse — so a control
    named for the bass could not react to it. BEAT now drives beatGate: at 0 the
    warp is constant, and as it rises the warp snaps in on the hit and releases
    between hits, with the low end weighted so a kick pushes it hardest.

    p0 = amount (0.5 neutral), p1 = vertical centre, p2 = falloff, p3 = beat. */
fn effectBulge(col: vec3f, uv: vec2f) -> vec3f {
  let center = vec2f(0.5, mix(0.28, 0.72, u.p1));
  var d = uv - center;
  d.x *= max(u.aspect, 0.0001);
  let r2 = dot(d, d);
  let reach = mix(1.8, 0.45, u.p2);
  let influence = exp(-r2 / max(reach * reach, 0.001));

  let signed = (u.p0 - 0.5) * 2.0;
  let gate = beatGate(u.p3, 5.0, 0.6);
  let warp = 1.0 - signed * 0.65 * influence * gate;

  d *= max(warp, 0.2);
  d.x /= max(u.aspect, 0.0001);
  return sampleSource(clamp(center + d, vec2f(0.0), vec2f(1.0)));
}

/** Analogue tape tracking, chroma bleed and deterministic line noise.
    p0 = tracking, p1 = bleed, p2 = noise. */
/** Multi-octave interpolated hash noise, ported from the svelte-video-shaders
    vhs shader's iHash/vhsNoise pair. */
fn vhsNoise(v: vec2f) -> f32 {
  var sum = 0.0;
  for (var i = 1; i < 5; i = i + 1) {
    let r = vec2f(2.0 * pow(2.0, f32(i)));
    let vv = v + vec2f(f32(i));
    let h00 = hash21(floor(vv * r) / r);
    let h10 = hash21(floor(vv * r + vec2f(1.0, 0.0)) / r);
    let h01 = hash21(floor(vv * r + vec2f(0.0, 1.0)) / r);
    let h11 = hash21(floor(vv * r + vec2f(1.0, 1.0)) / r);
    let ip = smoothstep(vec2f(0.0), vec2f(1.0), fract(vv * r));
    sum += mix(mix(h00, h10, ip.x), mix(h01, h11, ip.x), ip.y) / pow(2.0, f32(i));
  }
  return sum;
}

/** Unified VHS / camcorder tape treatment, ported from the svelte-video-shaders
    repo's vhs + glitch shaders and driven by the beat clock. Covers the retired
    CAMCORDER module's interlace/CCD look via the noise/chroma channels.
    p0 = tracking (tape wave + tracking bands + barrel), p1 = chroma (RGB shift
    + color bleed), p2 = noise (grain + scanlines + vignette + flicker),
    p3 = beat glitch (block/line rips spiking on every beat). */
fn effectVhs(col: vec3f, uv0: vec2f) -> vec3f {
  let t = u.beat * 0.5;
  // p3 is the beat amount. It used to be p3 * (0.15 + 0.85 * pulse), whose
  // 0.15 floor survived at every setting — so the glitch never actually
  // stopped between hits and the control read as intensity rather than
  // rhythm. Now the amount also sets how hard it gates: low values leave the
  // artifacts sitting steady, high values collapse them onto the beat and
  // reach zero in between, which is the thing a beat slider is for.
  let glitch = u.p3 * mix(1.0, beatPulse(6.0), u.p3);

  var uv = uv0;
  let cc = uv - vec2f(0.5);
  let d = dot(cc, cc) * u.p0 * 0.35;
  uv = uv + cc * (1.0 + d) * d;

  uv.x += (vhsNoise(vec2f(uv.y, t)) - 0.5) * 0.05 * u.p0;
  uv.x += (vhsNoise(vec2f(uv.y * 100.0, t * 10.0)) - 0.5) * 0.01 * u.p0;

  let tcPhase = clamp((sin(uv.y * 50.0 - t * 6.2831853) - 0.92) * vhsNoise(vec2f(t, 0.37)), 0.0, 0.01) * 10.0;
  let tcNoise = max(vhsNoise(vec2f(uv.y * 100.0, t * 10.0)) - 0.5, 0.0);
  uv.x -= tcNoise * tcPhase * u.p0 * 6.0;

  let blockRow = floor(uv.y * (8.0 + u.p3 * 24.0));
  let blockNoise = hash21(vec2f(blockRow, floor(u.beat * 8.0)));
  uv.x += (blockNoise - 0.5) * 0.20 * glitch;
  let lineRip = step(0.985 - glitch * 0.01, hash21(vec2f(floor(uv0.y * 220.0), floor(u.beat * 16.0))));
  uv.x += (hash21(vec2f(uv0.y, fract(u.beat))) - 0.5) * 0.25 * glitch * lineRip;

  let suv = clamp(uv, vec2f(0.0), vec2f(1.0));

  let split = u.p1 * 0.006 + glitch * 0.010;
  var wet = sampleSource(suv);
  let bleedTap = sampleSource(clamp(suv - vec2f(u.p1 * 0.006, 0.0), vec2f(0.0), vec2f(1.0)));
  wet = (wet * 3.0 + bleedTap) / 4.0;
  wet = vec3f(
    sampleSource(clamp(suv + vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).r,
    wet.g,
    sampleSource(clamp(suv - vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).b
  );

  wet *= 1.0 - tcPhase * u.p0 * 3.0;

  let scan = sin((uv0.y * 90.0 + t * 5.0) * 6.2831853) * 0.5 + 0.5;
  wet *= 1.0 - u.p2 * 0.35 + u.p2 * 0.35 * scan;

  wet *= 1.0 - dot(cc, cc) * (0.4 + u.p2 * 0.8);

  wet += vec3f(hash21(uv0 + vec2f(fract(t), fract(t * 7.3))) - 0.5) * u.p2 * 0.25;

  wet *= 1.0 - u.p2 * 0.08 * (0.5 + 0.5 * sin(u.beat * 12.566371));

  return clamp(wet, vec3f(0.0), vec3f(1.0));
}

/** Radially weighted RGB refraction. p0 = split, p1 = angle,
    p2 = edge weighting. */
fn effectPrism(col: vec3f, uv: vec2f) -> vec3f {
  let a = (u.p1 - 0.5) * 3.14159265;
  let dir = vec2f(cos(a), sin(a));
  let radial = length(vec2f((uv.x - 0.5) * max(u.aspect, 0.0001), uv.y - 0.5));
  let edge = smoothstep(0.05 + (1.0 - u.p2) * 0.35, 0.72, radial);
  let offset = dir * u.p0 * (0.004 + 0.035 * edge);
  let r = sampleSource(clamp(uv + offset, vec2f(0.0), vec2f(1.0))).r;
  let g = sampleSource(uv).g;
  let b = sampleSource(clamp(uv - offset, vec2f(0.0), vec2f(1.0))).b;
  return vec3f(r, g, b);
}

/** Directional long-exposure accumulation sampled from the current source.
    p0 = length, p1 = angle, p2 = exponential decay. */
fn effectStreak(col: vec3f, uv: vec2f) -> vec3f {
  let a = (u.p1 - 0.5) * 3.14159265;
  let dir = vec2f(cos(a), sin(a));
  let pulse = 0.35 + 0.65 * beatPulse(4.0);
  // 0.12 put the smear at 2-6% of the frame at the default LENGTH of 50, which
  // is below the threshold where a directional blur reads as anything at all --
  // the module looked broken rather than subtle. 0.30 makes LENGTH cover a real
  // range: still gentle at the bottom, an actual streak at the top.
  let span = u.p0 * 0.30 * pulse;
  var wet = vec3f(0.0);
  var weight = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i) / 7.0;
    let w = exp(-fi * (1.0 + u.p2 * 5.0));
    wet += sampleSource(clamp(uv - dir * span * fi, vec2f(0.0), vec2f(1.0))) * w;
    weight += w;
  }
  return wet / max(weight, 0.0001);
}

/** INCEPTION — reflection folds in the Nception idiom: straight mirror planes,
    bands and boxes rather than radial kaleidoscope wedges. The look comes from
    where the fold sits and how far the source repeats past it, not from pie
    slices, so verticals stay vertical and architecture stays readable.

    p0 selects one of twelve folds, p1 walks the fold across the frame, p2 spins
    the fold axis, p3 = beat reaction. Folding happens in aspect-corrected space
    so a diagonal is a true 45 degrees rather than a stretched one. */
fn effectMirror(col: vec3f, uv0: vec2f) -> vec3f {
  let kind = floor(clamp(u.p0, 0.0, 1.0) * 11.0 + 0.5);
  let asp = max(u.aspect, 0.0001);
  let pulse = beatPulse(5.0) * u.p3;
  // p1 walks the fold; 0.5 leaves it centred. Bands narrow as it moves out,
  // which is what tightens the tunnel rather than just sliding it.
  let shift = (u.p1 - 0.5) * 0.7;
  let band = mix(0.42, 0.07, abs(u.p1 - 0.5) * 2.0) * (1.0 - pulse * 0.35);
  let spin = (u.p2 - 0.5) * 3.14159265 + pulse * 0.5;

  let p0 = vec2f((uv0.x - 0.5) * asp, uv0.y - 0.5);
  let p = mirrorFoldPoint(p0, kind, shift, band, spin, asp, pulse);

  // Fold, do not clamp. A fold that walks off the frame used to be clamped
  // here, which smeared one edge pixel into a streak across everything past
  // the border — the effect looked broken exactly where it was working
  // hardest. Mirroring continues the shot back on itself instead, so an
  // off-frame fold reads as more picture rather than a defect.
  let uv = vec2f(p.x / asp + 0.5, p.y + 0.5);
  return sampleSource(vec2f(mirrorRepeat(uv.x), mirrorRepeat(uv.y)));
}

/** SPECIALTY LENS — fisheye to tele-crush glass. p0 = glass (0 = tele
    flatten, 0.5 = neutral, 1 = full fisheye), p1 = punch-in zoom, p2 = edge
    treatment (chromatic fringe + falloff), p3 = beat pump (the lens breathes
    on every beat). */
fn effectLens(col: vec3f, uv0: vec2f) -> vec3f {
  let asp = max(u.aspect, 0.0001);
  // BEAT used to be a 12% zoom breath layered on top of an always-on lens, so
  // turning it up added a wobble rather than making the lens hit. It now gates
  // the glass itself through beatGate: down, the lens sits on constantly; up,
  // it snaps in on the beat and falls away between.
  let gate = beatGate(u.p3, 5.0, 0.5);
  let glass = (u.p0 - 0.5) * 2.0 * gate;
  var p = vec2f((uv0.x - 0.5) * asp, uv0.y - 0.5);
  let r = length(p);
  let bend = 1.0 + glass * r * r * 2.2;
  p = p * bend / (1.0 + glass * 0.55);
  p = p * mix(1.0, 0.62, u.p1 * gate);
  let uv = vec2f(p.x / asp + 0.5, p.y + 0.5);
  let edge = smoothstep(0.15, 0.75, r) * u.p2;
  let split = edge * 0.012;
  let dir = normalize(p + vec2f(0.00001));
  var wet = sampleSource(clamp(uv, vec2f(0.0), vec2f(1.0)));
  wet = vec3f(
    sampleSource(clamp(uv + dir * split, vec2f(0.0), vec2f(1.0))).r,
    wet.g,
    sampleSource(clamp(uv - dir * split, vec2f(0.0), vec2f(1.0))).b
  );
  wet = wet * (1.0 - edge * 0.45);
  return wet;
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;
  let dry = sampleSource(uv);
  var wet = dry;
  let mode = floor(u.effectMode + 0.5);

  if (mode == 1.0) { wet = effectTransition(dry, uv); }
  else if (mode == 2.0) { wet = effectSpeedRamp(dry, uv); }
  else if (mode == 3.0) { wet = effectTapDelay(dry, uv); }
  else if (mode == 4.0) { wet = effectTimeSampler(dry, uv); }
  else if (mode == 5.0) { wet = effectPunch(dry, uv); }
  else if (mode == 6.0) { wet = effectShake(dry, uv); }
  else if (mode == 7.0) { wet = effectDrift(dry, uv); }
  else if (mode == 8.0) { wet = effectFocus(dry, uv); }
  else if (mode == 9.0) { wet = effectAnamorphic(dry, uv); }
  else if (mode == 10.0) { wet = effectGrain(dry, uv); }
  else if (mode == 11.0) { wet = effectLeak(dry, uv); }
  else if (mode == 12.0) { wet = effectDutch(dry, uv); }
  else if (mode == 13.0) { wet = effectHalation(dry, uv); }
  else if (mode == 14.0) { wet = effectBulge(dry, uv); }
  else if (mode == 15.0) { wet = effectVhs(dry, uv); }
  else if (mode == 17.0) { wet = effectPrism(dry, uv); }
  else if (mode == 18.0) { wet = effectStreak(dry, uv); }
  else if (mode == 19.0) { wet = effectMirror(dry, uv); }
  else if (mode == 20.0) { wet = effectLens(dry, uv); }

  let m = clamp(u.mix, 0.0, 1.0);
  let rgb = mix(dry, wet, m) * (1.0 + clamp(u.amplitude, 0.0, 1.0) * 0.06);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

/** Test-card variant used only when no decoded video frame can be imported.
 * The live-video pipeline above remains the canonical module shader contract. */
export const MODULE_FX_IDLE_WGSL = MODULE_FX_WGSL
  .replace('var videoTex: texture_external;', 'var videoTex: texture_2d<f32>;')
  .replace(
    'textureSampleBaseClampToEdge(videoTex, videoSampler, clamp(uv, vec2f(0.0), vec2f(1.0)))',
    'textureSampleLevel(videoTex, videoSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0)'
  );

export const SHADER_EFFECT_MODE: Record<string, number> = {
  transition: 1,
  speedramp: 2,
  tapdelay: 3,
  timesampler: 4,
  punch: 5,
  shake: 6,
  orbit: 7,
  focus: 8,
  anamorphic: 9,
  grain: 10,
  leak: 11,
  dutch: 12,
  halation: 13,
  bulge: 14,
  vhs: 15,
  prism: 17,
  streak: 18,
  mirror: 19,
  lens: 20
};
