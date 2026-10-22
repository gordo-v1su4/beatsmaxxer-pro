import { moduleFxWgslForMode, SHADER_EFFECT_MODES } from './shaders/moduleFx.wgsl';
import { FX_IMMEDIATE_BYTES, withFxImmediates } from './FxUniforms';
import type { FxCapabilities } from './FxCapabilities';

export type FxVariant = 'video' | 'idle';

/**
 * One small FX pipeline per (variant, effect mode), compiled asynchronously.
 * Shared texture bindings alias both variants to one pipeline per effect.
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
    private readonly layouts: Record<FxVariant, GPUBindGroupLayout>,
    private readonly capabilities: FxCapabilities = { immediates: false, sharedTextures: false }
  ) {}

  get(variant: FxVariant, mode: number): GPURenderPipeline | null {
    const key = this.key(variant, mode);
    const pipeline = this.ready.get(key);
    if (pipeline) return pipeline;
    if (!this.pending.has(key)) void this.build(variant, mode);
    return null;
  }

  /** Whether this mode's own pipeline is built. Never starts a build. */
  isReady(variant: FxVariant, mode: number): boolean {
    return this.ready.has(this.key(variant, mode));
  }

  /** Resolves once this mode's pipeline exists (null if it failed to build). */
  build(variant: FxVariant, mode: number): Promise<GPURenderPipeline | null> {
    variant = this.capabilities.sharedTextures ? 'video' : variant;
    const key = this.key(variant, mode);
    const built = this.ready.get(key);
    if (built) return Promise.resolve(built);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const source = moduleFxWgslForMode(mode, variant);
    const module = this.device.createShaderModule({
      code: this.capabilities.immediates ? withFxImmediates(source) : source
    });
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

  /** Warm every mode, retrying transient compiler failures before startup opens.
   * Ready entries are reused; only failed entries compile again. */
  async warmAll(): Promise<void> {
    for (let attempt = 0; attempt < 3 && !this.disposed; attempt++) {
      const builds: Promise<unknown>[] = [];
      for (const mode of SHADER_EFFECT_MODES) {
        builds.push(this.build('video', mode), this.build('idle', mode));
      }
      await Promise.all(builds);
      if (this.failed.size === 0) return;
    }
  }

  /** Settled builds, successful or not — what a progress meter counts. */
  get settledCount() {
    return this.ready.size + this.failed.size;
  }

  get readyCount() {
    return this.ready.size;
  }

  get totalCount() {
    return SHADER_EFFECT_MODES.length * (this.capabilities.sharedTextures ? 1 : 2);
  }

  private key(variant: FxVariant, mode: number) {
    return `${this.capabilities.sharedTextures ? 'video' : variant}:${mode}`;
  }

  private layoutFor(variant: FxVariant): GPUPipelineLayout {
    let layout = this.pipelineLayouts.get(variant);
    if (!layout) {
      layout = this.device.createPipelineLayout({
        bindGroupLayouts: [this.layouts[variant]],
        ...(this.capabilities.immediates ? { immediateSize: FX_IMMEDIATE_BYTES } : {})
      });
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
