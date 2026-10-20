import background from '$lib/assets/splash-layers/particle-background.png';
import divider from '$lib/assets/splash-layers/layer-z5-base-horizontal-divider-line.png';
import subtitle from '$lib/assets/splash-layers/layer-z6-base-katakana-subtitle-text.png';
import pro from '$lib/assets/splash-layers/layer-z7-base-pro-suffix-text.png';
import title from '$lib/assets/splash-layers/layer-z8-base-beatsmaxxer-main-title.png';
import { createSplashTimeline, type SplashLayerMotion } from './splashTimeline';

const BOARD = [2944, 1648] as const;
const LAYERS = [
  { id: 'background', url: background, rect: [0, 0, 2752, 1536], boardRect: [0, 0, 2944, 1648], light: true },
  { id: 'divider', url: divider, rect: [238, 865, 2450, 18], light: false },
  { id: 'subtitle', url: subtitle, rect: [244, 888, 1773, 107], light: false },
  { id: 'pro', url: pro, rect: [1999, 862, 683, 180], light: false },
  { id: 'titleTop', url: title, rect: [250, 557, 2456, 297], light: false },
  { id: 'titleBottom', url: title, rect: [250, 557, 2456, 297], light: false }
] as const;

const LAYER_SHADER = /* wgsl */ `
struct Params { rect: vec4f, motion: vec4f, detail: vec4f }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var art: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
struct Vertex { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) board: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> Vertex {
  var corners = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let uv = corners[i];
  let board = p.rect.xy + uv * p.rect.zw;
  let moved = (board - vec2f(0.5)) * p.motion.z + vec2f(0.5) + p.motion.xy;
  var v: Vertex;
  v.pos = vec4f(moved.x * 2.0 - 1.0, 1.0 - moved.y * 2.0, 0, 1);
  v.uv = uv; v.board = board;
  return v;
}
@fragment fn fragmentMain(v: Vertex) -> @location(0) vec4f {
  if (v.board.y < p.detail.x || v.board.y > p.detail.y || v.uv.x > p.detail.z) { discard; }
  let sample = textureSample(art, linearSampler, v.uv);
  let alpha = sample.a * p.motion.w;
  let color = sample.rgb;
  let glint = exp(-pow((v.board.x - p.detail.w) / 0.025, 2.0)) * 0.16;
  return vec4f(min(color + vec3f(glint), vec3f(1.0)) * alpha, alpha);
}
`;

/** Crop uploads to each layer's occupied bounds; all layout stays in source-board coordinates. */
export async function createSplashLayerScene(device: GPUDevice, signal: AbortSignal, reducedMotion: boolean) {
  const { motion, timeline } = createSplashTimeline(reducedMotion);
  const textures: GPUTexture[] = [];
  const buffers: GPUBuffer[] = [];
  let target: GPUTexture | undefined;
  let width = 1;
  let height = 1;
  const dispose = () => {
    timeline.kill();
    target?.destroy();
    textures.forEach((texture) => texture.destroy());
    buffers.forEach((buffer) => buffer.destroy());
  };
  try {
    const module = device.createShaderModule({ code: LAYER_SHADER });
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipeline = async (light: boolean) => device.createRenderPipelineAsync({
      layout: pipelineLayout, vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: 'rgba8unorm', blend: {
        color: { srcFactor: 'one', dstFactor: light ? 'one-minus-src' : 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      } }] }, primitive: { topology: 'triangle-list' }
    });
    const [alphaPipeline, lightPipeline] = await Promise.all([pipeline(false), pipeline(true)]);
    const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const uploaded = new Map<string, GPUTexture>();
    const draws: Array<{ layer: typeof LAYERS[number]; buffer: GPUBuffer; group: GPUBindGroup }> = [];
    for (const layer of LAYERS) {
      signal.throwIfAborted();
      const cacheKey = `${layer.url}:${layer.rect.join(',')}`;
      let texture = uploaded.get(cacheKey);
      if (!texture) {
        const image = new Image(); image.src = layer.url; await image.decode();
        const [x, y, w, h] = layer.rect;
        const bitmap = await createImageBitmap(image, x, y, w, h);
        try {
          signal.throwIfAborted();
          texture = device.createTexture({ size: [w, h], format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
          textures.push(texture);
          device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, premultipliedAlpha: false }, [w, h]);
          uploaded.set(cacheKey, texture);
        } finally { bitmap.close(); }
      }
      const buffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      buffers.push(buffer);
      const group = device.createBindGroup({ layout, entries: [
        { binding: 0, resource: { buffer } }, { binding: 1, resource: texture.createView() }, { binding: 2, resource: sampler }
      ] });
      draws.push({ layer, buffer, group });
    }
    signal.throwIfAborted();
    return {
      dispose,
      resize(w: number, h: number) {
        if (target && width === w && height === h) return;
        width = w; height = h; target?.destroy();
        target = device.createTexture({ size: [w, h], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      },
      get texture() {
        if (!target) throw new Error('Resize the splash scene before rendering.');
        return target;
      },
      render(encoder: GPUCommandEncoder, seconds: number) {
        if (!reducedMotion) timeline.time(Math.min(seconds, timeline.duration()));
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target!.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
        for (const { layer, buffer, group } of draws) {
          const m: SplashLayerMotion = motion[layer.id];
          if (m.opacity <= 0) continue;
          const [x, y, w, h] = 'boardRect' in layer ? layer.boardRect : layer.rect;
          const clipLow = layer.id === 'titleBottom' ? 0.425 : 0;
          const clipHigh = layer.id === 'titleTop' ? 0.425 : 1;
          device.queue.writeBuffer(buffer, 0, new Float32Array([
            x / BOARD[0], y / BOARD[1], w / BOARD[0], h / BOARD[1],
            m.x, m.y, m.scale, m.opacity, clipLow, clipHigh, m.reveal, m.sheen
          ]));
          pass.setPipeline(layer.light ? lightPipeline : alphaPipeline);
          pass.setBindGroup(0, group); pass.draw(6);
        }
        pass.end();
      }
    };
  } catch (error) { dispose(); throw error; }
}
