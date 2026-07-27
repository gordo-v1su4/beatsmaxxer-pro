import { describe, expect, test } from "bun:test";
import {
  PresentationReceipt,
  type FrameLease,
} from "../../../src/media/FrameCache";
import type { DirectPlaybackProbe } from "../../../src/media/capabilities";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import {
  RendererPresentationError,
  type DecodedFrameRenderer,
  type HtmlVideoRendererLike,
  type RenderFrameRequest,
} from "../../../src/render/contracts";
import { createMediaRendererRuntime } from "../../../src/render/factory";
import {
  createBrowserMediaRendererRuntime,
  type BrowserRendererFactories,
} from "../../../src/render/browserFactory";
import {
  LEGACY_EFFECTS,
  previewPolicy,
  rendererLaneForEffect,
} from "../../../src/render/promotion";
import { probeRendererCapabilities } from "../../../src/render/capabilities";
import {
  EXTERNAL_TO_LINEAR_GLSL,
  TIMESAMPLER_COMPOSITE_GLSL,
} from "../../../src/render/webgl/shaders";
import { FakeFrame } from "../../unit/media/fakes";
import { ALL_MODULES } from "../../../src/App";

const direct: DirectPlaybackProbe = {
  supported: true,
  reason: null,
  config: {
    codec: "avc1.640028",
    codedWidth: 640,
    codedHeight: 360,
  },
};

const request: RenderFrameRequest = {
  width: 640,
  height: 360,
  effect: "timesampler",
  accentMode: "LUM",
  accentEnvelope: 1,
  rgbOffset: 0.02,
  mix: 1,
};

class FakeDecodedRenderer implements DecodedFrameRenderer<FakeFrame> {
  lost = false;
  disposed = 0;
  calls = 0;

  constructor(
    readonly path: "webcodecs-webgpu" | "webcodecs-webgl2",
    private readonly failure: string | null = null,
  ) {}

  present(
    lease: FrameLease<FakeFrame>,
    _request: RenderFrameRequest,
  ) {
    this.calls += 1;
    if (this.failure) {
      throw new RendererPresentationError(this.failure);
    }
    return {
      path: this.path,
      receipt: PresentationReceipt.submitted(lease),
    };
  }

  dispose() {
    this.disposed += 1;
  }
}

class FakeHtmlRenderer
  implements HtmlVideoRendererLike<{ id: string }>
{
  readonly path = "html-video-webgl2" as const;
  calls = 0;
  disposed = 0;
  failure: Error | null = null;

  present() {
    this.calls += 1;
    if (this.failure) throw this.failure;
  }

  dispose() {
    this.disposed += 1;
  }
}

function setup() {
  const coordinator = new PlaybackCoordinator<FakeFrame>();
  coordinator.updateTransport({
    presentationTimeSeconds: 4.5,
    playing: true,
    discontinuityGeneration: 3,
  });
  coordinator.activate("pgm", "clip", 1, {
    decodeQueueSize: 0,
    close() {},
  });
  const frame = new FakeFrame(0);
  coordinator.insertFrame(
    "pgm",
    { clipId: "clip", generation: 1, timestampUs: 0 },
    frame,
  );
  const lease = coordinator.leaseFrame("pgm", 0, "renderer");
  if (!lease) throw new Error("test-lease-missing");
  return { coordinator, frame, lease };
}

const fullCapabilities = {
  webgpuExternalTexture: {
    available: true,
    sampleFrameProbePassed: true,
  },
  webgl2VideoFrame: {
    available: true,
    sampleFrameProbePassed: true,
  },
  htmlVideo: true,
};

describe("G006 renderer fallback lifecycle", () => {
  test("falls from WebGPU to WebCodecs/WebGL2 using the same lease", () => {
    const state = setup();
    const webgpu = new FakeDecodedRenderer(
      "webcodecs-webgpu",
      "webgpu-cross-origin-frame",
    );
    const webgl = new FakeDecodedRenderer("webcodecs-webgl2");
    const html = new FakeHtmlRenderer();
    const runtime = createMediaRendererRuntime({
      direct,
      capabilities: fullCapabilities,
      coordinator: state.coordinator,
      webgpu,
      webgl,
      htmlVideo: html,
    });

    const submission = runtime.presentDecoded(state.lease, request);
    expect(submission?.path).toBe("webcodecs-webgl2");
    expect(webgpu.calls).toBe(1);
    expect(webgl.calls).toBe(1);
    expect(state.lease.valid).toBe(true);
    expect(runtime.snapshot().fallback).toEqual({
      path: "webcodecs-webgl2",
      reason: "webgpu-cross-origin-frame",
    });
    submission?.receipt.release();
    state.coordinator.dispose();
    runtime.dispose();
  });

  test("falls from WebGL2 to HTML-video and releases the decoded lease", () => {
    const state = setup();
    const webgpu = new FakeDecodedRenderer(
      "webcodecs-webgpu",
      "webgpu-presentation-failed",
    );
    const webgl = new FakeDecodedRenderer(
      "webcodecs-webgl2",
      "webgl-cross-origin-frame",
    );
    const html = new FakeHtmlRenderer();
    const runtime = createMediaRendererRuntime({
      direct,
      capabilities: fullCapabilities,
      coordinator: state.coordinator,
      webgpu,
      webgl,
      htmlVideo: html,
    });

    expect(runtime.presentDecoded(state.lease, request)).toBeNull();
    expect(state.lease.valid).toBe(false);
    expect(runtime.snapshot().fallback).toEqual({
      path: "html-video-webgl2",
      reason: "webgl-cross-origin-frame",
    });
    runtime.presentHtmlVideo({ id: "pooled-video" }, request);
    expect(html.calls).toBe(1);
    state.coordinator.dispose();
    runtime.dispose();
  });

  test("device loss selects WebGL2 without changing transport state", () => {
    const state = setup();
    const runtime = createMediaRendererRuntime({
      direct,
      capabilities: fullCapabilities,
      coordinator: state.coordinator,
      webgpu: new FakeDecodedRenderer("webcodecs-webgpu"),
      webgl: new FakeDecodedRenderer("webcodecs-webgl2"),
      htmlVideo: new FakeHtmlRenderer(),
    });
    const before = state.coordinator.snapshot().transport;

    runtime.handleWebGpuDeviceLoss();

    expect(runtime.snapshot()).toEqual({
      fallback: {
        path: "webcodecs-webgl2",
        reason: "webgpu-device-lost",
      },
      deviceLost: true,
    });
    expect(state.coordinator.snapshot().transport).toEqual(before);
    expect(state.lease.valid).toBe(true);
    state.lease.release();
    state.coordinator.dispose();
    runtime.dispose();
  });

  test("pressure forces the constructed runtime onto HTML compatibility", () => {
    const state = setup();
    const webgpu = new FakeDecodedRenderer("webcodecs-webgpu");
    const webgl = new FakeDecodedRenderer("webcodecs-webgl2");
    const html = new FakeHtmlRenderer();
    const runtime = createMediaRendererRuntime({
      direct,
      capabilities: fullCapabilities,
      coordinator: state.coordinator,
      webgpu,
      webgl,
      htmlVideo: html,
    });

    expect(
      runtime.forceCompatibilityFallback("decoded-frame-pressure"),
    ).toBe(true);
    expect(runtime.snapshot().fallback).toEqual({
      path: "html-video-webgl2",
      reason: "decoded-frame-pressure",
    });
    expect(webgpu.disposed).toBe(1);
    expect(webgl.disposed).toBe(1);
    state.lease.release();
    state.coordinator.dispose();
    runtime.dispose();
  });

  test("reports final HTML-video cross-origin failure as native-static", () => {
    const state = setup();
    const html = new FakeHtmlRenderer();
    html.failure = new DOMException("origin-clean", "SecurityError");
    const runtime = createMediaRendererRuntime({
      direct: {
        supported: false,
        reason: "unsupported-container",
        config: direct.config,
      },
      capabilities: {
        webgpuExternalTexture: {
          available: false,
          sampleFrameProbePassed: false,
        },
        webgl2VideoFrame: {
          available: false,
          sampleFrameProbePassed: false,
        },
        htmlVideo: true,
      },
      coordinator: state.coordinator,
      htmlVideo: html,
    });

    expect(runtime.presentHtmlVideo({ id: "cors-video" }, request)).toBe(
      false,
    );
    expect(runtime.snapshot().fallback).toEqual({
      path: "native-static",
      reason: "html-video-cross-origin-frame",
    });
    state.lease.release();
    state.coordinator.dispose();
    runtime.dispose();
  });

  test("requires successful sample probes and preserves promoted renderer lanes", async () => {
    const capabilities = await probeRendererCapabilities({
      secureContext: true,
      probeWebGpuExternalTexture: async () => false,
      probeWebGl2VideoFrame: async () => true,
      htmlVideoAvailable: true,
    });
    expect(capabilities).toEqual({
      webgpuExternalTexture: {
        available: true,
        sampleFrameProbePassed: false,
      },
      webgl2VideoFrame: {
        available: true,
        sampleFrameProbePassed: true,
      },
      htmlVideo: true,
    });
    expect(LEGACY_EFFECTS).toEqual([]);
    expect(
      ALL_MODULES.every(
        (module) => rendererLaneForEffect(module.id) === "promoted",
      ),
    ).toBe(true);
    expect(rendererLaneForEffect("timesampler")).toBe("promoted");
    expect(previewPolicy(false)).toBe("poster-only");
    expect(EXTERNAL_TO_LINEAR_GLSL).toContain("srgbToLinear");
    expect(TIMESAMPLER_COMPOSITE_GLSL).toContain("linearToSrgb");
    expect(TIMESAMPLER_COMPOSITE_GLSL).toContain("uEffect.x < 0.5");
    expect(TIMESAMPLER_COMPOSITE_GLSL).toContain("uEffect.x < 1.5");
  });

  test("continues from post-probe WebGPU construction failure to WebCodecs/WebGL2", async () => {
    const state = setup();
    const webgl = new FakeDecodedRenderer("webcodecs-webgl2");
    const html = new FakeHtmlRenderer();
    const factories = {
      async createWebGpu() {
        throw new Error("pipeline-construction-failed");
      },
      createWebGl() {
        return webgl;
      },
      createHtmlVideo() {
        return html;
      },
    } satisfies BrowserRendererFactories<FakeFrame>;

    const runtime = await createBrowserMediaRendererRuntime({
      direct,
      capabilities: fullCapabilities,
      coordinator: state.coordinator,
      canvases: {
        webgpu: {} as HTMLCanvasElement,
        webgl: {} as HTMLCanvasElement,
        htmlVideo: {} as HTMLCanvasElement,
      },
      factories,
    });

    expect(runtime.snapshot().fallback).toEqual({
      path: "webcodecs-webgl2",
      reason: "webgpu-renderer-create-failed",
    });
    const submission = runtime.presentDecoded(state.lease, request);
    expect(submission?.path).toBe("webcodecs-webgl2");
    submission?.receipt.release();
    runtime.dispose();
    state.coordinator.dispose();
  });

  test("continues every failed construction rung to native-static with the final observable reason", async () => {
    const state = setup();
    const factories = {
      async createWebGpu() {
        throw new Error("device-construction-failed");
      },
      createWebGl() {
        throw new Error("context-construction-failed");
      },
      createHtmlVideo() {
        throw new Error("html-context-construction-failed");
      },
    } satisfies BrowserRendererFactories<FakeFrame>;

    const runtime = await createBrowserMediaRendererRuntime({
      direct,
      capabilities: fullCapabilities,
      coordinator: state.coordinator,
      canvases: {
        webgpu: {} as HTMLCanvasElement,
        webgl: {} as HTMLCanvasElement,
        htmlVideo: {} as HTMLCanvasElement,
      },
      factories,
    });

    expect(runtime.snapshot().fallback).toEqual({
      path: "native-static",
      reason: "html-video-renderer-create-failed",
    });
    expect(runtime.presentDecoded(state.lease, request)).toBeNull();
    runtime.dispose();
    state.coordinator.dispose();
  });

  test("disposes every constructed renderer when runtime initialization throws", async () => {
    const webgpu = new FakeDecodedRenderer("webcodecs-webgpu");
    const webgl = new FakeDecodedRenderer("webcodecs-webgl2");
    const html = new FakeHtmlRenderer();
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    coordinator.selectPlaybackPath = () => {
      throw new Error("coordinator-initialization-failed");
    };

    try {
      await createBrowserMediaRendererRuntime({
        direct,
        capabilities: fullCapabilities,
        coordinator,
        canvases: {
          webgpu: {} as HTMLCanvasElement,
          webgl: {} as HTMLCanvasElement,
          htmlVideo: {} as HTMLCanvasElement,
        },
        factories: {
          async createWebGpu() {
            return webgpu;
          },
          createWebGl() {
            return webgl;
          },
          createHtmlVideo() {
            return html;
          },
        },
      });
      throw new Error("expected-runtime-initialization-failure");
    } catch (error) {
      expect((error as Error).message).toBe(
        "coordinator-initialization-failed",
      );
    }

    expect(webgpu.disposed).toBe(1);
    expect(webgl.disposed).toBe(1);
    expect(html.disposed).toBe(1);
    coordinator.dispose();
  });
});
