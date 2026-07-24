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
