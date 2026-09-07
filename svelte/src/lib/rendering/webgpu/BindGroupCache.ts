/** Idle previews share placeholder texture views; key on the per-canvas uniform
    buffer first so each rack slot keeps its own effect mode and accent. */
export class IdleBindGroupCache {
  private perUniform = new WeakMap<GPUBuffer, TextureViewBindGroupCache>();

  get(
    uniformBuffer: GPUBuffer,
    primaryView: GPUTextureView,
    secondaryView: GPUTextureView,
    create: () => GPUBindGroup
  ): GPUBindGroup {
    let cache = this.perUniform.get(uniformBuffer);
    if (!cache) {
      cache = new TextureViewBindGroupCache();
      this.perUniform.set(uniformBuffer, cache);
    }
    return cache.get(primaryView, secondaryView, create);
  }

  clear() {
    this.perUniform = new WeakMap();
  }
}

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
