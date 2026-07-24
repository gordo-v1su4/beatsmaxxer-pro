import type {
  FrameLease,
  PresentationReceipt,
} from "../media/FrameCache";
import type { DecodedFrameLike, MediaFallback } from "../media/types";
import type { TimeSamplerAccentMode } from "../timesampler/types";

export type PromotedRenderEffect = "source" | "timesampler";

export interface RenderFrameRequest {
  width: number;
  height: number;
  effect: PromotedRenderEffect;
  accentMode: TimeSamplerAccentMode;
  accentEnvelope: number;
  rgbOffset: number;
  mix: number;
}

export interface DecodedFrameSubmission<
  Frame extends DecodedFrameLike,
> {
  path: "webcodecs-webgpu" | "webcodecs-webgl2";
  receipt: PresentationReceipt<Frame>;
}

export interface DecodedFrameRenderer<
  Frame extends DecodedFrameLike,
> {
  readonly path: DecodedFrameSubmission<Frame>["path"];
  readonly lost: boolean;
  present(
    lease: FrameLease<Frame>,
    request: RenderFrameRequest,
  ): DecodedFrameSubmission<Frame>;
  dispose(): void;
}

export interface HtmlVideoRendererLike<Video extends object> {
  readonly path: "html-video-webgl2";
  present(video: Video, request: RenderFrameRequest): void;
  dispose(): void;
}

export class RendererPresentationError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "RendererPresentationError";
  }
}

export interface RendererRuntimeSnapshot {
  fallback: MediaFallback;
  deviceLost: boolean;
}

export function sanitizeRenderFrameRequest(
  request: RenderFrameRequest,
): RenderFrameRequest {
  if (
    !Number.isInteger(request.width) ||
    !Number.isInteger(request.height) ||
    request.width <= 0 ||
    request.height <= 0
  ) {
    throw new RendererPresentationError("invalid-frame-dimensions");
  }
  return {
    ...request,
    accentEnvelope: Number.isFinite(request.accentEnvelope)
      ? Math.min(1, Math.max(0, request.accentEnvelope))
      : 0,
    rgbOffset: Number.isFinite(request.rgbOffset)
      ? Math.min(0.1, Math.max(0, request.rgbOffset))
      : 0,
    mix: Number.isFinite(request.mix)
      ? Math.min(1, Math.max(0, request.mix))
      : 1,
  };
}
