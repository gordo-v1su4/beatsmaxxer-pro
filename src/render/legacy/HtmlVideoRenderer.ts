import {
  sanitizeRenderFrameRequest,
  type HtmlVideoRendererLike,
  type RenderFrameRequest,
} from "../contracts";
import type { WebGl2Backend } from "../webgl/WebCodecsRenderer";
import { updateMediaTelemetry } from "../../qa/telemetry";

interface PooledVideo {
  video: HTMLVideoElement;
  refs: number;
}

const videoPool = new Map<string, PooledVideo>();

function refreshPoolTelemetry() {
  updateMediaTelemetry({
    resources: { videoElements: videoPool.size },
  });
}

export function acquirePooledVideo(url: string) {
  const existing = videoPool.get(url);
  if (existing) {
    existing.refs += 1;
    return existing.video;
  }
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  videoPool.set(url, { video, refs: 1 });
  refreshPoolTelemetry();
  return video;
}

export function releasePooledVideo(url: string) {
  const entry = videoPool.get(url);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.video.pause();
  entry.video.removeAttribute("src");
  entry.video.load();
  videoPool.delete(url);
  refreshPoolTelemetry();
}

export function pooledVideoCount() {
  return videoPool.size;
}

export class HtmlVideoRenderer<
  Video extends object = HTMLVideoElement,
> implements HtmlVideoRendererLike<Video> {
  readonly path = "html-video-webgl2" as const;
  private disposed = false;

  constructor(private readonly backend: WebGl2Backend<Video>) {}

  present(video: Video, request: RenderFrameRequest) {
    if (this.disposed) throw new Error("html-video-renderer-disposed");
    this.backend.presentSource(
      video,
      sanitizeRenderFrameRequest(request),
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.backend.dispose();
  }
}
