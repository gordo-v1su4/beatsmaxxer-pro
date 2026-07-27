type BrowserGpu = {
  requestAdapter(): Promise<{
    requestDevice(): Promise<unknown>;
  } | null>;
};

let sharedDevicePromise: Promise<unknown> | null = null;

export async function getSharedWebGpuDevice() {
  if (sharedDevicePromise) return sharedDevicePromise;
  sharedDevicePromise = (async () => {
    const gpu = (navigator as unknown as { gpu?: BrowserGpu }).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    return adapter.requestDevice();
  })();
  return sharedDevicePromise;
}

export function resetSharedWebGpuDeviceForTests() {
  sharedDevicePromise = null;
}
