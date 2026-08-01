/** Persistent GPU copies of the latest decoded video frames for seek gaps. */
import type { NativeFrameSurface } from '$lib/media/NativeFrameSurface';

export class VideoTextureCache {
  private entries = new Map<string, {
    texture: GPUTexture;
    view: GPUTextureView;
    width: number;
    height: number;
    source: HTMLVideoElement;
  }>();
  private frameViews = new Map<string, GPUTextureView>();

  beginFrame() {
    this.frameViews.clear();
  }

  upload(device: GPUDevice, key: string, source: HTMLVideoElement): GPUTextureView {
    const inFrame = this.frameViews.get(key);
    if (inFrame) return inFrame;
    const width = source.videoWidth;
    const height = source.videoHeight;
    if (width < 1 || height < 1) throw new Error('video-texture-source-has-no-frame');

    let entry = this.entries.get(key);
    if (!entry || entry.width !== width || entry.height !== height || entry.source !== source) {
      entry?.texture.destroy();
      const texture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = { texture, view: texture.createView(), width, height, source };
      this.entries.set(key, entry);
    }

    device.queue.copyExternalImageToTexture({ source }, { texture: entry.texture }, [width, height]);
    this.frameViews.set(key, entry.view);
    return entry.view;
  }

  uploadRgba(device: GPUDevice, key: string, surface: NativeFrameSurface): GPUTextureView {
    const inFrame = this.frameViews.get(key);
    if (inFrame) return inFrame;
    const { width, height, data } = surface;
    if (width < 1 || height < 1 || data.byteLength < width * height * 4) {
      throw new Error('native-texture-source-has-no-frame');
    }

    let entry = this.entries.get(key);
    if (!entry || entry.width !== width || entry.height !== height) {
      entry?.texture.destroy();
      const texture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = { texture, view: texture.createView(), width, height, source: null as unknown as HTMLVideoElement };
      this.entries.set(key, entry);
    }

    device.queue.writeTexture(
      { texture: entry.texture },
      data,
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height]
    );
    this.frameViews.set(key, entry.view);
    return entry.view;
  }

  cachedView(key: string, source: HTMLVideoElement): GPUTextureView | null {
    const entry = this.entries.get(key);
    return entry?.source === source ? entry.view : null;
  }

  dispose() {
    for (const entry of this.entries.values()) entry.texture.destroy();
    this.entries.clear();
    this.frameViews.clear();
  }
}
