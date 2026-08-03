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
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var videoTex: texture_external;
@group(0) @binding(2) var videoSampler: sampler;
@group(0) @binding(3) var feedbackTex: texture_2d<f32>;
@group(0) @binding(4) var feedbackSampler: sampler;

fn beatPulse(sharpness: f32) -> f32 {
  return u.playing * exp(-u.beatPhase * sharpness);
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

/** Mirrored repeat that maps 0.5 back to 0.5, so a fold centred on the frame
    stays centred on the source. Folding with fract(x + 0.5) instead lands the
    centre of the frame on the corner of the source. */
fn mirrorRepeat(x: f32) -> f32 {
  return 1.0 - abs(fract(x * 0.5) * 2.0 - 1.0);
}

/** Shared idle-card treatment: graphics fade to black toward the top and bottom
    of the lower band so every module's idle reads as one family. */
fn idleFade(y: f32) -> f32 {
  return 0.22 + 0.78 * smoothstep(0.50, 0.18, abs(y - 0.5));
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
    // TAPDELAY — the classic tap lines: echo taps sweep with LEN, fade with FEEDBACK
    let taps = 3.0 + floor(u.p1 * 5.0);
    for (var i = 0; i < 8; i = i + 1) {
      let fi = f32(i);
      if (fi >= taps) { continue; }
      let tx = fract(t * (0.35 + u.p0 * 0.5) - fi / max(taps, 1.0));
      let line = smoothstep(0.012, 0.0, abs(p.x - tx));
      let decay = pow(clamp(u.p1, 0.0, 1.0), fi * 0.7);
      col += acc * line * decay * (0.35 + 0.65 * smoothstep(0.45, 0.0, abs(p.y - 0.5))) * fade;
    }
  } else if (mode == 4.0) {
    // TIMESAMPLER — MIDI piano roll climbing an arpeggio staircase, so FWD/REV read
    let gx = p.x * asp * 3.2 + t * 1.8;
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
  } else {
    // film-look modules: fine scan lines
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

  let beatInCycle = u.beat - floor(u.beat / intervalBeats) * intervalBeats;
  let start = intervalBeats - durBeats;
  if (beatInCycle < start) { return col; }

  let p = clamp((beatInCycle - start) / durBeats, 0.0, 1.0);
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

/** The time remap itself happens upstream (video.playbackRate from the bezier
    solve in JS, handed here as aux1). This adds the LOOK of speed: horizontal
    motion streaking and chroma pull that scale with how far the rate sits from
    1x, slow-mo glow, and fast-motion contrast crunch. */
fn effectSpeedRamp(col: vec3f, uv: vec2f) -> vec3f {
  let rate = max(u.aux1, 0.001);
  // 0 at 1x, 1 at 4x or 0.25x — log-symmetric so slow and fast read equally
  let dev = clamp(abs(log2(rate)) / 2.0, 0.0, 1.0);

  var wet = vec3f(0.0);
  let span = dev * 0.035;
  for (var i = 0; i < 5; i = i + 1) {
    let o = (f32(i) / 4.0 - 0.5) * span;
    wet += sampleSource(clamp(uv + vec2f(o, 0.0), vec2f(0.0), vec2f(1.0)));
  }
  wet /= 5.0;

  let split = dev * 0.012;
  wet.r = sampleSource(clamp(uv + vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).r;
  wet.b = sampleSource(clamp(uv - vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).b;

  var gain = 1.0 - dev * 0.05;
  if (rate < 1.0) { gain = 1.0 + dev * 0.15; }
  return wet * (gain + beatPulse(6.0) * 0.05);
}

/** Stutter length in beats from the LEN zones the UI exposes (1/32 .. 1/4). */
fn stutterLenBeats(p: f32) -> f32 {
  if (p < 0.2) { return 0.125; }
  else if (p < 0.4) { return 0.25; }
  else if (p < 0.6) { return 0.33333; }
  else if (p < 0.8) { return 0.5; }
  return 1.0;
}

/** Real feedback echo: each frame drags the PREVIOUS output through a small
    offset/zoom so trails accumulate over time (ping-pong buffer), with a
    beat-quantized stutter that re-fires on every LEN division. FEEL reshapes
    the repeat grid: 0 straight, 1 swing (long/short), 2 dotted (1.5x).
    p0 = LEN, p1 = feedback, p2 = feel. */
fn effectTapDelay(col: vec3f, uv: vec2f) -> vec3f {
  let fb = clamp(u.p1, 0.0, 1.0);
  var seg = stutterLenBeats(u.p0);
  let feel = floor(clamp(u.p2, 0.0, 1.0) * 100.0 + 0.5);

  // FEEL reshapes the repeat grid on top of whatever LEN is set
  if (feel > 1.5) {
    seg = seg * 1.5;                                   // dotted
  } else if (feel > 0.5) {
    // swing: long first half of each pair, short second half
    let pair = floor(u.beat / (seg * 2.0));
    let inPair = u.beat - pair * seg * 2.0;
    if (inPair < seg * 1.34) { seg = seg * 1.34; } else { seg = seg * 0.66; }
  }
  let prog = clamp((u.beat - floor(u.beat / seg) * seg) / seg, 0.0, 1.0);

  // trails: pull the previous frame in with a slight zoom + drift so echoes
  // smear along the move instead of sitting perfectly on top of each other
  let drift = vec2f(0.006 + fb * 0.010, 0.0);
  let zoom = 1.0 - (0.004 + fb * 0.010);
  var fbUv = (uv - vec2f(0.5)) * zoom + vec2f(0.5) + drift * (0.5 - prog);
  let prev = sampleFeedback(clamp(fbUv, vec2f(0.0), vec2f(1.0)));

  // ceiling below 1.0 keeps the feedback loop from blowing out to white
  let decay = clamp(fb * 0.94, 0.0, 0.94);
  var wet = max(col, prev * decay);

  // per-repeat accent: a flash + chroma split right at each stutter division
  let hit = exp(-prog * 7.0) * u.playing;
  let sp = hit * fb * 0.03;
  wet.r = mix(wet.r, sampleSource(clamp(uv + vec2f(sp, 0.0), vec2f(0.0), vec2f(1.0))).r, hit);
  wet.b = mix(wet.b, sampleSource(clamp(uv - vec2f(sp, 0.0), vec2f(0.0), vec2f(1.0))).b, hit);
  wet *= 1.0 + hit * (0.20 + u.bassAmp * 0.5);

  // scrub tap: within a repeat the frame slides, reading as a time smear
  let smear = (0.5 - prog) * fb * 0.05;
  let tap = sampleSource(clamp(uv + vec2f(smear, 0.0), vec2f(0.0), vec2f(1.0)));
  return mix(wet, max(wet, tap), fb * 0.35);
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
  let pulse = u.playing * exp(-u.beatPhase * (3.0 + snap * 9.0));
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
  return sampleSource(clamp(c / z + vec2f(0.5) + drift + jit + stepOff, vec2f(0.0), vec2f(1.0)));
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
  return sampleSource(clamp((uv - vec2f(0.5)) / z + vec2f(0.5) + offs, vec2f(0.0), vec2f(1.0)));
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

/** Scope presentation: variable letterbox, optical horizontal squeeze and a
    timeline-locked blue flare. p0 = bars, p1 = squeeze, p2 = flare. */
fn effectAnamorphic(col: vec3f, uv: vec2f) -> vec3f {
  let squeeze = 1.0 + u.p1 * 0.45;
  let suv = clamp(vec2f((uv.x - 0.5) / squeeze + 0.5, uv.y), vec2f(0.0), vec2f(1.0));
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
  let n = hash21(floor(guv * cellScale) + vec2f(frame * 0.71, frame * 1.13));
  let stock = sampleSource(guv);
  return stock + vec3f(n - 0.5) * u.p1 * 0.34;
}

/** Warm edge exposure with a slowly travelling hotspot. p0 = edge reach,
    p1 = warmth, p2 = drift speed. */
fn effectLeak(col: vec3f, uv: vec2f) -> vec3f {
  let phase = u.beat * (0.04 + u.p2 * 0.22);
  let side = 0.5 + 0.5 * sin(phase);
  let edgeDistance = mix(uv.x, 1.0 - uv.x, side);
  let reach = 0.08 + u.p0 * 0.52;
  let leak = (1.0 - smoothstep(0.0, reach, edgeDistance))
             * (0.55 + 0.45 * sin(uv.y * 7.0 + phase * 2.3));
  let warm = mix(vec3f(1.0, 0.28, 0.04), vec3f(1.0, 0.75, 0.24), u.p1);
  return col + warm * leak * (0.25 + u.p1 * 0.7);
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
  return sampleSource(clamp(c / zoom + vec2f(0.5), vec2f(0.0), vec2f(1.0)));
}

/** Highlight-selective red bloom. p0 = threshold, p1 = spread,
    p2 = warm tint. */
fn effectHalation(col: vec3f, uv: vec2f) -> vec3f {
  let radius = 0.002 + u.p1 * 0.035;
  var bloom = vec3f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let a = f32(i) * 0.78539816339;
    let s = sampleSource(clamp(uv + vec2f(cos(a), sin(a)) * radius, vec2f(0.0), vec2f(1.0)));
    bloom += max(s - vec3f(0.25 + u.p0 * 0.65), vec3f(0.0));
  }
  bloom /= 8.0;
  let tint = mix(vec3f(1.0, 0.42, 0.28), vec3f(1.0, 0.16, 0.08), u.p2);
  return col + bloom * tint * (0.7 + u.p1 * 1.5);
}

/** Radial barrel/fisheye warp. p0 = bulge amount, p1 = vertical
    center, p2 = radial falloff. */
fn effectBulge(col: vec3f, uv: vec2f) -> vec3f {
  let center = vec2f(0.5, mix(0.28, 0.72, u.p1));
  var d = uv - center;
  d.x *= max(u.aspect, 0.0001);
  let r2 = dot(d, d);
  let reach = mix(1.8, 0.45, u.p2);
  let influence = exp(-r2 / max(reach * reach, 0.001));
  let warp = 1.0 - u.p0 * 0.65 * influence;
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
  let glitch = u.p3 * (0.15 + 0.85 * beatPulse(6.0));

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
  let span = u.p0 * 0.12 * pulse;
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

/** INCEPTION — the mirror family. p0 selects the fold (mirror X, mirror Y,
    quad, kaleido-6, recursive inception tiles), p1 shifts the fold pivot,
    p2 spins, p3 = beat reaction (kaleido spin snap / inception zoom pump). */
fn effectMirror(col: vec3f, uv0: vec2f) -> vec3f {
  let kind = floor(u.p0 * 4.0 + 0.5);
  let asp = max(u.aspect, 0.0001);
  let pivot = 0.25 + u.p1 * 0.5;
  let pulse = beatPulse(5.0) * u.p3;
  var uv = uv0;

  if (kind < 0.5) {
    uv.x = pivot - abs(uv0.x - pivot);
  } else if (kind < 1.5) {
    uv.y = pivot - abs(uv0.y - pivot);
  } else if (kind < 2.5) {
    uv.x = pivot - abs(uv0.x - pivot);
    uv.y = 0.5 - abs(uv0.y - 0.5);
  } else if (kind < 3.5) {
    var p = vec2f((uv0.x - 0.5) * asp, uv0.y - 0.5);
    let seg = 6.2831853 / 6.0;
    let base = (u.p2 - 0.5) * 2.0 + u.beat * 0.15 * u.p3 + pulse * 0.35;
    var ang = atan2(p.y, p.x) + base;
    ang = abs(fract(ang / seg) - 0.5) * seg;
    let r = length(p);
    p = vec2f(cos(ang), sin(ang)) * r;
    uv = vec2f(p.x / asp + 0.5, p.y + 0.5);
  } else {
    // Recursive fold. mirrorRepeat keeps the screen centre on the source
    // centre; folding with fract(p + 0.5) instead lands the centre of the
    // frame on the corner of the source, which reads as an off-centre smear.
    let z = 1.0 + u.p2 * 2.0 + pulse * 1.5;
    let q = (uv0 - vec2f(0.5)) * z + vec2f(0.5);
    uv = vec2f(mirrorRepeat(q.x), mirrorRepeat(q.y));
  }
  return sampleSource(clamp(uv, vec2f(0.0), vec2f(1.0)));
}

/** SPECIALTY LENS — fisheye to tele-crush glass. p0 = glass (0 = tele
    flatten, 0.5 = neutral, 1 = full fisheye), p1 = punch-in zoom, p2 = edge
    treatment (chromatic fringe + falloff), p3 = beat pump (the lens breathes
    on every beat). */
fn effectLens(col: vec3f, uv0: vec2f) -> vec3f {
  let asp = max(u.aspect, 0.0001);
  let glass = (u.p0 - 0.5) * 2.0;
  let pump = 1.0 - beatPulse(5.0) * u.p3 * 0.12;
  var p = vec2f((uv0.x - 0.5) * asp, uv0.y - 0.5);
  let r = length(p);
  let bend = 1.0 + glass * r * r * 2.2;
  p = p * bend / (1.0 + glass * 0.55);
  p = p * mix(1.0, 0.62, u.p1) * pump;
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
