import type { FrameLease } from "../media/FrameCache";
import type {
  DirectPlaybackProbe,
  RendererCapabilities,
} from "../media/capabilities";
import { selectPlaybackFallback } from "../media/capabilities";
import type { PlaybackCoordinator } from "../media/PlaybackCoordinator";
import type { DecodedFrameLike, MediaFallback } from "../media/types";
import {
  RendererPresentationError,
  type DecodedFrameRenderer,
  type DecodedFrameSubmission,
  type HtmlVideoRendererLike,
  type RenderFrameRequest,
  type RendererRuntimeSnapshot,
} from "./contracts";

interface MediaRendererRuntimeOptions<
  Frame extends DecodedFrameLike,
  Video extends object,
> {
  direct: DirectPlaybackProbe;
  capabilities: RendererCapabilities;
  coordinator: PlaybackCoordinator<Frame>;
  webgpu?: DecodedFrameRenderer<Frame>;
  webgl?: DecodedFrameRenderer<Frame>;
  htmlVideo?: HtmlVideoRendererLike<Video>;
}

function reasonFrom(error: unknown, fallback: string) {
  return error instanceof RendererPresentationError
    ? error.reason
    : fallback;
}

export class MediaRendererRuntime<
  Frame extends DecodedFrameLike,
  Video extends object,
> {
  private fallback: MediaFallback;
  private deviceLost = false;
  private disposed = false;

  constructor(
    private readonly options: MediaRendererRuntimeOptions<Frame, Video>,
  ) {
    this.fallback = selectPlaybackFallback(
      options.direct,
      options.capabilities,
    );
    this.normalizeAvailablePath();
    options.coordinator.selectPlaybackPath(this.fallback);
  }

  snapshot(): RendererRuntimeSnapshot {
    return {
      fallback: { ...this.fallback },
      deviceLost: this.deviceLost,
    };
  }

  presentDecoded(
    lease: FrameLease<Frame>,
    request: RenderFrameRequest,
  ): DecodedFrameSubmission<Frame> | null {
    this.assertOpen();
    if (this.fallback.path === "webcodecs-webgpu") {
      try {
        if (!this.options.webgpu) {
          throw new RendererPresentationError(
            "webgpu-renderer-unavailable",
          );
        }
        return this.options.webgpu.present(lease, request);
      } catch (error) {
        this.options.webgpu?.dispose();
        this.fallback = this.options.webgl
          ? {
              path: "webcodecs-webgl2",
              reason: reasonFrom(
                error,
                "webgpu-presentation-failed",
              ),
            }
          : this.compatibilityFallback(
              reasonFrom(error, "webgpu-presentation-failed"),
            );
        this.options.coordinator.selectPlaybackPath(this.fallback);
      }
    }
    if (this.fallback.path === "webcodecs-webgl2") {
      try {
        if (!this.options.webgl) {
          throw new RendererPresentationError(
            "webgl-renderer-unavailable",
          );
        }
        return this.options.webgl.present(lease, request);
      } catch (error) {
        this.options.webgl?.dispose();
        this.fallback = this.compatibilityFallback(
          reasonFrom(error, "webgl-presentation-failed"),
        );
        this.options.coordinator.selectPlaybackPath(this.fallback);
      }
    }
    lease.release();
    return null;
  }

  presentHtmlVideo(video: Video, request: RenderFrameRequest) {
    this.assertOpen();
    if (
      this.fallback.path !== "html-video-webgl2" ||
      !this.options.htmlVideo
    ) {
      throw new RendererPresentationError(
        "html-video-renderer-unavailable",
      );
    }
    try {
      this.options.htmlVideo.present(video, request);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const isCrossOrigin =
        (error instanceof DOMException &&
          error.name === "SecurityError") ||
        /origin|cross-origin|cors/i.test(message);
      this.fallback = {
        path: "native-static",
        reason: isCrossOrigin
          ? "html-video-cross-origin-frame"
          : "html-video-presentation-failed",
      };
      this.options.coordinator.selectPlaybackPath(this.fallback);
      return false;
    }
  }

  handleWebGpuDeviceLoss(reason = "webgpu-device-lost") {
    this.assertOpen();
    this.deviceLost = true;
    this.options.webgpu?.dispose();
    this.fallback = this.options.webgl
      ? { path: "webcodecs-webgl2", reason }
      : this.compatibilityFallback(reason);
    this.options.coordinator.selectPlaybackPath(this.fallback);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.options.webgpu?.dispose();
    this.options.webgl?.dispose();
    this.options.htmlVideo?.dispose();
  }

  private compatibilityFallback(reason: string): MediaFallback {
    return this.options.htmlVideo
      ? { path: "html-video-webgl2", reason }
      : { path: "native-static", reason };
  }

  private normalizeAvailablePath() {
    if (
      this.fallback.path === "webcodecs-webgpu" &&
      !this.options.webgpu
    ) {
      this.fallback = this.options.webgl
        ? {
            path: "webcodecs-webgl2",
            reason: "webgpu-renderer-unavailable",
          }
        : this.compatibilityFallback(
            "webgpu-renderer-unavailable",
          );
    }
    if (
      this.fallback.path === "webcodecs-webgl2" &&
      !this.options.webgl
    ) {
      this.fallback = this.compatibilityFallback(
        "webgl-renderer-unavailable",
      );
    }
    if (
      this.fallback.path === "html-video-webgl2" &&
      !this.options.htmlVideo
    ) {
      this.fallback = {
        path: "native-static",
        reason: "html-video-renderer-unavailable",
      };
    }
  }

  private assertOpen() {
    if (this.disposed) {
      throw new RendererPresentationError(
        "renderer-runtime-disposed",
      );
    }
  }
}

export function createMediaRendererRuntime<
  Frame extends DecodedFrameLike,
  Video extends object,
>(options: MediaRendererRuntimeOptions<Frame, Video>) {
  return new MediaRendererRuntime(options);
}
