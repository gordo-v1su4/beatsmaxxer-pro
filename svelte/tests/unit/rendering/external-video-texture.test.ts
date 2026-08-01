import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { importAndBindExternalVideo } from '$lib/rendering/webgpu/WebGpuEngine';
import {
  MODULE_FX_IDLE_WGSL,
  MODULE_FX_WGSL
} from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';

describe('WebGPU external-video texture contract', () => {
  test('samples live video through texture_external with the required clamp operation', () => {
    expect(MODULE_FX_WGSL).toContain('var videoTex: texture_external;');
    expect(MODULE_FX_WGSL).toContain('textureSampleBaseClampToEdge(videoTex, videoSampler');
    expect(MODULE_FX_WGSL).not.toContain('copyExternalImageToTexture');

    expect(MODULE_FX_IDLE_WGSL).toContain('var videoTex: texture_2d<f32>;');
    expect(MODULE_FX_IDLE_WGSL).not.toContain('var videoTex: texture_external;');
  });

  test('confines persistent frame copies to the timesampler seek-gap cache', () => {
    const renderingRoot = join(process.cwd(), 'src/lib/rendering/webgpu');
    const engine = readFileSync(join(renderingRoot, 'WebGpuEngine.ts'), 'utf8');
    const cache = readFileSync(join(renderingRoot, 'VideoTextureCache.ts'), 'utf8');
    expect(engine).not.toContain('copyExternalImageToTexture');
    expect(engine).toContain("PERSISTENT_VIDEO_CACHE_MODULES = new Set(['timesampler'])");
    expect(cache).toContain('copyExternalImageToTexture');
    expect(cache).not.toContain('getContext(\'2d\')');
  });

  test('imports a fresh external texture before creating each frame-local bind group', () => {
    const events: string[] = [];
    const imported = [{ frame: 1 }, { frame: 2 }];
    const importExternalTexture = vi.fn(() => {
      events.push('import');
      return imported[importExternalTexture.mock.calls.length - 1] as unknown as GPUExternalTexture;
    });
    const createBindGroup = vi.fn((descriptor: GPUBindGroupDescriptor) => {
      events.push('bind');
      return { descriptor } as unknown as GPUBindGroup;
    });
    const device = { importExternalTexture, createBindGroup } as unknown as GPUDevice;
    const layout = {} as GPUBindGroupLayout;
    const uniform = {} as GPUBuffer;
    const source = {} as HTMLVideoElement;
    const sampler = {} as GPUSampler;
    const feedback = {} as GPUTextureView;

    const first = importAndBindExternalVideo(device, layout, uniform, source, sampler, feedback);
    const second = importAndBindExternalVideo(device, layout, uniform, source, sampler, feedback);

    expect(events).toEqual(['import', 'bind', 'import', 'bind']);
    expect(importExternalTexture).toHaveBeenCalledTimes(2);
    expect(first.externalTexture).not.toBe(second.externalTexture);
    expect(createBindGroup.mock.calls[0]?.[0].entries[1]?.resource).toBe(first.externalTexture);
    expect(createBindGroup.mock.calls[1]?.[0].entries[1]?.resource).toBe(second.externalTexture);
  });

  test('reuses one task-local import for duplicate bindings without caching bind groups', () => {
    const externalTexture = {} as GPUExternalTexture;
    const importExternalTexture = vi.fn(() => externalTexture);
    const createBindGroup = vi.fn((_descriptor: GPUBindGroupDescriptor) => ({} as GPUBindGroup));
    const device = { importExternalTexture, createBindGroup } as unknown as GPUDevice;
    const source = {} as HTMLVideoElement;
    const taskCache = new Map<HTMLVideoElement, GPUExternalTexture>();
    const args = [
      device,
      {} as GPUBindGroupLayout,
      {} as GPUBuffer,
      source,
      {} as GPUSampler,
      {} as GPUTextureView,
      taskCache
    ] as const;

    importAndBindExternalVideo(...args);
    importAndBindExternalVideo(...args);

    expect(importExternalTexture).toHaveBeenCalledOnce();
    expect(createBindGroup).toHaveBeenCalledTimes(2);
    expect(createBindGroup.mock.calls[0]?.[0].entries[1]?.resource).toBe(externalTexture);
    expect(createBindGroup.mock.calls[1]?.[0].entries[1]?.resource).toBe(externalTexture);
  });
});
