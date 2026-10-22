/** Browser-only GPU differential check, import through the local Vite server.
 * Compares every effect's real pixels with both optional paths independently. */
import { ModePipelineCache } from '../src/lib/rendering/webgpu/ModePipelineCache';
import { SHADER_EFFECT_MODES } from '../src/lib/rendering/webgpu/shaders/moduleFx.wgsl';
import { FxUniformWriter } from '../src/lib/rendering/webgpu/FxUniforms';
import { detectFxCapabilities } from '../src/lib/rendering/webgpu/FxCapabilities';

export async function verifyFxOptimizations() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No GPU adapter');
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener('uncapturederror', event => errors.push(event.error.message));
  const resources: Array<{ destroy(): void }> = [];
  const caches: ModePipelineCache[] = [];
  try {
    const supported = await detectFxCapabilities(device);
    if (!supported.immediates || !supported.sharedTextures) throw new Error('Both optimized paths must be supported to run the comparison');
    const size: [number, number] = [64, 36];
    const texture = (usage: number) => {
      const result = device.createTexture({ size, format: 'rgba8unorm', usage });
      resources.push(result);
      return result;
    };
    const source = texture(GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    const feedback = texture(GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    const pixels = new Uint8Array(size[0] * size[1] * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i * 13) % 251; pixels[i + 1] = (i * 7) % 241;
      pixels[i + 2] = (i * 3) % 239; pixels[i + 3] = 255;
    }
    for (const target of [source, feedback]) device.queue.writeTexture({ texture: target }, pixels, { bytesPerRow: 256 }, size);
    const output = texture(GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC);
    const readback = device.createBuffer({ size: pixels.length, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const uniform = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    resources.push(readback, uniform);
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const sourceView = source.createView(), feedbackView = feedback.createView();
    const baseline = new Map<number, Uint8Array>();
    const report: Array<{ immediates: boolean; sharedTextures: boolean; pipelines: number; comparedModes: number; maxChannelDifference: number }> = [];
    for (const capabilities of [
      { immediates: false, sharedTextures: false },
      { immediates: true, sharedTextures: false },
      { immediates: false, sharedTextures: true },
      { immediates: true, sharedTextures: true }
    ]) {
      const layout = (external: boolean) => device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, ...(external ? { externalTexture: {} } : { texture: {} }) },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
      ] });
      const video = layout(true), idle = capabilities.sharedTextures ? video : layout(false);
      const cache = new ModePipelineCache(device, { video, idle }, capabilities);
      caches.push(cache);
      await cache.warmAll();
      if (cache.readyCount !== cache.totalCount) throw new Error('Not all GPU pipelines compiled');
      const group = device.createBindGroup({ layout: idle, entries: [
        { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: sourceView },
        { binding: 2, resource: sampler }, { binding: 3, resource: feedbackView }, { binding: 4, resource: sampler }
      ] });
      const writer = new FxUniformWriter();
      let maxChannelDifference = 0;
      for (const mode of SHADER_EFFECT_MODES) {
        const data = new Float32Array(40).fill(.5);
        data[0] = 7.2; data[1] = .2; data[2] = 128; data[3] = 1;
        data[6] = .75; data[7] = mode; data[14] = 1; data[19] = 16 / 9;
        data[20] = 1; data[22] = 3.375; data[23] = 1 / 60;
        data[26] = 1; data[30] = -.1;
        const integers = new Uint32Array(data.buffer);
        integers[24] = 203; integers[27] = 4; integers[28] = 0xfedcba98; integers[29] = 207;
        writer.write(device, uniform, data, capabilities.immediates);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: output.createView(), loadOp: 'clear', storeOp: 'store' }] });
        pass.setPipeline(cache.get('idle', mode)!);
        if (capabilities.immediates) pass.setImmediates(0, writer.immediateData);
        pass.setBindGroup(0, group); pass.draw(3); pass.end();
        encoder.copyTextureToBuffer({ texture: output }, { buffer: readback, bytesPerRow: 256 }, size);
        device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const actual = new Uint8Array(readback.getMappedRange()).slice();
        readback.unmap();
        if (!capabilities.immediates && !capabilities.sharedTextures) baseline.set(mode, actual);
        else {
          const expected = baseline.get(mode)!;
          actual.forEach((channel, i) => { maxChannelDifference = Math.max(maxChannelDifference, Math.abs(channel - expected[i])); });
        }
      }
      report.push({ ...capabilities, pipelines: cache.readyCount, comparedModes: SHADER_EFFECT_MODES.length, maxChannelDifference });
      if (maxChannelDifference > 1) throw new Error(`GPU pixel regression: ${JSON.stringify(report)}`);
    }
    await device.queue.onSubmittedWorkDone();
    if (errors.length) throw new Error(errors.join('\n'));
    return { passed: true, report, errors, adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture } };
  } finally {
    caches.forEach(cache => cache.dispose());
    resources.forEach(resource => resource.destroy());
    device.destroy();
  }
}
