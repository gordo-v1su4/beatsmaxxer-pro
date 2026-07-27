import type { ClipRegistry } from "./ClipRegistry";
import { createMp4DemuxBoundary } from "./demux";
import { DecodeScheduler } from "./DecodeScheduler";
import type { ClipDecoderState } from "./decoder/WebCodecsClipDecoder";
import type { PlaybackCoordinator } from "./PlaybackCoordinator";

export class MediaEngine {
  readonly demux = createMp4DemuxBoundary();
  private readonly schedulers = new Map<
    PlaybackCoordinator<VideoFrame>,
    DecodeScheduler
  >();

  attachDecodeScheduler(
    coordinator: PlaybackCoordinator<VideoFrame>,
    onDecoderState?: (
      state: ClipDecoderState,
      queueSize: number | null,
    ) => void,
  ) {
    const existing = this.schedulers.get(coordinator);
    if (existing) return existing;
    const scheduler = new DecodeScheduler(
      coordinator,
      this.demux,
      onDecoderState,
    );
    this.schedulers.set(coordinator, scheduler);
    return scheduler;
  }

  detachDecodeScheduler(coordinator: PlaybackCoordinator<VideoFrame>) {
    const scheduler = this.schedulers.get(coordinator);
    if (!scheduler) return;
    scheduler.dispose();
    this.schedulers.delete(coordinator);
  }

  preloadClip(registry: ClipRegistry, clipId: string) {
    const clip = registry.get(clipId);
    if (!clip) return Promise.resolve(null);
    const scheduler = [...this.schedulers.values()][0];
    if (!scheduler) return Promise.resolve(null);
    return scheduler.loadClip(clip);
  }
}

export const mediaEngine = new MediaEngine();
