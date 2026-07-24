export const EXTERNAL_TEXTURE_INGEST_WGSL = /* wgsl */ `
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

fn srgbToLinear(value: vec3f) -> vec3f {
  let low = value / 12.92;
  let high = pow((value + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(high, low, value <= vec3f(0.04045));
}

@group(0) @binding(0) var sourceFrame: texture_external;

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let converted = textureSampleBaseClampToEdge(sourceFrame, input.uv);
  return vec4f(srgbToLinear(converted.rgb), converted.a);
}
`;

export const TIMESAMPLER_COMPOSITE_WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct EffectUniforms {
  mode: f32,
  envelope: f32,
  rgbOffset: f32,
  mix: f32,
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

fn linearToSrgb(value: vec3f) -> vec3f {
  let safe = clamp(value, vec3f(0.0), vec3f(1.0));
  let low = safe * 12.92;
  let high = 1.055 * pow(safe, vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(high, low, safe <= vec3f(0.0031308));
}

@group(0) @binding(0) var linearSource: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> effect: EffectUniforms;

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let dry = textureSample(linearSource, sourceSampler, input.uv);
  var wet = dry;
  if (effect.mode < 0.5) {
    let maxChannel = max(dry.r, max(dry.g, dry.b));
    let targetScale = 1.0 + effect.envelope * 0.16;
    let safeScale = select(
      1.0,
      min(targetScale, 0.998 / maxChannel),
      maxChannel > 0.0
    );
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
