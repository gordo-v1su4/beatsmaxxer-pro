/** Uploads HTMLVideoElement frames into GPUTexture — works where importExternalTexture fails. */
export class VideoTextureCache {
  private entries = new Map<
    string,
    { texture: GPUTexture; view: GPUTextureView; width: number; height: number }
  >();
  private placeholder: { texture: GPUTexture; view: GPUTextureView } | null = null;
  private frameViews = new Map<string, GPUTextureView>();

  beginFrame() {
    this.frameViews.clear();
  }

  upload(device: GPUDevice, key: string, source: HTMLVideoElement | HTMLCanvasElement): GPUTextureView {
    const cached = this.frameViews.get(key);
    if (cached) return cached;

    const width =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source.width;
    const height =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source.height;
    if (width < 1 || height < 1) {
      return this.ensurePlaceholder(device);
    }

    let entry = this.entries.get(key);
    if (!entry || entry.width !== width || entry.height !== height) {
      entry?.texture.destroy();
      const texture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = { texture, view: texture.createView(), width, height };
      this.entries.set(key, entry);
    }

    device.queue.copyExternalImageToTexture({ source }, { texture: entry.texture }, [
      width,
      height
    ]);
    this.frameViews.set(key, entry.view);
    return entry.view;
  }

  ensurePlaceholder(device: GPUDevice): GPUTextureView {
    if (this.placeholder) return this.placeholder.view;
    const texture = device.createTexture({
      size: [2, 2],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.writeTexture(
      { texture },
      new Uint8Array([28, 28, 32, 255, 28, 28, 32, 255, 28, 28, 32, 255, 28, 28, 32, 255]),
      { bytesPerRow: 8 },
      [2, 2]
    );
    this.placeholder = { texture, view: texture.createView() };
    return this.placeholder.view;
  }

  remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      entry.texture.destroy();
      this.entries.delete(key);
    }
    this.frameViews.delete(key);
  }

  dispose() {
    for (const entry of this.entries.values()) entry.texture.destroy();
    this.entries.clear();
    this.frameViews.clear();
    this.placeholder?.texture.destroy();
    this.placeholder = null;
  }
}
