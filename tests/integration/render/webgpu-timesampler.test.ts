import { describe, expect, test } from "bun:test";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import { QaMediaTelemetryBridge } from "../../../src/media/telemetry";
import {
  EXTERNAL_TEXTURE_INGEST_WGSL,
  TIMESAMPLER_COMPOSITE_WGSL,
} from "../../../src/render/webgpu/shaders";
import {
  GpuCompositor,
  type LinearTextureDescriptor,
  type WebGpuBackend,
} from "../../../src/render/webgpu/GpuCompositor";
import type { RenderFrameRequest } from "../../../src/render/contracts";
import {
  getQaTelemetrySnapshot,
  resetQaTelemetryForTests,
} from "../../../src/qa/telemetry";
import { FakeFrame } from "../../unit/media/fakes";
import {
  WebCodecsRenderer,
  type WebGl2Backend,
} from "../../../src/render/webgl/WebCodecsRenderer";

class FakeGpuBackend implements WebGpuBackend<FakeFrame> {
  readonly events: string[] = [];
  readonly externalTextures: object[] = [];
  lost = false;
  failImport: Error | null = null;
  private lossCallback: ((reason: string) => void) | null = null;

  importExternalTexture(frame: FakeFrame, colorSpace: "srgb") {
    this.events.push(`import:${frame.timestamp}:${colorSpace}`);
    if (this.failImport) throw this.failImport;
    const external = {};
    this.externalTextures.push(external);
    return external;
  }

  createLinearTexture(descriptor: LinearTextureDescriptor) {
    this.events.push(
      `create:${descriptor.width}x${descriptor.height}:${descriptor.format}:${descriptor.colorSpace}`,
    );
    return { descriptor };
  }

  destroyTexture() {
    this.events.push("destroy-texture");
  }

  encodeExternalToLinear(
    _externalTexture: unknown,
    _linearTexture: unknown,
    shaderSource: string,
  ) {
    expect(shaderSource).toBe(EXTERNAL_TEXTURE_INGEST_WGSL);
    this.events.push("external-to-linear");
  }

  encodeComposition(
    _linearTexture: unknown,
    request: RenderFrameRequest,
    shaderSource: string,
  ) {
    expect(shaderSource).toBe(TIMESAMPLER_COMPOSITE_WGSL);
    this.events.push(
      `compose:${request.effect}:${request.accentMode}`,
    );
  }

  submit() {
    this.events.push("submit");
  }

  onDeviceLost(callback: (reason: string) => void) {
    this.lossCallback = callback;
    return () => {
      this.lossCallback = null;
    };
  }

  triggerLoss() {
    this.lost = true;
    this.lossCallback?.("test-device-lost");
  }

  dispose() {
    this.events.push("dispose");
  }
}

class FakeGlBackend implements WebGl2Backend<FakeFrame> {
  lost = false;
  presentSource() {}
  onContextLost() {
    return () => {};
  }
  dispose() {}
}

function request(
  accentMode: RenderFrameRequest["accentMode"] = "LUM",
): RenderFrameRequest {
  return {
    width: 640,
    height: 360,
    effect: "timesampler",
    accentMode,
    accentEnvelope: 0.75,
    rgbOffset: 0.022,
    mix: 1,
  };
}

function leasedFrame() {
  const coordinator = new PlaybackCoordinator<FakeFrame>();
  coordinator.activate("pgm", "clip", 1, {
    decodeQueueSize: 0,
    close() {},
  });
  const frame = new FakeFrame(10_000);
  coordinator.insertFrame(
    "pgm",
    { clipId: "clip", generation: 1, timestampUs: 10_000 },
    frame,
  );
  const lease = coordinator.leaseFrame("pgm", 10_000, "renderer");
  if (!lease) throw new Error("test-lease-missing");
  return { coordinator, frame, lease };
}

describe("G006 WebGPU TimeSampler vertical slice", () => {
  test("imports per frame, submits before receipt release, and reuses only the linear texture", () => {
    const backend = new FakeGpuBackend();
    const compositor = new GpuCompositor(backend);
    const first = leasedFrame();

    const submission = compositor.present(first.lease, request());
    expect(backend.events).toEqual([
      "create:640x360:rgba16float:linear-srgb",
      "import:10000:srgb",
      "external-to-linear",
      "compose:timesampler:LUM",
      "submit",
    ]);
    expect(first.lease.valid).toBe(true);
    expect(first.frame.closeCount).toBe(0);

    submission.receipt.release();
    expect(first.lease.valid).toBe(false);
    first.coordinator.dispose();
    expect(first.frame.closeCount).toBe(1);

    const second = leasedFrame();
    const secondSubmission = compositor.present(
      second.lease,
      request("RGB"),
    );
    expect(backend.externalTextures).toHaveLength(2);
    expect(backend.externalTextures[0]).not.toBe(
      backend.externalTextures[1],
    );
    expect(
      backend.events.filter((event) => event.startsWith("create:")),
    ).toHaveLength(1);
    secondSubmission.receipt.release();
    second.coordinator.dispose();
    compositor.dispose();
  });

  test("maps cross-origin and color-space failures without releasing the lease", () => {
    const backend = new FakeGpuBackend();
    const compositor = new GpuCompositor(backend);
    const crossOrigin = leasedFrame();
    backend.failImport = new DOMException("origin-clean", "SecurityError");
    expect(() =>
      compositor.present(crossOrigin.lease, request()),
    ).toThrow("webgpu-cross-origin-frame");
    expect(crossOrigin.lease.valid).toBe(true);
    crossOrigin.lease.release();
    crossOrigin.coordinator.dispose();

    const color = leasedFrame();
    backend.failImport = new Error("color space conversion failed");
    expect(() => compositor.present(color.lease, request())).toThrow(
      "webgpu-color-space-failed",
    );
    color.lease.release();
    color.coordinator.dispose();
    compositor.dispose();
  });

  test("device loss destroys GPU state, reports telemetry, and blocks stale presentation", () => {
    resetQaTelemetryForTests();
    const backend = new FakeGpuBackend();
    const reasons: string[] = [];
    const compositor = new GpuCompositor(backend, {
      telemetry: new QaMediaTelemetryBridge(),
      onDeviceLost: (reason) => reasons.push(reason),
    });
    const first = leasedFrame();
    const submission = compositor.present(first.lease, request("OFF"));
    expect(getQaTelemetrySnapshot().resources).toMatchObject({
      gpuTextures: 1,
      gpuBuffers: 1,
    });

    backend.triggerLoss();
    expect(reasons).toEqual(["test-device-lost"]);
    expect(compositor.lost).toBe(true);
    expect(getQaTelemetrySnapshot().resources.gpuTextures).toBe(0);
    submission.receipt.release();
    first.coordinator.dispose();

    const stale = leasedFrame();
    expect(() => compositor.present(stale.lease, request())).toThrow(
      "webgpu-device-lost",
    );
    stale.lease.release();
    stale.coordinator.dispose();
    compositor.dispose();
    expect(getQaTelemetrySnapshot().resources.gpuBuffers).toBe(0);
  });

  test("sums concurrent renderer-owned resources and releases only the disposing owner", () => {
    resetQaTelemetryForTests();
    const telemetry = new QaMediaTelemetryBridge();
    const compositor = new GpuCompositor(new FakeGpuBackend(), {
      telemetry,
    });
    const webgl = new WebCodecsRenderer(
      new FakeGlBackend(),
      undefined,
      telemetry,
    );
    const state = leasedFrame();
    const submission = compositor.present(state.lease, request());

    expect(getQaTelemetrySnapshot().resources).toMatchObject({
      gpuTextures: 3,
      gpuBuffers: 1,
    });

    compositor.dispose();
    expect(getQaTelemetrySnapshot().resources).toMatchObject({
      gpuTextures: 2,
      gpuBuffers: 0,
    });

    webgl.dispose();
    expect(getQaTelemetrySnapshot().resources).toMatchObject({
      gpuTextures: 0,
      gpuBuffers: 0,
    });
    submission.receipt.release();
    state.coordinator.dispose();
  });

  test("shader sources encode the external-to-linear and LUM/RGB/OFF contract", async () => {
    expect(EXTERNAL_TEXTURE_INGEST_WGSL).toContain("texture_external");
    expect(EXTERNAL_TEXTURE_INGEST_WGSL).toContain("srgbToLinear");
    expect(TIMESAMPLER_COMPOSITE_WGSL).toContain("linearToSrgb");
    expect(TIMESAMPLER_COMPOSITE_WGSL).toContain(
      "effect.mode < 0.5",
    );
    expect(TIMESAMPLER_COMPOSITE_WGSL).toContain(
      "effect.mode < 1.5",
    );
    expect(TIMESAMPLER_COMPOSITE_WGSL).toContain(
      "let dry = textureSample",
    );
    const wgslFile = await Bun.file(
      new URL(
        "../../../src/render/webgpu/timesampler.wgsl",
        import.meta.url,
      ),
    ).text();
    expect(wgslFile).toContain("linearToSrgb");
    expect(wgslFile).toContain("effect.mode < 1.5");
  });
});
