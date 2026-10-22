import { describe, expect, test, vi } from 'vitest';
import { probeSharedTextureBinding } from '$lib/rendering/webgpu/FxCapabilities';

describe('owned texture in an external binding capability probe', () => {
  test.each([null, { message: 'unsupported external texture binding' }])('contains validation errors and cleans up (%j)', async error => {
    vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 4 });
    vi.stubGlobal('GPUShaderStage', { FRAGMENT: 2 });
    const destroy = vi.fn();
    const device = {
      pushErrorScope: vi.fn(), popErrorScope: vi.fn(async () => error),
      createTexture: vi.fn(() => ({ createView: () => ({}), destroy })),
      createBindGroupLayout: vi.fn(() => ({})), createBindGroup: vi.fn()
    } as unknown as GPUDevice;
    expect(await probeSharedTextureBinding(device)).toBe(error === null);
    expect(device.pushErrorScope).toHaveBeenCalledWith('validation');
    expect(device.popErrorScope).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
