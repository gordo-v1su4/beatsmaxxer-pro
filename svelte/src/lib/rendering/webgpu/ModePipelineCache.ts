import { moduleFxWgslForMode, SHADER_EFFECT_MODES } from './shaders/moduleFx.wgsl';

export type FxVariant = 'video' | 'idle';

/**
 * One small FX pipeline per (variant, effect mode), compiled asynchronously.
 *
 * The single uber-pipeline took ~11s per variant to compile cold, and it was
 * created synchronously, which parks the GPU process for the duration — the
 * splash's compositor animations stall with it. Specialised per mode each
 * compile is ~0.1s, and `createRenderPipelineAsync` runs them in parallel on
 * the driver's worker threads.
 *
 * Lookups never block: `get()` returns null until that mode is built, and the
 * engine falls back to the dry mode-0 pipeline in the meantime, so an effect
 * that is still compiling renders the clip un-effected for a moment rather
 * than not at all.
 */
export class ModePipelineCache {
  private readonly ready = new Map<string, GPURenderPipeline>();
  private readonly pending = new Map<string, Promise<GPURenderPipeline | null>>();
  /** Keys whose last build failed. A later build of the same key retries. */
  private readonly failed = new Set<string>();
  private readonly pipelineLayouts = new Map<FxVariant, GPUPipelineLayout>();
  private disposed = false;

  constructor(
    private readonly device: GPUDevice,
    private readonly layouts: Record<FxVariant, GPUBindGroupLayout>
  ) {}

  get(variant: FxVariant, mode: number): GPURenderPipeline | null {
    const key = cacheKey(variant, mode);
    const pipeline = this.ready.get(key);
    if (pipeline) return pipeline;
    if (!this.pending.has(key)) void this.build(variant, mode);
    return null;
  }

  /** Whether this mode's own pipeline is built. Never starts a build. */
  isReady(variant: FxVariant, mode: number): boolean {
    return this.ready.has(cacheKey(variant, mode));
  }

  /** Resolves once this mode's pipeline exists (null if it failed to build). */
  build(variant: FxVariant, mode: number): Promise<GPURenderPipeline | null> {
    const key = cacheKey(variant, mode);
    const built = this.ready.get(key);
    if (built) return Promise.resolve(built);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const module = this.device.createShaderModule({ code: moduleFxWgslForMode(mode, variant) });
    const promise = this.device
      .createRenderPipelineAsync({
        layout: this.layoutFor(variant),
        vertex: { module, entryPoint: 'vertexMain' },
        fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' }
      })
      .then((pipeline) => {
        if (this.disposed) return null;
        this.failed.delete(key);
        this.ready.set(key, pipeline);
        return pipeline;
      })
      .catch((err) => {
        this.failed.add(key);
        // Forget the attempt so the next get()/build() retries instead of
        // pinning the dry fallback (or no previews at all) for the session.
        this.pending.delete(key);
        console.error(`[webgpu] FX pipeline ${key} failed to build:`, err);
        return null;
      });
    this.pending.set(key, promise);
    return promise;
  }

  /** Kick off every mode for both variants. */
  warmAll(): Promise<void> {
    const builds: Promise<unknown>[] = [];
    for (const mode of SHADER_EFFECT_MODES) {
      builds.push(this.build('video', mode), this.build('idle', mode));
    }
    return Promise.all(builds).then(() => undefined);
  }

  /** Settled builds, successful or not — what a progress meter counts. */
  get settledCount() {
    return this.ready.size + this.failed.size;
  }

  get totalCount() {
    return SHADER_EFFECT_MODES.length * 2;
  }

  private layoutFor(variant: FxVariant): GPUPipelineLayout {
    let layout = this.pipelineLayouts.get(variant);
    if (!layout) {
      layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts[variant]] });
      this.pipelineLayouts.set(variant, layout);
    }
    return layout;
  }

  dispose() {
    this.disposed = true;
    this.pipelineLayouts.clear();
    this.ready.clear();
    this.pending.clear();
  }
}

function cacheKey(variant: FxVariant, mode: number) {
  return `${variant}:${mode}`;
}
