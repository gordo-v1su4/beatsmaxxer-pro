/** Persistent GPU copies of the latest decoded video frames for seek gaps. */
import type { NativeFrameSurface } from '$lib/media/NativeFrameSurface';

const LOOP_SEAM_SECONDS = 0.55;
const LOOP_SEAM_FRAMES = 8;
const LOOP_SEAM_BUDGET_BYTES = 512 * 1024 * 1024;
const LOOP_SEAM_MAX_FRAME_DISTANCE_SECONDS = LOOP_SEAM_SECONDS / LOOP_SEAM_FRAMES + 1 / 120;

function observeFrames(source: HTMLVideoElement) {
  let revision = 0, callback: number | undefined, disposed = false;
  const hasCallbacks = typeof source.requestVideoFrameCallback === 'function';
  const dirty = () => { revision++; };
  const presented: VideoFrameRequestCallback = () => {
    if (disposed) return;
    dirty(); callback = source.requestVideoFrameCallback(presented);
  };
  source.addEventListener('seeked', dirty);
  source.addEventListener('loadeddata', dirty);
  if (hasCallbacks) callback = source.requestVideoFrameCallback(presented);
  return {
    revision: () => `${revision}:${hasCallbacks ? '' : source.currentTime}`,
    dispose() {
      disposed = true;
      if (callback !== undefined) source.cancelVideoFrameCallback(callback);
      source.removeEventListener('seeked', dirty);
      source.removeEventListener('loadeddata', dirty);
    },
  };
}

export class VideoTextureCache {
  private entries = new Map<string, {
    texture: GPUTexture;
    view: GPUTextureView;
    width: number;
    height: number;
    source: HTMLVideoElement;
    nativeSequence?: number;
    frames?: ReturnType<typeof observeFrames>;
    uploadedRevision?: string;
    hasFrame?: boolean;
    loopSeam?: Array<{ texture: GPUTexture; view: GPUTextureView; time: number }>;
  }>();
  private frameViews = new Map<string, GPUTextureView>();
  private copiedFrames = 0;
  private reusedFrames = 0;
  private loopSeamBytes = 0;
  get diagnostics() {
    return {
      copiedFrames: this.copiedFrames,
      reusedFrames: this.reusedFrames,
      loopSeamFrames: [...this.entries.values()].reduce((sum, entry) => sum + (entry.loopSeam?.length ?? 0), 0),
      loopSeamBytes: this.loopSeamBytes
    };
  }

  beginFrame() {
    this.frameViews.clear();
  }

  upload(
    device: GPUDevice,
    key: string,
    source: HTMLVideoElement,
    options: { captureLoopSeam?: boolean } = {}
  ): GPUTextureView {
    const stale = this.entries.get(key);
    const inFrame = this.frameViews.get(key);
    if (inFrame && stale?.hasFrame && stale.source === source && inFrame === stale.view
      && stale.width === source.videoWidth && stale.height === source.videoHeight) return inFrame;
    if (
      source.seeking ||
      source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      if (stale?.source === source && stale.hasFrame) {
        this.frameViews.set(key, stale.view);
        return stale.view;
      }
      throw new Error('video-texture-source-has-no-frame');
    }
    const width = source.videoWidth;
    const height = source.videoHeight;
    if (width < 1 || height < 1) throw new Error('video-texture-source-has-no-frame');

    let entry = this.entries.get(key);
    if (!entry || entry.width !== width || entry.height !== height || entry.source !== source) {
      if (entry) this.destroyEntry(entry);
      const texture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = { texture, view: texture.createView(), width, height, source, frames: observeFrames(source) };
      this.entries.set(key, entry);
    }

    const revision = entry.frames!.revision();
    if (entry.hasFrame && entry.uploadedRevision === revision) {
      this.reusedFrames++;
      this.frameViews.set(key, entry.view);
      return entry.view;
    }
    device.queue.copyExternalImageToTexture({ source }, { texture: entry.texture }, [width, height]);
    if (options.captureLoopSeam) this.captureLoopSeamFrame(device, entry, source);
    entry.uploadedRevision = revision;
    entry.hasFrame = true;
    this.copiedFrames++;
    this.frameViews.set(key, entry.view);
    return entry.view;
  }

  needsLoopSeamCapture(key: string, source: HTMLVideoElement) {
    const entry = this.entries.get(key);
    return source.currentTime <= LOOP_SEAM_SECONDS &&
      entry?.source === source && (entry.loopSeam?.length ?? 0) < LOOP_SEAM_FRAMES;
  }

  loopSeamFrame(key: string, source: HTMLVideoElement, targetSeconds: number) {
    const entry = this.entries.get(key);
    if (entry?.source !== source || !entry.loopSeam?.length) return null;
    let selected = entry.loopSeam[0];
    for (const frame of entry.loopSeam) {
      if (frame.time > targetSeconds + 1 / 120) break;
      selected = frame;
    }
    if (
      selected.time > targetSeconds + 1 / 120 ||
      targetSeconds - selected.time > LOOP_SEAM_MAX_FRAME_DISTANCE_SECONDS
    ) return null;
    return { view: selected.view, pts: selected.time };
  }

  private captureLoopSeamFrame(
    device: GPUDevice,
    entry: NonNullable<ReturnType<VideoTextureCache['entries']['get']>>,
    source: HTMLVideoElement
  ) {
    const time = source.currentTime;
    if (time > LOOP_SEAM_SECONDS) return;
    const frames = entry.loopSeam ??= [];
    if (frames.length >= LOOP_SEAM_FRAMES) return;
    const bin = Math.min(
      LOOP_SEAM_FRAMES - 1,
      Math.floor((time / LOOP_SEAM_SECONDS) * LOOP_SEAM_FRAMES)
    );
    const alreadyCaptured = frames.some((frame) =>
      Math.min(
        LOOP_SEAM_FRAMES - 1,
        Math.floor((frame.time / LOOP_SEAM_SECONDS) * LOOP_SEAM_FRAMES)
      ) === bin
    );
    if (alreadyCaptured) return;
    const bytes = entry.width * entry.height * 4;
    if (this.loopSeamBytes + bytes > LOOP_SEAM_BUDGET_BYTES) return;
    const texture = device.createTexture({
      size: [entry.width, entry.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    try {
      device.queue.copyExternalImageToTexture(
        { source },
        { texture },
        [entry.width, entry.height]
      );
      frames.push({ texture, view: texture.createView(), time });
      frames.sort((a, b) => a.time - b.time);
      this.loopSeamBytes += bytes;
    } catch (error) {
      texture.destroy();
      throw error;
    }
  }

  uploadBgra(device: GPUDevice, key: string, surface: NativeFrameSurface): GPUTextureView {
    const inFrame = this.frameViews.get(key);
    if (inFrame) return inFrame;
    const { width, height, data } = surface;
    if (width < 1 || height < 1 || data.byteLength < width * height * 4) {
      throw new Error('native-texture-source-has-no-frame');
    }

    let entry = this.entries.get(key);
    if (!entry || entry.width !== width || entry.height !== height || entry.source !== null) {
      if (entry) this.destroyEntry(entry);
      const texture = device.createTexture({
        size: [width, height],
        format: 'bgra8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = {
        texture,
        view: texture.createView(),
        width,
        height,
        source: null as unknown as HTMLVideoElement
      };
      this.entries.set(key, entry);
    }

    if (entry.nativeSequence === surface.sequence) {
      this.frameViews.set(key, entry.view);
      return entry.view;
    }

    device.queue.writeTexture(
      { texture: entry.texture },
      data,
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height]
    );
    entry.nativeSequence = surface.sequence;
    this.frameViews.set(key, entry.view);
    return entry.view;
  }

  cachedView(key: string, source: HTMLVideoElement): GPUTextureView | null {
    const entry = this.entries.get(key);
    return entry?.source === source && entry.hasFrame ? entry.view : null;
  }

  dispose() {
    for (const entry of this.entries.values()) this.destroyEntry(entry);
    this.entries.clear();
    this.frameViews.clear();
  }

  private destroyEntry(entry: NonNullable<ReturnType<VideoTextureCache['entries']['get']>>) {
    entry.frames?.dispose();
    entry.texture.destroy();
    const bytes = entry.width * entry.height * 4;
    for (const frame of entry.loopSeam ?? []) frame.texture.destroy();
    this.loopSeamBytes = Math.max(0, this.loopSeamBytes - bytes * (entry.loopSeam?.length ?? 0));
  }
}
