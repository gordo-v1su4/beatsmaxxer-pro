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
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var videoTex: texture_2d<f32>;
@group(0) @binding(2) var videoSampler: sampler;
@group(0) @binding(3) var feedbackTex: texture_2d<f32>;
@group(0) @binding(4) var feedbackSampler: sampler;

fn beatPulse(sharpness: f32) -> f32 {
  return u.playing * exp(-u.beatPhase * sharpness);
}

fn accentRgb() -> vec3f {
  return vec3f(u.colorR, u.colorG, u.colorB);
}

fn testCard(uv: vec2f) -> vec3f {
  let grid = step(0.5, fract(uv.x * 24.0)) * step(0.5, fract(uv.y * 14.0));
  let pulse = 0.45 + 0.55 * beatPulse(8.0);
  return vec3f(0.045, 0.05, 0.06) + vec3f(0.045) * grid * pulse;
}

fn moduleIdle(uv: vec2f, mode: f32) -> vec3f {
  let lo = uv.y;
  let inBand = smoothstep(0.52, 0.58, lo);
  let t = u.beat + u.beatPhase;
  let pulse = 0.35 + 0.65 * beatPulse(8.0);
  var graphic = vec3f(0.0);

  if (mode == 1.0) {
    let along = (uv.x - 0.5) * 4.0 - t * 1.4;
    let chev = smoothstep(0.78, 0.9, fract(along)) * smoothstep(0.42, 0.0, abs(uv.y - 0.72));
    graphic = accentRgb() * chev * 0.65;
  } else if (mode == 2.0) {
    let x = fract(uv.x * 7.0 - t * 1.4);
    let tick = smoothstep(0.10, 0.03, abs(x - 0.5));
    graphic = accentRgb() * tick * (0.25 + 0.55 * smoothstep(0.4, 0.0, abs(uv.y - 0.72)));
  } else if (mode == 3.0) {
    let taps = 3.0 + floor(u.p0 * 5.0);
    var acc = vec3f(0.0);
    for (var i = 0; i < 6; i = i + 1) {
      let fi = f32(i);
      if (fi >= taps) { continue; }
      let tx = fract(t * (0.35 + u.p1 * 0.4) + fi / taps);
      let tap = smoothstep(0.04, 0.0, abs(uv.x - tx)) * smoothstep(0.35, 0.0, abs(uv.y - 0.72));
      acc += accentRgb() * tap * (1.0 - fi * 0.12);
    }
    graphic = acc;
  } else if (mode == 4.0) {
    let slices = max(4.0, floor(u.p1 * 32.0 + 4.0));
    let sliceW = 1.0 / slices;
    let idx = floor(fract(t * 0.25 * (u.p0 + 0.2)) * slices);
    let sx = idx * sliceW;
    let bar = step(sx, uv.x) * step(uv.x, sx + sliceW - 0.004);
    let play = smoothstep(0.35, 0.0, abs(uv.y - 0.72));
    graphic = accentRgb() * bar * play * 0.75;
  } else if (mode == 5.0) {
    let ring = smoothstep(0.08, 0.0, abs(length(uv - vec2f(0.5, 0.72)) - 0.12 - beatPulse(6.0) * 0.06));
    graphic = accentRgb() * ring * 0.8;
  } else if (mode == 6.0) {
    let shake = vec2f(sin(t * 8.0 + uv.y * 30.0), cos(t * 7.0 + uv.x * 28.0)) * u.p0 * 0.015;
    let dot = smoothstep(0.02, 0.0, length(fract(vec2f(uv.x + shake.x, uv.y + shake.y) * vec2f(18.0, 10.0)) - 0.5));
    graphic = accentRgb() * dot * 0.55;
  } else if (mode == 7.0) {
    let angle = t * 0.785 * u.p1;
    let c = uv - vec2f(0.5, 0.72);
    let rot = vec2f(c.x * cos(angle) - c.y * sin(angle), c.x * sin(angle) + c.y * cos(angle));
    let cross = smoothstep(0.02, 0.0, abs(rot.x)) + smoothstep(0.02, 0.0, abs(rot.y));
    graphic = accentRgb() * min(cross, 1.0) * 0.45;
  } else if (mode == 8.0) {
    let dist = length(uv - vec2f(0.5, 0.72));
    let ring = smoothstep(0.18, 0.12, dist) * smoothstep(0.02, 0.08, dist);
    graphic = accentRgb() * ring * (0.35 + beatPulse(5.0) * 0.55);
  } else {
    let scan = step(0.5, fract(uv.y * 120.0 + t * 2.0));
    graphic = accentRgb() * scan * 0.08;
  }

  let upper = testCard(uv);
  return mix(upper, upper + graphic * inBand, inBand) * pulse;
}

fn sampleSource(uv: vec2f) -> vec3f {
  var col: vec3f;
  if (u.hasVideo > 0.5) {
    let pitchOff = u.pitchNorm * 0.012;
    let c = textureSample(videoTex, videoSampler, clamp(uv + vec2f(pitchOff, 0.0), vec2f(0.0), vec2f(1.0)));
    col = pow(max(c.rgb, vec3f(0.0)), vec3f(0.95));
    if (abs(u.pitchNorm) > 0.01) {
      let split = u.pitchNorm * 0.008;
      col.r = textureSample(videoTex, videoSampler, clamp(uv + vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).r;
      col.b = textureSample(videoTex, videoSampler, clamp(uv - vec2f(split, 0.0), vec2f(0.0), vec2f(1.0))).b;
    }
  } else {
    col = moduleIdle(uv, floor(u.effectMode + 0.5));
  }
  return col;
}

fn sampleFeedback(uv: vec2f) -> vec3f {
  let dims = textureDimensions(feedbackTex);
  if (dims.x < 2u || dims.y < 2u) { return vec3f(0.0); }
  return textureSample(feedbackTex, feedbackSampler, uv).rgb;
}

fn rot2(p: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
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

/** Jump interval in beats from the JMP zones (1/16 .. 1 BAR). */
fn samplerJumpBeats(p: f32) -> f32 {
  if (p < 0.2) { return 0.25; }
  else if (p < 0.4) { return 0.5; }
  else if (p < 0.6) { return 1.0; }
  else if (p < 0.8) { return 2.0; }
  return 4.0;
}

/** Simpler-style slice sampler: the actual slice jump is a real video seek done
    upstream (videoPool.seekModule from the live schedule frame), so the picture
    genuinely teleports. This adds the per-jump HIT accent — a quick pop right
    after each jump that decays to clean playback — plus tape wobble when the
    rate is off 1x. p2 = JMP interval, accent = LUM(1) vs off. */
fn effectTimeSampler(col: vec3f, uv: vec2f) -> vec3f {
  let jumpBeats = samplerJumpBeats(u.p2);
  // how far through the current slice we are: 0 right after a jump, 1 just before
  let prog = clamp((u.beat - floor(u.beat / jumpBeats) * jumpBeats) / jumpBeats, 0.0, 1.0);

  let rate = 0.25 + u.p0 * 1.75;
  let wob = clamp(abs(rate - 1.0) - 0.05, 0.0, 1.0);
  var st = uv;
  st.x += sin(uv.y * 60.0 + u.beat * 9.0) * wob * 0.004;
  var wet = sampleSource(clamp(st, vec2f(0.0), vec2f(1.0)));

  // the pop lands on the jump and decays fast, so cuts read as deliberate hits
  let hit = exp(-prog * 6.0) * u.playing;
  if (u.accent > 0.5) {
    // LUM: exposure pop (gain + gamma lift), like a flash frame
    wet = pow(max(wet, vec3f(0.0)), vec3f(1.0 / (1.0 + hit * 0.9))) * (1.0 + hit * 0.55);
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

  let rack = 0.5 - 0.5 * cos(fract(u.beat / 2.0) * 6.28318530718);
  let k = rack * (0.2 + pulseP * 0.8);
  let blur = k * (0.004 + amt * 0.045);

  var wet = vec3f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let a = f32(i) / 8.0 * 6.28318530718;
    wet += sampleSource(clamp(uv + vec2f(cos(a), sin(a)) * blur, vec2f(0.0), vec2f(1.0)));
  }
  wet /= 8.0;
  // out-of-focus highlights bloom, the way a fast lens does wide open
  wet += max(wet - vec3f(0.62), vec3f(0.0)) * soft * min(1.0, blur * 45.0);
  return wet;
}

fn effectFilm(col: vec3f, uv: vec2f, mode: f32) -> vec3f {
  var c = col;
  if (mode > 0.5 && mode < 1.5) {
    let n = fract(sin(dot(uv * 900.0 + u.beat, vec2f(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * u.p0 * 0.003;
  } else if (mode > 1.5 && mode < 2.5) {
    let split = u.p1 * 0.003 * beatPulse(4.0);
    c.r = sampleSource(uv + vec2f(split, 0.0)).r;
    c.b = sampleSource(uv - vec2f(split, 0.0)).b;
  } else if (mode > 2.5) {
    let scan = step(0.5, fract(uv.y * 240.0 + u.beat * 2.0));
    c *= mix(0.9, 1.0, scan);
  }
  return c;
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
  else if (mode >= 9.0) { wet = effectFilm(dry, uv, mode - 8.0); }

  let m = clamp(u.mix, 0.0, 1.0);
  let rgb = mix(dry, wet, m);
  return vec4f(rgb * (1.0 + u.amplitude * 0.06), 1.0);
}
`;

export const SHADER_EFFECT_MODE: Record<string, number> = {
  transition: 1,
  speedramp: 2,
  tapdelay: 3,
  timesampler: 4,
  punch: 5,
  shake: 6,
  orbit: 7,
  focus: 8,
  grain: 9,
  leak: 10,
  vhs: 11,
  camcorder: 11,
  anamorphic: 9,
  dutch: 7,
  halation: 10,
  bulge: 5,
  prism: 10,
  streak: 3
};
