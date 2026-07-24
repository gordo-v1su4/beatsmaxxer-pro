export const FULLSCREEN_VERTEX_GLSL = `#version 300 es
precision highp float;
out vec2 vUv;
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  vec2 position = positions[gl_VertexID];
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = vec2(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5));
}`;

export const FULLSCREEN_VERTEX_UNFLIPPED_GLSL = `#version 300 es
precision highp float;
out vec2 vUv;
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  vec2 position = positions[gl_VertexID];
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = position * 0.5 + 0.5;
}`;

export const EXTERNAL_TO_LINEAR_GLSL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
out vec4 outColor;
vec3 srgbToLinear(vec3 value) {
  vec3 low = value / 12.92;
  vec3 high = pow((value + 0.055) / 1.055, vec3(2.4));
  return mix(high, low, lessThanEqual(value, vec3(0.04045)));
}
void main() {
  vec4 source = texture(uSource, vUv);
  outColor = vec4(srgbToLinear(source.rgb), source.a);
}`;

export const TIMESAMPLER_COMPOSITE_GLSL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uLinearSource;
uniform vec4 uEffect;
out vec4 outColor;
vec3 linearToSrgb(vec3 value) {
  vec3 safe = clamp(value, 0.0, 1.0);
  vec3 low = safe * 12.92;
  vec3 high = 1.055 * pow(safe, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, lessThanEqual(safe, vec3(0.0031308)));
}
void main() {
  vec4 dry = texture(uLinearSource, vUv);
  vec4 wet = dry;
  if (uEffect.x < 0.5) {
    float maxChannel = max(dry.r, max(dry.g, dry.b));
    float targetScale = 1.0 + uEffect.y * 0.16;
    float safeScale = maxChannel > 0.0
      ? min(targetScale, 0.998 / maxChannel)
      : 1.0;
    wet = vec4(dry.rgb * safeScale, dry.a);
  } else if (uEffect.x < 1.5) {
    vec2 offset = vec2(uEffect.z * uEffect.y, 0.0);
    wet.r = texture(uLinearSource, vUv + offset).r;
    wet.b = texture(uLinearSource, vUv - offset).b;
  }
  vec4 composed = mix(dry, wet, uEffect.w);
  outColor = vec4(linearToSrgb(composed.rgb), composed.a);
}`;
