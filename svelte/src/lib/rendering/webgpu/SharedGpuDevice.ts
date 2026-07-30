type BrowserGpu = {
  requestAdapter(): Promise<{ requestDevice(): Promise<GPUDevice> } | null>;
};

let sharedDevicePromise: Promise<GPUDevice | null> | null = null;

export async function getSharedWebGpuDevice(): Promise<GPUDevice | null> {
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

export function getPreferredCanvasFormat(): GPUTextureFormat {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  return gpu?.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
}
