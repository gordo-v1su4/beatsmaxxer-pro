import { WGSL_FULLSCREEN_VERTEX } from './shaders/wgslLib';

export const TEST_PATTERN_WGSL =
  WGSL_FULLSCREEN_VERTEX +
  /* wgsl */ `
struct Uniforms {
  time: f32,
  color: vec3f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let grid = step(0.5, fract(input.uv.x * 20.0)) * step(0.5, fract(input.uv.y * 20.0));
  let pulse = 0.5 + 0.5 * sin(u.time * 2.0);
  let rgb = u.color * (0.4 + 0.6 * grid) * pulse;
  return vec4f(rgb, 1.0);
}
`;

export const PASSTHROUGH_WGSL =
  WGSL_FULLSCREEN_VERTEX +
  /* wgsl */ `
@group(0) @binding(0) var sourceTex: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(sourceTex, sourceSampler, input.uv);
}
`;

export const EXTERNAL_TEXTURE_INGEST_WGSL =
  WGSL_FULLSCREEN_VERTEX +
  /* wgsl */ `
fn srgbToLinear(value: vec3f) -> vec3f {
  let low = value / 12.92;
  let high = pow((value + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(high, low, value <= vec3f(0.04045));
}

@group(0) @binding(0) var sourceFrame: texture_external;
@group(0) @binding(1) var externalSampler: sampler;

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let converted = textureSampleBaseClampToEdge(sourceFrame, externalSampler, input.uv);
  return vec4f(srgbToLinear(converted.rgb), converted.a);
}
`;

export const TIMESAMPLER_COMPOSITE_WGSL =
  WGSL_FULLSCREEN_VERTEX +
  /* wgsl */ `
struct EffectUniforms {
  mode: f32,
  envelope: f32,
  rgbOffset: f32,
  mix: f32,
}

@group(0) @binding(0) var linearSource: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> effect: EffectUniforms;

fn linearToSrgb(value: vec3f) -> vec3f {
  let safe = clamp(value, vec3f(0.0), vec3f(1.0));
  let low = safe * 12.92;
  let high = 1.055 * pow(safe, vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(high, low, safe <= vec3f(0.0031308));
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let dry = textureSample(linearSource, sourceSampler, input.uv);
  var wet = dry;
  if (effect.mode < 0.5) {
    let maxChannel = max(dry.r, max(dry.g, dry.b));
    let targetScale = 1.0 + effect.envelope * 0.16;
    let safeScale = select(1.0, min(targetScale, 0.998 / maxChannel), maxChannel > 0.0);
    wet = vec4f(dry.rgb * safeScale, dry.a);
  } else if (effect.mode < 1.5) {
    let offset = vec2f(effect.rgbOffset * effect.envelope, 0.0);
    wet.r = textureSample(linearSource, sourceSampler, input.uv + offset).r;
    wet.b = textureSample(linearSource, sourceSampler, input.uv - offset).b;
  }
  let composed = mix(dry, wet, effect.mix);
  return vec4f(linearToSrgb(composed.rgb), composed.a);
}
`;
