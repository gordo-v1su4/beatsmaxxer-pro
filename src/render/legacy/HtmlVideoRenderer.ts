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

export function releasePooledVideo(
  url: string,
  signal?: AbortSignal,
) {
  const entry = videoPool.get(url);
  if (!entry) return Promise.resolve();
  entry.refs -= 1;
  if (entry.refs > 0) return Promise.resolve();
  const emptied = new Promise<void>((resolve, reject) => {
    const finish = () => {
      entry.video.removeEventListener("emptied", finish);
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      entry.video.removeEventListener("emptied", finish);
      reject(new DOMException("video-cleanup-aborted", "AbortError"));
    };
    entry.video.addEventListener("emptied", finish, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    queueMicrotask(() => {
      if (
        entry.video.networkState === HTMLMediaElement.NETWORK_EMPTY
      ) {
        finish();
      }
    });
  });
  entry.video.pause();
  entry.video.removeAttribute("src");
  entry.video.load();
  videoPool.delete(url);
  refreshPoolTelemetry();
  return emptied;
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
