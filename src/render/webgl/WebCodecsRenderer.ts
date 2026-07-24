import {
  PresentationReceipt,
  type FrameLease,
} from "../../media/FrameCache";
import type { DecodedFrameLike } from "../../media/types";
import type { QaMediaTelemetryBridge } from "../../media/telemetry";
import {
  RendererPresentationError,
  sanitizeRenderFrameRequest,
  type DecodedFrameRenderer,
  type DecodedFrameSubmission,
  type RenderFrameRequest,
} from "../contracts";

export interface WebGl2Backend<Source extends object> {
  readonly lost: boolean;
  presentSource(source: Source, request: RenderFrameRequest): void;
  onContextLost(callback: (reason: string) => void): () => void;
  dispose(): void;
}

function webGlFailure(error: unknown) {
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
    return new RendererPresentationError("webgl-cross-origin-frame");
  }
  return new RendererPresentationError("webgl-presentation-failed");
}

export class WebCodecsRenderer<Frame extends DecodedFrameLike>
  implements DecodedFrameRenderer<Frame>
{
  readonly path = "webcodecs-webgl2" as const;
  private disposed = false;
  private contextLost = false;
  private readonly stopLossListener: () => void;

  constructor(
    private readonly backend: WebGl2Backend<Frame>,
    onContextLost?: (reason: string) => void,
    private readonly telemetry?: QaMediaTelemetryBridge,
  ) {
    this.telemetry?.resources({ gpuTextures: 2 });
    this.stopLossListener = backend.onContextLost((reason) => {
      this.contextLost = true;
      onContextLost?.(reason);
    });
  }

  get lost() {
    return this.contextLost || this.backend.lost;
  }

  present(
    lease: FrameLease<Frame>,
    unsafeRequest: RenderFrameRequest,
  ): DecodedFrameSubmission<Frame> {
    if (this.disposed) {
      throw new RendererPresentationError("webgl-renderer-disposed");
    }
    if (this.lost) {
      throw new RendererPresentationError("webgl-context-lost");
    }
    if (!lease.valid) {
      throw new RendererPresentationError("frame-lease-released");
    }
    try {
      this.backend.presentSource(
        lease.frame,
        sanitizeRenderFrameRequest(unsafeRequest),
      );
      return {
        path: this.path,
        receipt: PresentationReceipt.submitted(lease),
      };
    } catch (error) {
      throw webGlFailure(error);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLossListener();
    this.backend.dispose();
    this.telemetry?.resources({ gpuTextures: 0 });
  }
}
