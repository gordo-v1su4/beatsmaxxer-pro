import {
  PresentationReceipt,
  type FrameLease,
} from "../../media/FrameCache";
import type { DecodedFrameLike } from "../../media/types";
import { QaMediaTelemetryBridge } from "../../media/telemetry";
import type { QaResourceRegistration } from "../../qa/telemetry";
import {
  RendererPresentationError,
  sanitizeRenderFrameRequest,
  type DecodedFrameRenderer,
  type DecodedFrameSubmission,
  type RenderFrameRequest,
} from "../contracts";
import {
  EXTERNAL_TEXTURE_INGEST_WGSL,
  TIMESAMPLER_COMPOSITE_WGSL,
} from "./shaders";

export interface LinearTextureDescriptor {
  width: number;
  height: number;
  format: "rgba16float";
  colorSpace: "linear-srgb";
}

export interface WebGpuBackend<Frame extends DecodedFrameLike> {
  readonly lost: boolean;
  importExternalTexture(
    frame: Frame,
    colorSpace: "srgb",
  ): unknown;
  createLinearTexture(descriptor: LinearTextureDescriptor): unknown;
  destroyTexture(texture: unknown): void;
  encodeExternalToLinear(
    externalTexture: unknown,
    linearTexture: unknown,
    shaderSource: string,
  ): void;
  encodeComposition(
    linearTexture: unknown,
    request: RenderFrameRequest,
    shaderSource: string,
  ): void;
  submit(): void;
  onDeviceLost(callback: (reason: string) => void): () => void;
  dispose(): void;
}

function presentationFailure(error: unknown) {
  if (error instanceof RendererPresentationError) return error;
  const name =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "SecurityError" || /origin|cross-origin|cors/i.test(message)) {
    return new RendererPresentationError("webgpu-cross-origin-frame");
  }
  if (/color.?space|color conversion/i.test(message)) {
    return new RendererPresentationError("webgpu-color-space-failed");
  }
  return new RendererPresentationError("webgpu-presentation-failed");
}

export class GpuCompositor<Frame extends DecodedFrameLike>
  implements DecodedFrameRenderer<Frame>
{
  readonly path = "webcodecs-webgpu" as const;
  private linearTexture: unknown | null = null;
  private dimensions = "";
  private disposed = false;
  private deviceLost = false;
  private readonly stopLossListener: () => void;
  private readonly resourceRegistration?: QaResourceRegistration;

  constructor(
    private readonly backend: WebGpuBackend<Frame>,
    private readonly options: {
      telemetry?: QaMediaTelemetryBridge;
      onDeviceLost?: (reason: string) => void;
    } = {},
  ) {
    this.resourceRegistration = this.options.telemetry?.registerResources({
      gpuBuffers: 1,
    });
    this.stopLossListener = backend.onDeviceLost((reason) => {
      this.deviceLost = true;
      this.destroyLinearTexture();
      this.options.onDeviceLost?.(reason);
    });
  }

  get lost() {
    return this.deviceLost || this.backend.lost;
  }

  present(
    lease: FrameLease<Frame>,
    unsafeRequest: RenderFrameRequest,
  ): DecodedFrameSubmission<Frame> {
    if (this.disposed) {
      throw new RendererPresentationError("webgpu-renderer-disposed");
    }
    if (this.lost) {
      throw new RendererPresentationError("webgpu-device-lost");
    }
    if (!lease.valid) {
      throw new RendererPresentationError("frame-lease-released");
    }
    const request = sanitizeRenderFrameRequest(unsafeRequest);
    const texture = this.ensureLinearTexture(request);
    try {
      const externalTexture = this.backend.importExternalTexture(
        lease.frame,
        "srgb",
      );
      this.backend.encodeExternalToLinear(
        externalTexture,
        texture,
        EXTERNAL_TEXTURE_INGEST_WGSL,
      );
      this.backend.encodeComposition(
        texture,
        request,
        TIMESAMPLER_COMPOSITE_WGSL,
      );
      this.backend.submit();
      return {
        path: this.path,
        receipt: PresentationReceipt.submitted(lease),
      };
    } catch (error) {
      throw presentationFailure(error);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLossListener();
    this.destroyLinearTexture();
    this.backend.dispose();
    this.resourceRegistration?.release();
  }

  private ensureLinearTexture(request: RenderFrameRequest) {
    const dimensions = `${request.width}x${request.height}`;
    if (this.linearTexture && dimensions === this.dimensions) {
      return this.linearTexture;
    }
    this.destroyLinearTexture();
    this.linearTexture = this.backend.createLinearTexture({
      width: request.width,
      height: request.height,
      format: "rgba16float",
      colorSpace: "linear-srgb",
    });
    this.dimensions = dimensions;
    this.resourceRegistration?.add({
      gpuTextures: 1,
    });
    return this.linearTexture;
  }

  private destroyLinearTexture() {
    if (!this.linearTexture) return;
    this.backend.destroyTexture(this.linearTexture);
    this.linearTexture = null;
    this.dimensions = "";
    this.resourceRegistration?.add({
      gpuTextures: -1,
    });
  }
}
