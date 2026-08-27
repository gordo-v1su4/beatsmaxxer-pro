type BrowserGpu = {
  requestAdapter(): Promise<{ requestDevice(): Promise<GPUDevice> } | null>;
};

let sharedDevicePromise: Promise<GPUDevice | null> | null = null;

/** Notified when the device is lost, so owners can drop what it created. */
const lostListeners = new Set<(info: GPUDeviceLostInfo) => void>();

/**
 * Subscribe to device loss. Returns the unsubscribe.
 *
 * A GPUDevice is not forever. The browser destroys it under memory pressure,
 * when a phone backgrounds an app for long enough, and whenever the driver
 * resets — on mobile all three are ordinary events rather than faults. Every
 * object built from a lost device is dead with it: pipelines, buffers, textures
 * and the canvas configuration alike. Nothing here used to listen, so the first
 * loss left the app rendering into a destroyed swapchain forever, which reads
 * as the picture going black and staying black with no error and no way back.
 *
 * `reason: 'destroyed'` is our own dispose() and is never republished — that
 * one is not a fault and must not trigger a rebuild.
 */
export function onSharedWebGpuDeviceLost(listener: (info: GPUDeviceLostInfo) => void) {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

export async function getSharedWebGpuDevice(): Promise<GPUDevice | null> {
  if (sharedDevicePromise) return sharedDevicePromise;
  sharedDevicePromise = (async () => {
    const gpu = (navigator as unknown as { gpu?: BrowserGpu }).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    void device.lost?.then((info) => {
      // Drop the memo first: whoever handles this will ask for a device, and
      // handing back the lost one would loop.
      sharedDevicePromise = null;
      if (info.reason === 'destroyed') return;
      for (const listener of [...lostListeners]) {
        try {
          listener(info);
        } catch (err) {
          console.error('[webgpu] device-lost listener threw:', err);
        }
      }
    });
    return device;
  })();
  return sharedDevicePromise;
}

export function resetSharedWebGpuDeviceForTests() {
  sharedDevicePromise = null;
  lostListeners.clear();
}

export function getPreferredCanvasFormat(): GPUTextureFormat {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  return gpu?.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
}
