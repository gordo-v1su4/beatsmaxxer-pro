import type {
  DirectPlaybackProbe,
  RendererCapabilities,
} from "../media/capabilities";
import {
  FrameCache,
  type FrameLease,
} from "../media/FrameCache";
import type { PlaybackCoordinator } from "../media/PlaybackCoordinator";
import { QaMediaTelemetryBridge } from "../media/telemetry";
import type { DecodedFrameLike } from "../media/types";
import { createMediaRendererRuntime } from "./factory";
import { probeRendererCapabilities } from "./capabilities";
import type { RenderFrameRequest } from "./contracts";
import { HtmlVideoRenderer } from "./legacy/HtmlVideoRenderer";
import { BrowserWebGl2Backend } from "./webgl/BrowserWebGl2Backend";
import { WebCodecsRenderer } from "./webgl/WebCodecsRenderer";
import { BrowserWebGpuBackend } from "./webgpu/BrowserWebGpuBackend";
import { GpuCompositor } from "./webgpu/GpuCompositor";

export interface BrowserMediaRendererCanvases {
  webgpu: HTMLCanvasElement;
  webgl: HTMLCanvasElement;
  htmlVideo: HTMLCanvasElement;
}

export async function probeBrowserRendererCapabilities<
  Frame extends DecodedFrameLike,
>(options: {
  createSampleFrame: () => Promise<Frame>;
  request: RenderFrameRequest;
  canvases: BrowserMediaRendererCanvases;
}) {
  const runOwnedProbe = async (
    rendererFactory: () => Promise<{
      present(
        lease: FrameLease<Frame>,
        request: RenderFrameRequest,
      ): { receipt: { release(): void } };
      dispose(): void;
    }>,
  ) => {
    const frame = await options.createSampleFrame();
    const cache = new FrameCache<Frame>(1);
    const identity = {
      clipId: "renderer-sample-probe",
      generation: 0,
      timestampUs: frame.timestamp,
    };
    cache.insert(identity, frame);
    const lease = cache.acquire(identity, "renderer-sample-probe");
    if (!lease) {
      cache.dispose();
      return false;
    }
    let renderer: Awaited<ReturnType<typeof rendererFactory>> | null =
      null;
    try {
      renderer = await rendererFactory();
      const submission = renderer.present(lease, options.request);
      submission.receipt.release();
      return true;
    } finally {
      lease.release();
      renderer?.dispose();
      cache.dispose();
    }
  };
  const browserNavigator =
    navigator as unknown as { gpu?: unknown };
  const webGpuAvailable =
    globalThis.isSecureContext && browserNavigator.gpu !== undefined;
  const webGlAvailable =
    options.canvases.webgl.getContext("webgl2") !== null;
  return probeRendererCapabilities({
    secureContext: globalThis.isSecureContext,
    probeWebGpuExternalTexture: webGpuAvailable
      ? async () =>
          runOwnedProbe(async () => {
            const backend = await BrowserWebGpuBackend.create<Frame>(
              options.canvases.webgpu,
            );
            return new GpuCompositor(backend);
          })
      : null,
    probeWebGl2VideoFrame: webGlAvailable
      ? async () =>
          runOwnedProbe(async () =>
            new WebCodecsRenderer(
              new BrowserWebGl2Backend<Frame>(options.canvases.webgl),
            ))
      : null,
    htmlVideoAvailable:
      typeof HTMLVideoElement !== "undefined" &&
      options.canvases.htmlVideo.getContext("webgl2") !== null,
  });
}

export async function createBrowserMediaRendererRuntime<
  Frame extends DecodedFrameLike,
>(options: {
  direct: DirectPlaybackProbe;
  capabilities: RendererCapabilities;
  coordinator: PlaybackCoordinator<Frame>;
  canvases: BrowserMediaRendererCanvases;
}) {
  const telemetry = new QaMediaTelemetryBridge();
  let runtime:
    | ReturnType<
        typeof createMediaRendererRuntime<Frame, HTMLVideoElement>
      >
    | undefined;
  const webgpu =
    options.capabilities.webgpuExternalTexture.available &&
    options.capabilities.webgpuExternalTexture.sampleFrameProbePassed
      ? new GpuCompositor(
          await BrowserWebGpuBackend.create<Frame>(
            options.canvases.webgpu,
          ),
          {
            telemetry,
            onDeviceLost(reason) {
              runtime?.handleWebGpuDeviceLoss(reason);
            },
          },
        )
      : undefined;
  const webgl =
    options.capabilities.webgl2VideoFrame.available &&
    options.capabilities.webgl2VideoFrame.sampleFrameProbePassed
      ? new WebCodecsRenderer(
          new BrowserWebGl2Backend<Frame>(options.canvases.webgl),
          undefined,
          telemetry,
        )
      : undefined;
  const htmlVideo = options.capabilities.htmlVideo
    ? new HtmlVideoRenderer(
        new BrowserWebGl2Backend<HTMLVideoElement>(
          options.canvases.htmlVideo,
        ),
      )
    : undefined;
  runtime = createMediaRendererRuntime({
    ...options,
    webgpu,
    webgl,
    htmlVideo,
  });
  return runtime;
}
