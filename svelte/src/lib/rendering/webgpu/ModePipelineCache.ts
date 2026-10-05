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
  private failed = 0;
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
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts[variant]] }),
        vertex: { module, entryPoint: 'vertexMain' },
        fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' }
      })
      .then((pipeline) => {
        if (this.disposed) return null;
        this.ready.set(key, pipeline);
        return pipeline;
      })
      .catch((err) => {
        this.failed += 1;
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

  get builtCount() {
    return this.ready.size;
  }

  /** Settled builds, successful or not — what a progress meter counts. */
  get settledCount() {
    return this.ready.size + this.failed;
  }

  get totalCount() {
    return SHADER_EFFECT_MODES.length * 2;
  }

  dispose() {
    this.disposed = true;
    this.ready.clear();
    this.pending.clear();
  }
}

function cacheKey(variant: FxVariant, mode: number) {
  return `${variant}:${mode}`;
}
