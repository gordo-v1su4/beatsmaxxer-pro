/** Shared WGSL snippets — leaf module, no imports (Beatform wgslLib pattern). */

export const WGSL_FULLSCREEN_VERTEX = /* wgsl */ `
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

`;

export const WGSL_UNIFORMS_AND_BINDINGS = /* wgsl */ `struct Uniforms {
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
  /** Onset strength on the low end: positive flux, fast attack, quick decay.
      bassAmp is a smoothed LEVEL and can only say how loud the bass is, never
      that a hit just landed -- so anything that should FIRE on the music has to
      read this instead. */
  onsetAmp: f32,
  /** Low-end level normalised against a decaying running peak, so it spans 0..1
      whatever the track's mastering. Raw bassAmp measures about 0.02-0.13 on
      this engine, so scaling by it directly barely moves anything. */
  bassNorm: f32,
  /** High-band energy, for character that should follow the top end. */
  highAmp: f32,
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
`;

export const WGSL_RHYTHM = /* wgsl */ `fn beatPulse(sharpness: f32) -> f32 {
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

`;

export const WGSL_NOISE = /* wgsl */ `fn rot2(p: vec2f, a: f32) -> vec2f {
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
`;

export const WGSL_MIRROR = /* wgsl */ `fn mirrorRepeat(x: f32) -> f32 {
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
`;

export const WGSL_SAMPLING = /* wgsl */ `fn sampleSource(uv: vec2f) -> vec3f {
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
`;
