import { ALL_FORMATS, BlobSource, Input, UrlSource } from 'mediabunny';
import { videoPool } from '$lib/media/VideoPool';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import type { TimelineFrame } from '$lib/transport';

/** Originals retain the existing HTMLVideo → one reusable WebGPU texture path. */
export class StreamingFrameSource {
  width = 0;
  height = 0;
  duration = 0;
  fps = 0;
  private ready = false;
  private stopped = false;
  private input: Input | null = null;
  private loadMs = 0;
  private clocks = new Map<string, { time: number; target: number; rate: number; generation: number }>();

  get stats() {
    return { ready: this.ready, frames: this.ready ? 1 : 0, bytes: 0,
      width: this.width, height: this.height, fps: this.fps, duration: this.duration,
      decoderDisposed: false, metadataDisposed:this.input===null,
      decodedFrames: 0, uploadedFrames: 0, loadMs: this.loadMs };
  }

  async load(source: Blob | string) {
    const started=performance.now();
    const input = new Input({ formats: ALL_FORMATS, source: typeof source === 'string' ? new UrlSource(source) : new BlobSource(source) });
    this.input = input;
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('The selected original has no video track');
      const [width, height, duration, packets] = await Promise.all([
        track.getDisplayWidth(), track.getDisplayHeight(), track.computeDuration(), track.computePacketStats()
      ]);
      if (this.stopped) return;
      if (!(duration > 0) || !Number.isFinite(duration)) throw new Error('The original has no finite duration');
      this.width = width; this.height = height; this.duration = duration; this.fps = packets.averagePacketRate;
      this.ready = true;
      this.loadMs=performance.now()-started;
    } finally { input.dispose(); if (this.input === input) this.input = null; }
  }

  frameAt(seconds: number, slot: string, frame: TimelineFrame, rate: number) {
    if (!this.ready || this.stopped) return null;
    const previous = this.clocks.get(slot);
    const elapsed = previous ? Math.max(0, frame.positionSeconds - previous.time) : 0;
    const discontinuity = previous && Math.abs(seconds - previous.target - elapsed * previous.rate) > 1 / 30;
    const generation = (previous?.generation ?? 0) + (discontinuity ? 1 : 0);
    // Repeat/jump boundaries seek once; ordinary decoding runs continuously.
    // Holding a slice pauses its video instead of advancing at a minimum rate.
    // Prime the existing texture before the first control seek makes the
    // freshly attached video's decoded frame temporarily unavailable.
    const beforeSeek = webGpuEngine.timingVideoFrame(slot);
    videoPool.syncControlledModule(slot, seconds, rate * frame.playbackRate, rate === 0 ? { ...frame, playing: false } : frame, generation);
    this.clocks.set(slot, { time: frame.positionSeconds, target: seconds, rate, generation });
    const view = webGpuEngine.timingVideoFrame(slot) ?? beforeSeek;
    const video = videoPool.get(slot);
    return view && video ? { view, pts: video.currentTime } : null;
  }

  dispose() { this.stopped = true; this.ready = false; this.input?.dispose(); this.input = null; this.clocks.clear(); }
}
