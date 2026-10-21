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
  test('warmup bounds simultaneous compiler requests while preparing every effect', async () => {
    const { device } = mockDevice(false);
    let inFlight = 0, peak = 0;
    vi.mocked(device.createRenderPipelineAsync).mockImplementation(() => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      return new Promise(resolve => setTimeout(() => {
        inFlight--;
        resolve({} as GPURenderPipeline);
      }, 0));
    });
    const cache = new ModePipelineCache(device, layouts);
    await cache.warmAll();
    expect(peak).toBeLessThanOrEqual(4);
    expect(cache.readyCount).toBe(cache.totalCount);
  });

  test('a failed build is retried on the next request, and counted once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { device } = mockDevice(true);
    const cache = new ModePipelineCache(device, layouts);
    expect(await cache.build('video', 0)).toBeNull();
    expect(cache.settledCount).toBe(1);
    expect(cache.readyCount).toBe(0);
    expect(await cache.build('video', 0)).not.toBeNull();
    expect(cache.get('video', 0)).not.toBeNull();
    expect(cache.readyCount).toBe(1);
    expect(cache.settledCount).toBe(1);
  });

  test('one pipeline layout per variant, shared across modes', async () => {
    const { device, createPipelineLayout } = mockDevice(false);
    const cache = new ModePipelineCache(device, layouts);
    await cache.warmAll();
    expect(createPipelineLayout).toHaveBeenCalledTimes(2);
    expect(cache.settledCount).toBe(cache.totalCount);
  });

  test('warmup retries a transient compile failure before reporting completion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { device } = mockDevice(true);
    const cache = new ModePipelineCache(device, layouts);
    await cache.warmAll();
    expect(cache.readyCount).toBe(cache.totalCount);
    expect(cache.get('video', 0)).not.toBeNull();
    expect(device.createRenderPipelineAsync).toHaveBeenCalledTimes(cache.totalCount + 1);
  });

  test('warmup stops retrying a persistent compiler failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { device } = mockDevice(false);
    vi.mocked(device.createRenderPipelineAsync).mockRejectedValue(new Error('persistent compiler failure'));
    const cache = new ModePipelineCache(device, layouts);
    await cache.warmAll();
    expect(cache.readyCount).toBe(0);
    expect(cache.settledCount).toBe(cache.totalCount);
    expect(device.createRenderPipelineAsync).toHaveBeenCalledTimes(cache.totalCount * 3);
  });
});
