import type { RendererCapabilities } from "../media/capabilities";

export interface RendererSampleProbeEnvironment {
  secureContext: boolean;
  probeWebGpuExternalTexture: (() => Promise<boolean>) | null;
  probeWebGl2VideoFrame: (() => Promise<boolean>) | null;
  htmlVideoAvailable: boolean;
}

async function runProbe(probe: (() => Promise<boolean>) | null) {
  if (!probe) return { available: false, sampleFrameProbePassed: false };
  try {
    return {
      available: true,
      sampleFrameProbePassed: await probe(),
    };
  } catch {
    return { available: true, sampleFrameProbePassed: false };
  }
}

export async function probeRendererCapabilities(
  environment: RendererSampleProbeEnvironment,
): Promise<RendererCapabilities> {
  if (!environment.secureContext) {
    return {
      webgpuExternalTexture: {
        available: false,
        sampleFrameProbePassed: false,
      },
      webgl2VideoFrame: {
        available: false,
        sampleFrameProbePassed: false,
      },
      htmlVideo: environment.htmlVideoAvailable,
    };
  }
  const [webgpuExternalTexture, webgl2VideoFrame] =
    await Promise.all([
      runProbe(environment.probeWebGpuExternalTexture),
      runProbe(environment.probeWebGl2VideoFrame),
    ]);
  return {
    webgpuExternalTexture,
    webgl2VideoFrame,
    htmlVideo: environment.htmlVideoAvailable,
  };
}
