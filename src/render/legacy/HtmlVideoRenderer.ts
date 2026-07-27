import {
  sanitizeRenderFrameRequest,
  type HtmlVideoRendererLike,
  type RenderFrameRequest,
} from "../contracts";
import type { WebGl2Backend } from "../webgl/WebCodecsRenderer";

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
