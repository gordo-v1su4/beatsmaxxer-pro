import { describe, expect, test, vi } from 'vitest';
import { ModePipelineCache } from '$lib/rendering/webgpu/ModePipelineCache';

function mockDevice(failFirst: boolean) {
  let calls = 0;
  const createPipelineLayout = vi.fn(() => ({}));
  const device = {
    createShaderModule: vi.fn(() => ({})),
    createPipelineLayout,
    createRenderPipelineAsync: vi.fn(() => {
      calls += 1;
      return failFirst && calls === 1
        ? Promise.reject(new Error('compile failed'))
        : Promise.resolve({ id: calls });
    }),
  } as unknown as GPUDevice;
  return { device, createPipelineLayout };
}

const layouts = { video: {}, idle: {} } as unknown as Record<'video' | 'idle', GPUBindGroupLayout>;

describe('ModePipelineCache', () => {
  test('a failed build is retried on the next request, and counted once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { device } = mockDevice(true);
    const cache = new ModePipelineCache(device, layouts);
    expect(await cache.build('video', 0)).toBeNull();
    expect(cache.settledCount).toBe(1);
    expect(await cache.build('video', 0)).not.toBeNull();
    expect(cache.get('video', 0)).not.toBeNull();
    expect(cache.settledCount).toBe(1);
  });

  test('one pipeline layout per variant, shared across modes', async () => {
    const { device, createPipelineLayout } = mockDevice(false);
    const cache = new ModePipelineCache(device, layouts);
    await cache.warmAll();
    expect(createPipelineLayout).toHaveBeenCalledTimes(2);
    expect(cache.settledCount).toBe(cache.totalCount);
  });
});
