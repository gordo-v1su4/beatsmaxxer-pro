/** Fullscreen blit — presents offscreen FX texture to canvas. */
export const BLIT_WGSL = /* wgsl */ `
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

@group(0) @binding(0) var blitTex: texture_2d<f32>;
@group(0) @binding(1) var blitSampler: sampler;

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(blitTex, blitSampler, input.uv);
}
`;

/** 1×1 black placeholder for first feedback frame. */
export function createFeedbackPlaceholder(device: GPUDevice): GPUTexture {
  const tex = device.createTexture({
    size: { width: 1, height: 1 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([0, 0, 0, 255]),
    { bytesPerRow: 4 },
    { width: 1, height: 1 }
  );
  return tex;
}

export function createFeedbackPair(
  device: GPUDevice,
  width: number,
  height: number
): FeedbackPair {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const usage =
    GPUTextureUsage.RENDER_ATTACHMENT |
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.COPY_DST;
  const tex0 = device.createTexture({ size: { width: w, height: h }, format: 'rgba8unorm', usage });
  const tex1 = device.createTexture({ size: { width: w, height: h }, format: 'rgba8unorm', usage });
  return {
    textures: [tex0, tex1],
    views: [tex0.createView(), tex1.createView()],
    ping: 0,
    width: w,
    height: h,
    generation: -1,
    fixedStepIndex: -1
  };
}

export interface FeedbackPair {
  textures: [GPUTexture, GPUTexture];
  views: [GPUTextureView, GPUTextureView];
  ping: 0 | 1;
  width: number;
  height: number;
  generation: number;
  fixedStepIndex: number;
}

export function advanceFeedbackTo(
  fb: FeedbackPair,
  generation: number,
  fixedStepIndex: number,
) {
  if (fb.generation !== generation) {
    fb.generation = generation;
    fb.fixedStepIndex = fixedStepIndex;
    fb.ping = 0;
    return { reset: true, steps: 1, degraded: false, skippedSteps: 0 } as const;
  }
  const steps = Math.max(0, fixedStepIndex - fb.fixedStepIndex);
  if (steps > 0) fb.fixedStepIndex = fixedStepIndex;
  if (steps > 1) {
    // Exact catch-up would require replaying every historical video/audio input.
    // Reset instead of pretending one render pass advanced `steps` semantic frames.
    fb.ping = 0;
    return {
      reset: true,
      steps: 1,
      degraded: true,
      skippedSteps: steps - 1
    } as const;
  }
  return { reset: false, steps, degraded: false, skippedSteps: 0 } as const;
}

export function swapFeedback(fb: FeedbackPair) {
  fb.ping = fb.ping === 0 ? 1 : 0;
}

export function feedbackReadView(fb: FeedbackPair): GPUTextureView {
  return fb.views[fb.ping];
}

export function feedbackWriteView(fb: FeedbackPair): GPUTextureView {
  return fb.views[fb.ping === 0 ? 1 : 0];
}
