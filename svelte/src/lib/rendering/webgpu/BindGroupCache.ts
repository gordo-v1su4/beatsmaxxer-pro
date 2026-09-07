/** Reuse bind groups while GPU texture view identity stays stable (Spektral pattern). */
export class TextureViewBindGroupCache {
  private cache = new WeakMap<GPUTextureView, WeakMap<GPUTextureView, GPUBindGroup>>();

  get(
    primaryView: GPUTextureView,
    secondaryView: GPUTextureView,
    create: () => GPUBindGroup
  ): GPUBindGroup {
    let secondary = this.cache.get(primaryView);
    if (!secondary) {
      secondary = new WeakMap();
      this.cache.set(primaryView, secondary);
    }
    const existing = secondary.get(secondaryView);
    if (existing) return existing;
    const bindGroup = create();
    secondary.set(secondaryView, bindGroup);
    return bindGroup;
  }

  clear() {
    this.cache = new WeakMap();
  }
}

/** Blit pass only keys on the source view (feedback read or FX write). */
export class BlitBindGroupCache {
  private cache = new WeakMap<GPUTextureView, GPUBindGroup>();

  get(sourceView: GPUTextureView, create: () => GPUBindGroup): GPUBindGroup {
    const existing = this.cache.get(sourceView);
    if (existing) return existing;
    const bindGroup = create();
    this.cache.set(sourceView, bindGroup);
    return bindGroup;
  }

  clear() {
    this.cache = new WeakMap();
  }
}
