import { getPreferredCanvasFormat, getSharedWebGpuDevice } from './SharedGpuDevice';
import { MODULE_FX_IDLE_WGSL, MODULE_FX_WGSL, SHADER_EFFECT_MODE } from './shaders/moduleFx.wgsl';
import { BLIT_WGSL, advanceFeedbackTo, createFeedbackPair, createFeedbackPlaceholder, feedbackReadView, feedbackWriteView, swapFeedback, type FeedbackPair } from './feedback';
import { getModuleDef } from '$lib/modules/catalog';
import { parseAccentColor } from '$lib/modules/registry';
import { videoPool } from '$lib/media/VideoPool';
import type { TimelineFrame } from '$lib/transport';
import type { WebGpuRenderDiagnostics } from '$lib/engine/contracts';
import { VideoTextureCache } from './VideoTextureCache';
import { isTauriRuntime } from '$lib/platform/runtime';
import { previewTargetFps } from '$lib/platform/desktopPerformance';
import { tauriNativeSource } from '$lib/media/sources/TauriNativeSource';
import { isNativeFrameSurface } from '$lib/media/NativeFrameSurface';

export interface ModuleRenderParams {
  mix?: number;
  p0?: number;
  p1?: number;
  p2?: number;
  p3?: number;
  accent?: number;
  /** Live signal from the JS transport the shader can't derive on its own —
      speedramp passes the current playback rate here (1 = normal). */
  aux1?: number;
  /** Second live signal: speedramp cycle phase (0-1). */
  aux2?: number;
}

export interface FrameContext {
  beat: number;
  beatPhase: number;
  bpm: number;
  playing: boolean;
  amplitude: number;
  bassAmp: number;
  pitchSemitones?: number;
  feedbackMix?: number;
  timeline?: TimelineFrame;
}

export interface CanvasBinding {
  bindingId: string;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  idlePipeline: GPURenderPipeline;
  blitPipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  idleBindGroupLayout: GPUBindGroupLayout;
  blitBindGroupLayout: GPUBindGroupLayout;
  color: [number, number, number];
  /** Effect identity may hot-swap without changing this binding's source. */
  effectModuleId: string;
  /** @deprecated Compatibility alias for injected bindings. */
  moduleId?: string;
  /** Stable media/decode identity. Rack canvases use their canvas id. */
  sourceId: string;
  feedback: FeedbackPair;
  placeholderFeedback: GPUTexture;
  placeholderFeedbackView: GPUTextureView;
  active: boolean;
}

interface BindingScheduleState {
  lastRenderContextTimeSeconds: number;
  nextRenderContextTimeSeconds: number;
  lastChangeKey: string;
  renderCount: number;
  skippedRenderCount: number;
  lastFrameIntervalMs: number | null;
}

const PERSISTENT_VIDEO_CACHE_MODULES = new Set(['timesampler']);

/** WKWebView can accept GPUExternalTexture imports yet present them as black.
 * Desktop therefore uses an explicit GPUTexture copy for every module; web
 * keeps the lower-overhead external-texture path except where persistence is
 * part of the effect contract. */
export function shouldUsePersistentVideoTexture(moduleId: string, tauri = isTauriRuntime()) {
  return tauri || PERSISTENT_VIDEO_CACHE_MODULES.has(moduleId);
}

export class WebGpuEngine {
  private readonly previewTargetFps = previewTargetFps();
  private readonly previewIntervalSeconds = 1 / this.previewTargetFps;
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private bindings = new Map<string, CanvasBinding>();
  private renderDiag = new Map<string, WebGpuRenderDiagnostics>();
  private renderParams = new Map<string, ModuleRenderParams>();
  private renderParamVersions = new Map<string, number>();
  private bindingSchedule = new Map<string, BindingScheduleState>();
  private taskExternalTextures: Map<HTMLVideoElement, GPUExternalTexture> | null = null;
  private videoTextureCache = new VideoTextureCache();
  private pgmLiveModuleId = 'transition';
  private pgmLiveSourceId = 'top-0';
  private paused = false;
  private frameCtx: FrameContext = {
    beat: 0,
    beatPhase: 0,
    bpm: 128,
    playing: false,
    amplitude: 0,
    bassAmp: 0
  };
  private sampler: GPUSampler | null = null;
  private blitPipeline: GPURenderPipeline | null = null;
  private blitBindGroupLayout: GPUBindGroupLayout | null = null;
  private placeholderFeedback: GPUTexture | null = null;
  private placeholderFeedbackView: GPUTextureView | null = null;
  private initPromise: Promise<boolean> | null = null;

  /** Idempotent, race-safe init: concurrent callers share one in-flight attempt. */
  async init(): Promise<boolean> {
    if (this.device) return true;
    if (!this.initPromise) this.initPromise = this.initOnce();
    return this.initPromise;
  }

  private async initOnce(): Promise<boolean> {
    this.device = await getSharedWebGpuDevice();
    if (!this.device) return false;
    this.format = getPreferredCanvasFormat();
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.placeholderFeedback = createFeedbackPlaceholder(this.device);
    this.placeholderFeedbackView = this.placeholderFeedback.createView();

    const blitModule = this.device.createShaderModule({ code: BLIT_WGSL });
    this.blitBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
      ]
    });
    this.blitPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.blitBindGroupLayout] }),
      vertex: { module: blitModule, entryPoint: 'vertexMain' },
      fragment: {
        module: blitModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list' }
    });
    return true;
  }

  setPgmLiveModule(moduleId: string, sourceId: string) {
    this.pgmLiveModuleId = moduleId;
    this.pgmLiveSourceId = sourceId;
    const binding = this.bindings.get('pgm');
    if (binding) binding.sourceId = sourceId;
    this.bindingSchedule.delete('pgm');
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setFrameContext(ctx: FrameContext) {
    this.frameCtx = ctx;
  }

  setModuleParams(moduleId: string, params: ModuleRenderParams) {
    const previous = this.renderParams.get(moduleId);
    if (!previous || !sameRenderParams(previous, params)) {
      this.renderParamVersions.set(moduleId, (this.renderParamVersions.get(moduleId) ?? 0) + 1);
    }
    this.renderParams.set(moduleId, params);
  }

  setCanvasActive(canvasId: string, active: boolean): boolean {
    const binding = this.bindings.get(canvasId);
    if (!binding) return false;
    binding.active = active;
    return true;
  }

  /** Update which effect module a stable preview slot renders — no GPU reattach. */
  setCanvasModule(canvasId: string, moduleId: string): boolean {
    // PGM selection is owned exclusively by setPgmLiveModule(). Allowing the
    // viewer's reactive moduleId prop to update this binding created a second,
    // competing render source.
    if (canvasId === 'pgm') return false;
    const binding = this.bindings.get(canvasId);
    if (!binding) return false;
    binding.effectModuleId = moduleId;
    binding.moduleId = moduleId;
    this.bindingSchedule.delete(canvasId);
    return true;
  }

  /** Hot-swap idle/test-card accent when a rack slot's module changes. */
  setCanvasAccent(canvasId: string, color: [number, number, number]): boolean {
    if (canvasId === 'pgm') return false;
    const binding = this.bindings.get(canvasId);
    if (!binding) return false;
    binding.color = color;
    this.bindingSchedule.delete(canvasId);
    return true;
  }

  async attachCanvas(
    id: string,
    canvas: HTMLCanvasElement,
    color: [number, number, number] = [0.2, 0.4, 0.8],
    moduleId?: string
  ): Promise<boolean> {
    // Canvases mount before the engine finishes acquiring the GPU device. This
    // used to return false and never retry, so NO canvas was ever bound and
    // renderAll bailed on an empty binding set — every preview stayed black
    // while video decoded fine. Wait for (or trigger) init instead of dropping.
    if (!this.device) {
      const ok = await this.init();
      if (!ok || !this.device) return false;
    }
    const context = canvas.getContext('webgpu');
    if (!context) return false;

    context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
      // COPY_SRC is what makes the canvas readable back out: without it the
      // swapchain texture is render-only, so toDataURL() and every headless
      // screenshot come back blank/black even while the GPU renders correctly.
      // Acceptance gates cannot produce a PNG of a real frame without this.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    const existing = this.bindings.get(id);
    if (existing) {
      existing.uniformBuffer.destroy();
      existing.feedback.textures[0].destroy();
      existing.feedback.textures[1].destroy();
    }

    const w = canvas.width || 320;
    const h = canvas.height || 180;
    const feedback = createFeedbackPair(this.device, w, h);
    const placeholderFb = this.placeholderFeedbackView!;

    const shaderModule = this.device.createShaderModule({ code: MODULE_FX_WGSL });
    const idleShaderModule = this.device.createShaderModule({ code: MODULE_FX_IDLE_WGSL });
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
      ]
    });
    const idleBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
      ]
    });

    const pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vertexMain' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    const idlePipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [idleBindGroupLayout] }),
      vertex: { module: idleShaderModule, entryPoint: 'vertexMain' },
      fragment: {
        module: idleShaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: { topology: 'triangle-list' }
    });

    const uniformBuffer = this.device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.bindings.set(id, {
      bindingId: id,
      canvas,
      context,
      pipeline,
      idlePipeline,
      blitPipeline: this.blitPipeline!,
      uniformBuffer,
      bindGroup: null as unknown as GPUBindGroup,
      bindGroupLayout,
      idleBindGroupLayout,
      blitBindGroupLayout: this.blitBindGroupLayout!,
      color,
      effectModuleId: moduleId ?? id,
      moduleId: moduleId ?? id,
      sourceId: id,
      feedback,
      placeholderFeedback: this.placeholderFeedback!,
      placeholderFeedbackView: placeholderFb,
      active: true
    });
    this.bindingSchedule.delete(id);

    return true;
  }

  detachCanvas(id: string) {
    const binding = this.bindings.get(id);
    if (binding) {
      binding.uniformBuffer.destroy();
      binding.feedback.textures[0].destroy();
      binding.feedback.textures[1].destroy();
      this.bindings.delete(id);
      this.bindingSchedule.delete(id);
      this.renderDiag.delete(id);
    }
  }

  start() {
    // Compatibility no-op: AppLoop is the sole requestAnimationFrame owner.
  }

  stop() {
    // Compatibility no-op: AppLoop owns lifecycle and cadence.
  }

  renderAll(frame: TimelineFrame) {
    if (this.paused || !this.device || this.bindings.size === 0) return;
    this.frameCtx.timeline = frame;
    const scheduled: Array<[string, CanvasBinding, string, string, string]> = [];

    for (const [id, binding] of this.bindings) {
      // Older injected test bindings predate bindingId; normalize them at the
      // map boundary so diagnostics remain keyed by the stable canvas slot.
      binding.bindingId ||= id;
      let moduleId = binding.effectModuleId ?? binding.moduleId ?? id;
      let sourceId = binding.sourceId ?? id;
      if (id === 'pgm') {
        moduleId = this.pgmLiveModuleId;
        sourceId = this.pgmLiveSourceId;
      }
      const changeKey = this.bindingChangeKey(binding, moduleId, sourceId, frame);
      const skipReason = this.bindingSkipReason(id, binding, frame, changeKey);
      if (skipReason !== 'none') {
        this.recordSkippedBinding(id, moduleId, skipReason);
        continue;
      }
      scheduled.push([id, binding, moduleId, sourceId, changeKey]);
    }

    if (scheduled.length === 0) return;
    const encoder = this.device.createCommandEncoder();
    this.taskExternalTextures = new Map<HTMLVideoElement, GPUExternalTexture>();
    this.videoTextureCache.beginFrame();
    try {
      for (const [id, binding, moduleId, sourceId, changeKey] of scheduled) {
        this.encodeBinding(encoder, binding, binding.color, moduleId, sourceId);
        this.recordRenderedBinding(id, moduleId, frame, changeKey);
      }
    } finally {
      // GPUExternalTexture objects are task-scoped and must never survive this call.
      this.taskExternalTextures = null;
    }
    this.device.queue.submit([encoder.finish()]);
  }

  private bindingChangeKey(
    binding: CanvasBinding,
    moduleId: string,
    sourceId: string,
    frame: TimelineFrame
  ) {
    const video = videoPool.get(sourceId);
    const sourceTime = video && Number.isFinite(video.currentTime)
      ? Math.floor(video.currentTime * this.previewTargetFps)
      : -1;
    return [
      moduleId,
      sourceId,
      this.renderParamVersions.get(moduleId) ?? 0,
      frame.generation,
      frame.fixedStepIndex,
      sourceTime,
      binding.canvas?.width ?? 0,
      binding.canvas?.height ?? 0
    ].join(':');
  }

  private bindingSkipReason(
    id: string,
    binding: CanvasBinding,
    frame: TimelineFrame,
    changeKey: string
  ): WebGpuRenderDiagnostics['skipReason'] {
    if (binding.active === false) return 'inactive';
    if (id === 'pgm') return 'none';
    const state = this.bindingSchedule.get(id);
    if (!state) return 'none';
    const contextTimeSeconds = frame.contextTimeSeconds ?? frame.positionSeconds ?? 0;
    if (contextTimeSeconds + Number.EPSILON < state.nextRenderContextTimeSeconds) return 'cadence';
    if (changeKey === state.lastChangeKey) return 'unchanged';
    return 'none';
  }

  private recordRenderedBinding(
    id: string,
    moduleId: string,
    frame: TimelineFrame,
    changeKey: string
  ) {
    const previous = this.bindingSchedule.get(id);
    const contextTimeSeconds = frame.contextTimeSeconds ?? frame.positionSeconds ?? 0;
    const intervalMs = previous
      ? Math.max(0, (contextTimeSeconds - previous.lastRenderContextTimeSeconds) * 1000)
      : null;
    let nextRenderContextTimeSeconds = contextTimeSeconds + this.previewIntervalSeconds;
    if (previous) {
      nextRenderContextTimeSeconds = previous.nextRenderContextTimeSeconds;
      while (nextRenderContextTimeSeconds <= contextTimeSeconds + Number.EPSILON) {
        nextRenderContextTimeSeconds += this.previewIntervalSeconds;
      }
    }
    const state: BindingScheduleState = {
      lastRenderContextTimeSeconds: contextTimeSeconds,
      nextRenderContextTimeSeconds,
      lastChangeKey: changeKey,
      renderCount: (previous?.renderCount ?? 0) + 1,
      skippedRenderCount: previous?.skippedRenderCount ?? 0,
      lastFrameIntervalMs: intervalMs
    };
    this.bindingSchedule.set(id, state);
    const diag = this.renderDiag.get(id) ?? this.renderDiag.get(moduleId);
    if (!diag) return;
    const scheduledDiag = {
      ...diag,
      bindingId: id,
      renderCount: state.renderCount,
      skippedRenderCount: state.skippedRenderCount,
      targetFps: id === 'pgm' ? 0 : this.previewTargetFps,
      frameIntervalMs: intervalMs,
      lastRenderContextTimeSeconds: contextTimeSeconds,
      renderedThisFrame: true,
      skipReason: 'none' as const
    };
    this.renderDiag.set(id, scheduledDiag);
    // Compatibility for injected test encoders that still publish by effect.
    // Never retain that alias: stable binding IDs are the production truth.
    if (moduleId !== id) this.renderDiag.delete(moduleId);
  }

  private recordSkippedBinding(
    id: string,
    moduleId: string,
    skipReason: Exclude<WebGpuRenderDiagnostics['skipReason'], 'none'>
  ) {
    const state = this.bindingSchedule.get(id);
    if (state) state.skippedRenderCount += 1;
    const previous = this.renderDiag.get(id);
    if (!previous) return;
    const diag = {
      ...previous,
      bindingId: id,
      skippedRenderCount: state?.skippedRenderCount ?? previous.skippedRenderCount,
      renderedThisFrame: false,
      skipReason
    };
    this.renderDiag.set(id, diag);
  }

  private encodeBinding(
    encoder: GPUCommandEncoder,
    binding: CanvasBinding,
    color: [number, number, number],
    moduleId: string,
    sourceId: string
  ) {
    if (!this.device || !this.sampler) return;

    const def = getModuleDef(moduleId);
    const rp = this.renderParams.get(moduleId) ?? {};
    const shaderKey = def?.shaderKey ?? moduleId;
    const effectMode = SHADER_EFFECT_MODE[shaderKey] ?? 0;
    const video = videoPool.get(sourceId);
    const nativeSurface = isTauriRuntime()
      ? binding.bindingId === 'pgm'
        ? tauriNativeSource.getProgramSurface(sourceId) ?? tauriNativeSource.getSurface(sourceId)
        : tauriNativeSource.getSurface(sourceId)
      : null;
    const hasNative = isNativeFrameSurface(nativeSurface) ? 1 : 0;
    const hasVideo = hasNative || (video && videoPool.hasReadyFrame(sourceId) ? 1 : 0);
    const accent = def ? parseAccentColor(def.accentColor) : color;

    const pitch = this.frameCtx.pitchSemitones ?? 0;
    const timeline = this.frameCtx.timeline;
    const data = new Float32Array(32);
    data[0] = timeline?.beatPosition ?? this.frameCtx.beat;
    data[1] = timeline?.beatPhase ?? this.frameCtx.beatPhase;
    data[2] = timeline?.bpm ?? this.frameCtx.bpm;
    data[3] = (timeline?.playing ?? this.frameCtx.playing) ? 1 : 0;
    data[4] = this.frameCtx.amplitude;
    data[5] = this.frameCtx.bassAmp;
    data[6] = (rp.mix ?? 100) / 100;
    data[7] = effectMode;
    data[8] = (rp.p0 ?? 50) / 100;
    data[9] = (rp.p1 ?? 50) / 100;
    data[10] = (rp.p2 ?? 50) / 100;
    data[11] = (rp.p3 ?? 50) / 100;
    data[12] = rp.accent ?? 0;
    data[13] = pitch;
    data[14] = hasVideo;
    data[15] = accent[0];
    data[16] = accent[1];
    data[17] = accent[2];
    data[18] = pitch / 12;
    // every preview and the PGM monitor are 16:9; fall back to that if the
    // canvas has not been laid out yet, so rotations/iris never skew
    const cw = binding.canvas.width || 0;
    const ch = binding.canvas.height || 0;
    data[19] = ch > 0 && cw > 0 ? cw / ch : 16 / 9;
    data[20] = rp.aux1 ?? 1;
    data[21] = rp.aux2 ?? 0;
    if (timeline) writeTimelineUniformData(data, timeline);

    let shaderHasVideo = hasVideo;
    let externalTextureImported = false;
    let externalTextureBound = false;
    let cachedTextureUploaded = false;
    let cachedTextureBound = false;
    const preferPersistentVideoTexture = shouldUsePersistentVideoTexture(moduleId);
    let cachedVideoView = preferPersistentVideoTexture && video
      ? this.videoTextureCache.cachedView(sourceId, video)
      : null;
    if (hasVideo && video && preferPersistentVideoTexture) {
      try {
        cachedVideoView = this.videoTextureCache.upload(this.device, sourceId, video);
        cachedTextureUploaded = true;
      } catch {
        // A seek can invalidate the current external frame between readiness
        // inspection and upload. Preserve the last successfully cached frame.
      }
    }
    data[14] = shaderHasVideo;
    this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);

    const fb = binding.feedback;
    const feedbackAdvance = timeline
      ? advanceFeedbackTo(fb, timeline.generation, timeline.fixedStepIndex)
      : { reset: false, steps: 1, degraded: false, skippedSteps: 0 };
    const readView = !feedbackAdvance.reset
      ? feedbackReadView(fb)
      : binding.placeholderFeedbackView;

    // Per-frame render diagnostics: black previews are ambiguous from the
    // outside (no clip? external import failed? canvas sized 0? feedback stuck
    // at 2x2 and upscaled?). Recording it here makes __BSP_QA__ answer that in
    // one shot instead of a guessing round-trip.
    let bindGroup: GPUBindGroup;
    let pipeline = binding.idlePipeline;
    if (shaderHasVideo && isNativeFrameSurface(nativeSurface)) {
      try {
        const textureKey = binding.bindingId === 'pgm' ? 'pgm' : sourceId;
        const nativeView = this.videoTextureCache.uploadBgra(this.device, textureKey, nativeSurface);
        bindGroup = createIdleBindGroup(
          this.device,
          binding.idleBindGroupLayout,
          binding.uniformBuffer,
          nativeView,
          this.sampler,
          readView
        );
        pipeline = binding.idlePipeline;
        cachedTextureUploaded = true;
        cachedTextureBound = true;
      } catch {
        bindGroup = createIdleBindGroup(
          this.device,
          binding.idleBindGroupLayout,
          binding.uniformBuffer,
          binding.placeholderFeedbackView,
          this.sampler,
          readView
        );
      }
    } else if (shaderHasVideo && video && preferPersistentVideoTexture) {
      shaderHasVideo = cachedVideoView ? 1 : 0;
      data[14] = shaderHasVideo;
      this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);
      bindGroup = createIdleBindGroup(
        this.device,
        binding.idleBindGroupLayout,
        binding.uniformBuffer,
        cachedVideoView ?? binding.placeholderFeedbackView,
        this.sampler,
        readView
      );
      cachedTextureBound = cachedVideoView !== null;
      pipeline = binding.idlePipeline;
    } else if (shaderHasVideo && video) {
      try {
        bindGroup = importAndBindExternalVideo(
          this.device,
          binding.bindGroupLayout,
          binding.uniformBuffer,
          video,
          this.sampler,
          readView,
          this.taskExternalTextures ?? undefined
        ).bindGroup;
        pipeline = binding.pipeline;
        externalTextureImported = true;
        externalTextureBound = true;
      } catch {
        shaderHasVideo = cachedVideoView ? 1 : 0;
        data[14] = shaderHasVideo;
        this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);
        bindGroup = createIdleBindGroup(
          this.device,
          binding.idleBindGroupLayout,
          binding.uniformBuffer,
          cachedVideoView ?? binding.placeholderFeedbackView,
          this.sampler,
          readView
        );
        cachedTextureBound = cachedVideoView !== null;
        if (cachedTextureBound) pipeline = binding.idlePipeline;
      }
    } else if (video && cachedVideoView) {
      shaderHasVideo = 1;
      data[14] = 1;
      this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);
      bindGroup = createIdleBindGroup(
        this.device,
        binding.idleBindGroupLayout,
        binding.uniformBuffer,
        cachedVideoView,
        this.sampler,
        readView
      );
      pipeline = binding.idlePipeline;
      cachedTextureBound = true;
    } else {
      bindGroup = createIdleBindGroup(
        this.device,
        binding.idleBindGroupLayout,
        binding.uniformBuffer,
        binding.placeholderFeedbackView,
        this.sampler,
        readView
      );
    }

    this.renderDiag.set(binding.bindingId ?? moduleId, {
      bindingId: binding.bindingId ?? '',
      effectModuleId: moduleId,
      sourceId,
      canvas: `${binding.canvas.width}x${binding.canvas.height}`,
      cssSize: `${Math.round(binding.canvas.clientWidth)}x${Math.round(binding.canvas.clientHeight)}`,
      effectMode,
      hasVideo: shaderHasVideo,
      externalTextureImported,
      externalTextureBound,
      cachedTextureUploaded,
      cachedTextureBound,
      samplePath: externalTextureBound ? 'external-texture' : cachedTextureBound ? 'cached-video-texture' : 'test-card',
      source: isNativeFrameSurface(nativeSurface)
        ? `native://${sourceId}`
        : video?.currentSrc || video?.src || null,
      dimensions: isNativeFrameSurface(nativeSurface)
        ? `${nativeSurface.width}x${nativeSurface.height}`
        : video ? `${video.videoWidth}x${video.videoHeight}` : null,
      frameId: timeline?.frameId ?? null,
      videoSize: isNativeFrameSurface(nativeSurface)
        ? `${nativeSurface.width}x${nativeSurface.height}`
        : video ? `${video.videoWidth}x${video.videoHeight}` : null,
      feedback: `${binding.feedback.width}x${binding.feedback.height}`,
      mix: data[6],
      timelineFrameId: timeline?.frameId ?? null,
      timelineGeneration: timeline?.generation ?? null,
      fixedStepIndex: timeline?.fixedStepIndex ?? null,
      feedbackDegraded: feedbackAdvance.degraded,
      feedbackSkippedSteps: feedbackAdvance.skippedSteps,
      uniformHash: hashUniformData(data),
      renderCount: 0,
      skippedRenderCount: 0,
      targetFps: 0,
      frameIntervalMs: null,
      lastRenderContextTimeSeconds: timeline?.contextTimeSeconds ?? 0,
      renderedThisFrame: true,
      skipReason: 'none'
    });

    const writeView = feedbackWriteView(fb);

    let blitSource = readView;

    if (feedbackAdvance.steps > 0) {
      const fxPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: writeView,
            clearValue: { r: 0.04, g: 0.05, b: 0.07, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });
      fxPass.setPipeline(pipeline);
      fxPass.setBindGroup(0, bindGroup);
      fxPass.draw(3);
      fxPass.end();
      blitSource = writeView;
      swapFeedback(fb);
    }

    const blitBindGroup = this.device.createBindGroup({
      layout: binding.blitBindGroupLayout,
      entries: [
        { binding: 0, resource: blitSource },
        { binding: 1, resource: this.sampler }
      ]
    });

    const canvasPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: binding.context.getCurrentTexture().createView(),
          clearValue: { r: 0.04, g: 0.05, b: 0.07, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });
    canvasPass.setPipeline(binding.blitPipeline);
    canvasPass.setBindGroup(0, blitBindGroup);
    canvasPass.draw(3);
    canvasPass.end();
  }

  getDevice() {
    return this.device;
  }

  /** Snapshot of what the renderer did on the last frame, per module. */
  getRenderDiagnostics(): Record<string, WebGpuRenderDiagnostics> {
    return Object.fromEntries(this.renderDiag);
  }

  dispose() {
    this.stop();
    for (const id of [...this.bindings.keys()]) {
      this.detachCanvas(id);
    }
    this.device = null;
    this.initPromise = null;
    this.bindingSchedule.clear();
    this.renderDiag.clear();
    this.videoTextureCache.dispose();
  }
}

/** External textures expire after the current JavaScript task. Import and bind
 * together at the render call site; callers must never cache either result. */
export function importAndBindExternalVideo(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  uniformBuffer: GPUBuffer,
  source: HTMLVideoElement,
  sampler: GPUSampler,
  feedbackView: GPUTextureView,
  taskExternalTextures?: Map<HTMLVideoElement, GPUExternalTexture>
) {
  let externalTexture = taskExternalTextures?.get(source);
  if (!externalTexture) {
    externalTexture = device.importExternalTexture({ source });
    taskExternalTextures?.set(source, externalTexture);
  }
  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: externalTexture },
      { binding: 2, resource: sampler },
      { binding: 3, resource: feedbackView },
      { binding: 4, resource: sampler }
    ]
  });
  return { externalTexture, bindGroup };
}

function sameRenderParams(a: ModuleRenderParams, b: ModuleRenderParams) {
  return a.mix === b.mix && a.p0 === b.p0 && a.p1 === b.p1 && a.p2 === b.p2 &&
    a.p3 === b.p3 && a.accent === b.accent && a.aux1 === b.aux1 && a.aux2 === b.aux2;
}

function createIdleBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  uniformBuffer: GPUBuffer,
  placeholderView: GPUTextureView,
  sampler: GPUSampler,
  feedbackView: GPUTextureView
) {
  return device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: placeholderView },
      { binding: 2, resource: sampler },
      { binding: 3, resource: feedbackView },
      { binding: 4, resource: sampler }
    ]
  });
}

export const webGpuEngine = new WebGpuEngine();

export function hashUniformData(data: Float32Array) {
  let hash = 0x811c9dc5;
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function writeTimelineUniformData(data: Float32Array, timeline: TimelineFrame) {
  if (data.length < 30) throw new Error('timeline uniform buffer requires 30 words');
  const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
  data[22] = timeline.positionSeconds;
  data[23] = timeline.fixedStepSeconds;
  words[24] = timeline.fixedStepIndex >>> 0;
  data[25] = timeline.fixedStepPhase;
  data[26] = timeline.playbackRate;
  words[27] = timeline.generation >>> 0;
  words[28] = timeline.deterministicSeed >>> 0;
  words[29] = timeline.audioFrameId >>> 0;
  return data;
}
