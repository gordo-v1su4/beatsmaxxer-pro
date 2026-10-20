import { createSplashLayerScene } from './SplashLayerScene';
import { getPreferredCanvasFormat, getSharedWebGpuDevice } from './SharedGpuDevice';
import { moduleFxWgslForMode, SHADER_EFFECT_MODE } from './shaders/moduleFx.wgsl';

/** Keep the blue chrome, shift the pink into teal, and soften the intensity. */
function splashShader(): string {
  const source = moduleFxWgslForMode(SHADER_EFFECT_MODE.vhs, 'idle');
  const output = 'return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), 1.0);';
  if (source.split(output).length !== 2) throw new Error('Splash shader: the shared FX output changed.');
  return source.replace(output, `
    let luminance = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
    let pink = smoothstep(0.025, 0.16, rgb.r - rgb.g) * smoothstep(0.025, 0.16, rgb.b - rgb.g);
    let low = min(rgb.r, min(rgb.g, rgb.b));
    let chroma = max(rgb.r, max(rgb.g, rgb.b)) - low;
    let teal = vec3f(low) + vec3f(0.10, 0.85, 0.74) * chroma;
    let tealLuminance = max(dot(teal, vec3f(0.2126, 0.7152, 0.0722)), 0.0001);
    let recolored = mix(rgb, teal * min(luminance / tealLuminance, 1.5), pink);
    let softened = mix(vec3f(luminance), recolored, 0.80) * 0.85 * smoothstep(0.015, 0.08, luminance);
    return vec4f(clamp(softened, vec3f(0.0), vec3f(1.0)), 1.0);
  `);
}

/** The rack's actual VHS shader, using its existing 2D texture variant. */
export async function renderSplashGraphic(
  canvases: readonly HTMLCanvasElement[],
  signal: AbortSignal,
  reducedMotion: boolean
): Promise<() => void> {
  const device = await getSharedWebGpuDevice();
  signal.throwIfAborted();
  if (!device) throw new Error('WebGPU is required to display the splash treatment.');
  const surfaces = canvases.map((canvas) => {
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('The splash graphics surface could not start.');
    return { canvas, context };
  });
  const format = getPreferredCanvasFormat();
  const layout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
  ] });
  const module = device.createShaderModule({ code: splashShader() });
  const pipeline = await device.createRenderPipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: 'vertexMain' },
    fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }
  });
  signal.throwIfAborted();
  const scene = await createSplashLayerScene(device, signal, reducedMotion);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  let group: GPUBindGroup;
  const buffer = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let frame = 0;
  let stopped = false;
  let drawStaticFrame: (() => void) | undefined;
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    scene.dispose();
    buffer.destroy();
    for (const { context } of surfaces) context.unconfigure();
    signal.removeEventListener('abort', dispose);
  };
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const { canvas } of surfaces) {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    }
    scene.resize(surfaces[0].canvas.width, surfaces[0].canvas.height);
    const view = scene.texture.createView();
    group = device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer } },
      { binding: 1, resource: view }, { binding: 2, resource: sampler },
      { binding: 3, resource: view }, { binding: 4, resource: sampler }
    ] });
  };
  const observer = new ResizeObserver(() => { resize(); drawStaticFrame?.(); });
  try {
    for (const { context } of surfaces) {
      context.configure({ device, format, alphaMode: 'opaque',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    }
    resize();
    for (const { canvas } of surfaces) observer.observe(canvas);
    signal.addEventListener('abort', dispose, { once: true });
    const started = performance.now();
    const data = new Float32Array(40);
    data[2] = 120;
    data[6] = 1;
    data[7] = SHADER_EFFECT_MODE.vhs;
    data[8] = 0.025; // Slight tape movement; no large tears or beat glitches.
    data[9] = 0.06;
    data[10] = 0.42; // The existing shader's scanline/noise channel.
    data[14] = 1; // Sample the supplied image rather than the idle test card.
    data[19] = 2944 / 1648;
    data[30] = -1;
    const draw = (now: number) => {
      if (stopped) return;
      data[0] = reducedMotion ? 0 : (now - started) / 500;
      device.queue.writeBuffer(buffer, 0, data);
      const encoder = device.createCommandEncoder();
      scene.render(encoder, (now - started) / 1000);
      // The assembled layers go through the existing VHS shader as one image.
      for (const { context } of surfaces) {
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear', storeOp: 'store'
        }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
      }
      device.queue.submit([encoder.finish()]);
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    if (reducedMotion) drawStaticFrame = () => draw(started);
    draw(started);
    await device.queue.onSubmittedWorkDone();
    signal.throwIfAborted();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
