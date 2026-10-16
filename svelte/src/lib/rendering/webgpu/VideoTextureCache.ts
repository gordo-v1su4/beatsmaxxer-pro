/** Persistent GPU copies of the latest decoded video frames for seek gaps. */
import type { NativeFrameSurface } from '$lib/media/NativeFrameSurface';

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
  }>();
  private frameViews = new Map<string, GPUTextureView>();
  private copiedFrames = 0;
  private reusedFrames = 0;
  get diagnostics() { return { copiedFrames: this.copiedFrames, reusedFrames: this.reusedFrames }; }

  beginFrame() {
    this.frameViews.clear();
  }

  upload(device: GPUDevice, key: string, source: HTMLVideoElement): GPUTextureView {
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
      entry?.frames?.dispose();
      entry?.texture.destroy();
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
    entry.uploadedRevision = revision;
    entry.hasFrame = true;
    this.copiedFrames++;
    this.frameViews.set(key, entry.view);
    return entry.view;
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
      entry?.frames?.dispose();
      entry?.texture.destroy();
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
    for (const entry of this.entries.values()) { entry.frames?.dispose(); entry.texture.destroy(); }
    this.entries.clear();
    this.frameViews.clear();
  }
}
