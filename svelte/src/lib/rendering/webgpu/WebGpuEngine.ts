import { getPreferredCanvasFormat, getSharedWebGpuDevice } from './SharedGpuDevice';
import { MODULE_FX_WGSL, SHADER_EFFECT_MODE } from './shaders/moduleFx.wgsl';
import { BLIT_WGSL, createFeedbackPair, createFeedbackPlaceholder, feedbackReadView, feedbackWriteView, swapFeedback, type FeedbackPair } from './feedback';
import { getModuleDef } from '$lib/modules/catalog';
import { parseAccentColor } from '$lib/modules/registry';
import { videoPool } from '$lib/media/VideoPool';
import { VideoTextureCache } from './VideoTextureCache';

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
}

export interface CanvasBinding {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  blitPipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  blitBindGroupLayout: GPUBindGroupLayout;
  color: [number, number, number];
  moduleId: string;
  feedback: FeedbackPair | null;
  placeholderFeedback: GPUTexture;
  placeholderFeedbackView: GPUTextureView;
}

export class WebGpuEngine {
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private bindings = new Map<string, CanvasBinding>();
  private moduleColors = new Map<string, [number, number, number]>();
  private renderDiag = new Map<string, Record<string, unknown>>();
  private renderParams = new Map<string, ModuleRenderParams>();
  private rafId = 0;
  private startTime = performance.now();
  private running = false;
  private onFrame: ((time: number) => void) | null = null;
  private pgmLiveModuleId = 'transition';
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
  private videoTextures = new VideoTextureCache();
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

  setFrameCallback(cb: (time: number) => void) {
    this.onFrame = cb;
  }

  setPgmLiveModule(moduleId: string) {
    this.pgmLiveModuleId = moduleId;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setFrameContext(ctx: FrameContext) {
    this.frameCtx = ctx;
  }

  setModuleParams(moduleId: string, params: ModuleRenderParams) {
    this.renderParams.set(moduleId, params);
  }

  /** Update which effect module a stable canvas slot renders — no GPU reattach. */
  setCanvasModule(canvasId: string, moduleId: string) {
    const binding = this.bindings.get(canvasId);
    if (binding) binding.moduleId = moduleId;
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
      existing.feedback?.textures[0].destroy();
      existing.feedback?.textures[1].destroy();
    }

    const w = canvas.width || 320;
    const h = canvas.height || 180;
    const feedback = createFeedbackPair(this.device, w, h);
    const placeholderFb = this.placeholderFeedbackView!;

    const shaderModule = this.device.createShaderModule({ code: MODULE_FX_WGSL });
    const bindGroupLayout = this.device.createBindGroupLayout({
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

    const uniformBuffer = this.device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.moduleColors.set(id, color);
    this.bindings.set(id, {
      canvas,
      context,
      pipeline,
      blitPipeline: this.blitPipeline!,
      uniformBuffer,
      bindGroup: null as unknown as GPUBindGroup,
      bindGroupLayout,
      blitBindGroupLayout: this.blitBindGroupLayout!,
      color,
      moduleId: moduleId ?? id,
      feedback,
      placeholderFeedback: this.placeholderFeedback!,
      placeholderFeedbackView: placeholderFb
    });

    return true;
  }

  detachCanvas(id: string) {
    const binding = this.bindings.get(id);
    if (binding) {
      binding.uniformBuffer.destroy();
      binding.feedback?.textures[0].destroy();
      binding.feedback?.textures[1].destroy();
      this.bindings.delete(id);
      this.moduleColors.delete(id);
    }
  }

  start() {
    if (this.running || typeof requestAnimationFrame !== 'function') return;
    this.running = true;
    this.startTime = performance.now();
    const tick = () => {
      if (!this.running) return;
      const t = (performance.now() - this.startTime) / 1000;
      if (!this.paused) this.renderAll(t);
      this.onFrame?.(t);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
  }

  renderAll(time: number) {
    if (!this.device || this.bindings.size === 0) return;
    this.videoTextures.beginFrame();
    const encoder = this.device.createCommandEncoder();

    for (const [id, binding] of this.bindings) {
      let color = binding.color;
      let moduleId = binding.moduleId;
      if (id === 'pgm') {
        moduleId = this.pgmLiveModuleId;
        color = this.moduleColors.get(this.pgmLiveModuleId) ?? binding.color;
      }
      this.encodeBinding(encoder, binding, color, moduleId);
    }

    this.device.queue.submit([encoder.finish()]);
  }

  private encodeBinding(
    encoder: GPUCommandEncoder,
    binding: CanvasBinding,
    color: [number, number, number],
    moduleId: string
  ) {
    if (!this.device || !this.sampler) return;

    const def = getModuleDef(moduleId);
    const rp = this.renderParams.get(moduleId) ?? {};
    const shaderKey = def?.shaderKey ?? moduleId;
    const effectMode = SHADER_EFFECT_MODE[shaderKey] ?? 0;
    const video = videoPool.get(moduleId);
    const hasVideo = video && videoPool.hasReadyFrame(moduleId) ? 1 : 0;
    const accent = def ? parseAccentColor(def.accentColor) : color;

    const pitch = this.frameCtx.pitchSemitones ?? 0;
    const data = new Float32Array(22);
    data[0] = this.frameCtx.beat;
    data[1] = this.frameCtx.beatPhase;
    data[2] = this.frameCtx.bpm;
    data[3] = this.frameCtx.playing ? 1 : 0;
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

    // A clip that is mid-seek briefly reports not-ready. Falling back to the
    // test card for those frames flashed SMPTE bars and white between every
    // timesampler cut and dropped black frames in speedramp. Once a clip is
    // attached, hold the last uploaded frame instead of showing the card.
    const cached = this.videoTextures.cachedView(moduleId);
    let shaderHasVideo = video ? 1 : 0;
    let videoTextureView =
      cached ?? this.videoTextures.ensurePlaceholder(this.device);
    if (hasVideo && video) {
      try {
        videoTextureView = this.videoTextures.upload(this.device, moduleId, video);
      } catch {
        // keep the previous frame; only fall back to the card if we never had one
        if (!cached) {
          shaderHasVideo = 0;
          videoTextureView = this.videoTextures.ensurePlaceholder(this.device);
        }
      }
    } else if (!video || !cached) {
      shaderHasVideo = 0;
      videoTextureView = this.videoTextures.ensurePlaceholder(this.device);
    }
    data[14] = shaderHasVideo;
    this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);

    // Per-frame render diagnostics: black previews are ambiguous from the
    // outside (no clip? texture upload failed? canvas sized 0? feedback stuck
    // at 2x2 and upscaled?). Recording it here makes __BSP_QA__ answer that in
    // one shot instead of a guessing round-trip.
    this.renderDiag.set(moduleId, {
      canvas: `${binding.canvas.width}x${binding.canvas.height}`,
      cssSize: `${Math.round(binding.canvas.clientWidth)}x${Math.round(binding.canvas.clientHeight)}`,
      effectMode,
      hasVideo: shaderHasVideo,
      videoUploaded: shaderHasVideo === 1 && hasVideo === 1,
      videoSize: video ? `${video.videoWidth}x${video.videoHeight}` : null,
      feedback: binding.feedback
        ? `${binding.feedback.width ?? '?'}x${binding.feedback.height ?? '?'}`
        : 'none(direct-to-canvas)',
      mix: data[6]
    });

    const fb = binding.feedback;
    const readView = fb ? feedbackReadView(fb) : binding.placeholderFeedbackView;
    const writeView = fb ? feedbackWriteView(fb) : null;

    const bindGroup = this.device.createBindGroup({
      layout: binding.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: binding.uniformBuffer } },
        { binding: 1, resource: videoTextureView },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: readView },
        { binding: 4, resource: this.sampler }
      ]
    });

    let blitSource = readView;

    if (writeView && fb) {
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
      fxPass.setPipeline(binding.pipeline);
      fxPass.setBindGroup(0, bindGroup);
      fxPass.draw(3);
      fxPass.end();
      blitSource = writeView;
      swapFeedback(fb);
    } else {
      const fxPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: binding.context.getCurrentTexture().createView(),
            clearValue: { r: 0.04, g: 0.05, b: 0.07, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });
      fxPass.setPipeline(binding.pipeline);
      fxPass.setBindGroup(0, bindGroup);
      fxPass.draw(3);
      fxPass.end();
      return;
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
  getRenderDiagnostics() {
    return Object.fromEntries(this.renderDiag);
  }

  dispose() {
    this.stop();
    for (const id of [...this.bindings.keys()]) {
      this.detachCanvas(id);
    }
    this.videoTextures.dispose();
    this.device = null;
  }
}

export const webGpuEngine = new WebGpuEngine();
