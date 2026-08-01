import { videoPool } from '$lib/media/VideoPool';
import type { TimelineFrame } from '$lib/transport';
import type { VideoSourcePort } from '$lib/media/VideoSourcePort';
import type { VideoSurfaceSource } from '$lib/media/NativeFrameSurface';

/** Web decode path — wraps the shared HTMLVideoElement pool. */
export class HtmlVideoSource implements VideoSourcePort {
  readonly kind = 'html-video' as const;

  async attach(moduleId: string, url: string) {
    await videoPool.prepare(moduleId, url);
    videoPool.markFreeRun(moduleId);
  }

  getSurface(moduleId: string): VideoSurfaceSource | null {
    return videoPool.get(moduleId) ?? null;
  }

  tick(frameOrPlaying: TimelineFrame | boolean) {
    videoPool.tick(frameOrPlaying);
  }

  async release(moduleId: string) {
    await videoPool.detach(moduleId);
  }

  async dispose() {
    await videoPool.dispose();
  }
}

export const htmlVideoSource = new HtmlVideoSource();
