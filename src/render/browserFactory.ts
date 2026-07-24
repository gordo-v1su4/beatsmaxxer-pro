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
import type {
  DecodedFrameRenderer,
  HtmlVideoRendererLike,
} from "./contracts";
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

export interface BrowserRendererFactories<
  Frame extends DecodedFrameLike,
> {
  createWebGpu(
    canvas: HTMLCanvasElement,
    telemetry: QaMediaTelemetryBridge,
    onDeviceLost: (reason: string) => void,
  ): Promise<DecodedFrameRenderer<Frame>>;
  createWebGl(
    canvas: HTMLCanvasElement,
    telemetry: QaMediaTelemetryBridge,
  ): DecodedFrameRenderer<Frame>;
  createHtmlVideo(
    canvas: HTMLCanvasElement,
  ): HtmlVideoRendererLike<HTMLVideoElement>;
}

function defaultBrowserRendererFactories<
  Frame extends DecodedFrameLike,
>(): BrowserRendererFactories<Frame> {
  return {
    async createWebGpu(canvas, telemetry, onDeviceLost) {
      const backend = await BrowserWebGpuBackend.create<Frame>(canvas);
      try {
        return new GpuCompositor(backend, {
          telemetry,
          onDeviceLost,
        });
      } catch (error) {
        backend.dispose();
        throw error;
      }
    },
    createWebGl(canvas, telemetry) {
      const backend = new BrowserWebGl2Backend<Frame>(canvas);
      try {
        return new WebCodecsRenderer(
          backend,
          undefined,
          telemetry,
        );
      } catch (error) {
        backend.dispose();
        throw error;
      }
    },
    createHtmlVideo(canvas) {
      const backend =
        new BrowserWebGl2Backend<HTMLVideoElement>(canvas);
      try {
        return new HtmlVideoRenderer(backend);
      } catch (error) {
        backend.dispose();
        throw error;
      }
    },
  };
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
  factories?: BrowserRendererFactories<Frame>;
}) {
  const telemetry = new QaMediaTelemetryBridge();
  const factories =
    options.factories ?? defaultBrowserRendererFactories<Frame>();
  let runtime:
    | ReturnType<
        typeof createMediaRendererRuntime<Frame, HTMLVideoElement>
      >
    | undefined;
  const initializationFailures: Partial<
    Record<
      "webcodecs-webgpu" | "webcodecs-webgl2" | "html-video-webgl2",
      string
    >
  > = {};
  let webgpu: DecodedFrameRenderer<Frame> | undefined;
  let webgl: DecodedFrameRenderer<Frame> | undefined;
  let htmlVideo: HtmlVideoRendererLike<HTMLVideoElement> | undefined;

  if (
    options.capabilities.webgpuExternalTexture.available &&
    options.capabilities.webgpuExternalTexture.sampleFrameProbePassed
  ) {
    try {
      webgpu = await factories.createWebGpu(
        options.canvases.webgpu,
        telemetry,
        (reason) => runtime?.handleWebGpuDeviceLoss(reason),
      );
    } catch {
      initializationFailures["webcodecs-webgpu"] =
        "webgpu-renderer-create-failed";
    }
  }
  if (
    options.capabilities.webgl2VideoFrame.available &&
    options.capabilities.webgl2VideoFrame.sampleFrameProbePassed
  ) {
    try {
      webgl = factories.createWebGl(
        options.canvases.webgl,
        telemetry,
      );
    } catch {
      initializationFailures["webcodecs-webgl2"] =
        "webgl-renderer-create-failed";
    }
  }
  if (options.capabilities.htmlVideo) {
    try {
      htmlVideo = factories.createHtmlVideo(
        options.canvases.htmlVideo,
      );
    } catch {
      initializationFailures["html-video-webgl2"] =
        "html-video-renderer-create-failed";
    }
  }
  try {
    runtime = createMediaRendererRuntime({
      ...options,
      webgpu,
      webgl,
      htmlVideo,
      initializationFailures,
    });
    return runtime;
  } catch (error) {
    webgpu?.dispose();
    webgl?.dispose();
    htmlVideo?.dispose();
    throw error;
  }
}
