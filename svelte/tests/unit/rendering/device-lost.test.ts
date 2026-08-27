import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getSharedWebGpuDevice,
  onSharedWebGpuDeviceLost,
  resetSharedWebGpuDeviceForTests
} from '$lib/rendering/webgpu/SharedGpuDevice';

/**
 * A GPUDevice is not permanent. Phones destroy it under memory pressure and
 * after a long background, and every pipeline, buffer and texture built from it
 * dies with it. Before this the app rendered into a dead swapchain forever,
 * which shows as the picture going black and never coming back.
 */

function fakeGpu(lost: Promise<GPUDeviceLostInfo>) {
  const device = { lost } as unknown as GPUDevice;
  return {
    device,
    gpu: {
      requestAdapter: async () => ({ requestDevice: async () => device })
    }
  };
}

function installGpu(lost: Promise<GPUDeviceLostInfo>) {
  const { device, gpu } = fakeGpu(lost);
  vi.stubGlobal('navigator', { gpu });
  return device;
}

afterEach(() => {
  resetSharedWebGpuDeviceForTests();
  vi.unstubAllGlobals();
});

describe('shared GPU device loss', () => {
  test('notifies listeners and forgets the lost device', async () => {
    let loseDevice: (info: GPUDeviceLostInfo) => void = () => {};
    const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
      loseDevice = resolve;
    });
    const first = installGpu(lost);
    expect(await getSharedWebGpuDevice()).toBe(first);

    const seen: GPUDeviceLostInfo[] = [];
    onSharedWebGpuDeviceLost((info) => seen.push(info));

    const info = { reason: 'unknown', message: 'gpu reset' } as GPUDeviceLostInfo;
    loseDevice(info);
    await lost;
    // The .then handler is a microtask behind the resolution.
    await Promise.resolve();

    expect(seen).toEqual([info]);

    // The memo is cleared, so the next request acquires a fresh device rather
    // than handing back the dead one and looping.
    const second = installGpu(new Promise<GPUDeviceLostInfo>(() => {}));
    expect(await getSharedWebGpuDevice()).toBe(second);
    expect(second).not.toBe(first);
  });

  test('does not republish our own dispose', async () => {
    let loseDevice: (info: GPUDeviceLostInfo) => void = () => {};
    const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
      loseDevice = resolve;
    });
    installGpu(lost);
    await getSharedWebGpuDevice();

    const listener = vi.fn();
    onSharedWebGpuDeviceLost(listener);

    loseDevice({ reason: 'destroyed', message: '' } as GPUDeviceLostInfo);
    await lost;
    await Promise.resolve();

    // 'destroyed' is dispose() doing its job, not a fault to recover from.
    expect(listener).not.toHaveBeenCalled();
  });

  test('unsubscribing stops delivery', async () => {
    let loseDevice: (info: GPUDeviceLostInfo) => void = () => {};
    const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
      loseDevice = resolve;
    });
    installGpu(lost);
    await getSharedWebGpuDevice();

    const listener = vi.fn();
    onSharedWebGpuDeviceLost(listener)();

    loseDevice({ reason: 'unknown', message: '' } as GPUDeviceLostInfo);
    await lost;
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });
});
