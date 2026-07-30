import type { RendererCapability } from '$lib/engine/contracts';

export interface CapabilityState {
  renderer: RendererCapability;
  webgpu: boolean;
  webcodecs: boolean;
  reason: string | null;
}

const PROBE_TIMEOUT_MS = 4000;

async function probeWebGpuInner(): Promise<CapabilityState> {
  const webcodecs = typeof VideoDecoder !== 'undefined';
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) {
    return {
      renderer: 'webgpu_unavailable',
      webgpu: false,
      webcodecs,
      reason: 'navigator.gpu is not available in this browser'
    };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        renderer: 'webgpu_unavailable',
        webgpu: false,
        webcodecs,
        reason: 'No WebGPU adapter found'
      };
    }
    const device = await adapter.requestDevice();
    device.destroy();
    return {
      renderer: 'webgpu_active',
      webgpu: true,
      webcodecs,
      reason: null
    };
  } catch (error) {
    return {
      renderer: 'webgpu_unavailable',
      webgpu: false,
      webcodecs,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

/** Never hang the UI — race probe against a timeout. */
export async function probeWebGpu(timeoutMs = PROBE_TIMEOUT_MS): Promise<CapabilityState> {
  const timeout = new Promise<CapabilityState>((resolve) => {
    setTimeout(
      () =>
        resolve({
          renderer: 'webgpu_unavailable',
          webgpu: false,
          webcodecs: typeof VideoDecoder !== 'undefined',
          reason: `WebGPU probe timed out after ${timeoutMs}ms`
        }),
      timeoutMs
    );
  });
  return Promise.race([probeWebGpuInner(), timeout]);
}
