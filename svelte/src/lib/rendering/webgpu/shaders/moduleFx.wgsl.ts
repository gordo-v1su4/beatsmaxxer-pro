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
  hasVideo: f32,
  colorR: f32,
  colorG: f32,
  colorB: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var videoTex: texture_external;
@group(0) @binding(2) var videoSampler: sampler;

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
  if (u.hasVideo > 0.5) {
    let c = textureSampleBaseClampToEdge(videoTex, videoSampler, uv);
    return pow(max(c.rgb, vec3f(0.0)), vec3f(0.95));
  }
  return moduleIdle(uv, floor(u.effectMode + 0.5));
}

fn effectTransition(col: vec3f, uv: vec2f) -> vec3f {
  let amt = u.p0;
  let dur = max(0.05, u.p1);
  let kick = beatPulse(14.0);
  let prog = smoothstep(0.0, dur, u.beatPhase) * amt * kick;
  let wipe = step(prog, uv.x + uv.y * 0.15);
  return mix(col, accentRgb() * 1.25, (1.0 - wipe) * amt);
}

fn effectSpeedRamp(col: vec3f, uv: vec2f) -> vec3f {
  let spd = mix(0.5, 2.5, u.p0);
  let phase = u.beatPhase * spd;
  let offset = (phase - floor(phase)) * 0.035 * u.p0;
  return sampleSource(clamp(uv + vec2f(offset, 0.0), vec2f(0.0), vec2f(1.0)));
}

fn effectTapDelay(col: vec3f, uv: vec2f) -> vec3f {
  let fb = u.p1;
  let delayAmt = u.p0;
  let kick = beatPulse(10.0);
  let ghostOffset = vec2f(delayAmt * 0.04 * kick, 0.0);
  let ghost = sampleSource(clamp(uv + ghostOffset, vec2f(0.0), vec2f(1.0)));
  return mix(col, ghost, fb * (0.35 + u.bassAmp * 0.65) * kick);
}

fn effectTimeSampler(col: vec3f, uv: vec2f) -> vec3f {
  let slices = max(4.0, floor(u.p1 * 32.0 + 4.0));
  let sliceIdx = floor(u.beat * u.p0 * 0.25) % slices;
  let jump = sliceIdx / slices;
  let shifted = sampleSource(vec2f(fract(uv.x + jump * 0.12), uv.y));
  if (u.accent > 0.5) {
    return shifted * (1.0 + beatPulse(6.0) * 0.35);
  }
  return shifted;
}

fn effectPunch(col: vec3f, uv: vec2f) -> vec3f {
  let amt = u.p0;
  let pulse = beatPulse(9.0) * amt;
  let c = vec2f(0.5) + (uv - vec2f(0.5)) * (1.0 - pulse * 0.4);
  return sampleSource(clamp(c, vec2f(0.0), vec2f(1.0)));
}

fn effectShake(col: vec3f, uv: vec2f) -> vec3f {
  let hand = u.p0;
  let kick = beatPulse(7.0);
  let shake = vec2f(
    sin(u.beat * 6.28318 + uv.y * 20.0),
    cos(u.beat * 5.5 + uv.x * 18.0)
  ) * hand * 0.018 * (0.4 + kick + u.amplitude * 0.6);
  return sampleSource(clamp(uv + shake, vec2f(0.0), vec2f(1.0)));
}

fn effectDrift(col: vec3f, uv: vec2f) -> vec3f {
  let drift = u.p1;
  let angle = u.beat * 0.785398 * drift;
  let c = uv - vec2f(0.5);
  let rot = vec2f(
    c.x * cos(angle) - c.y * sin(angle),
    c.x * sin(angle) + c.y * cos(angle)
  ) + vec2f(0.5);
  return sampleSource(clamp(rot, vec2f(0.0), vec2f(1.0)));
}

fn effectFocus(col: vec3f, uv: vec2f) -> vec3f {
  let amt = u.p0;
  let pulse = beatPulse(5.0) * amt;
  let dist = length(uv - vec2f(0.5));
  let blurAmt = pulse * smoothstep(0.15, 0.65, dist) * 0.022;
  var acc = vec3f(0.0);
  acc += sampleSource(uv);
  acc += sampleSource(uv + vec2f(blurAmt, 0.0));
  acc += sampleSource(uv - vec2f(blurAmt, 0.0));
  return acc / 3.0;
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
