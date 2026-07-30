import { getPreferredCanvasFormat, getSharedWebGpuDevice } from './SharedGpuDevice';
import { MODULE_FX_WGSL, SHADER_EFFECT_MODE } from './shaders/moduleFx.wgsl';
import { getModuleDef } from '$lib/modules/catalog';
import { parseAccentColor } from '$lib/modules/registry';
import { videoPool } from '$lib/media/VideoPool';

export interface ModuleRenderParams {
  mix?: number;
  p0?: number;
  p1?: number;
  p2?: number;
  p3?: number;
  accent?: number;
}

export interface FrameContext {
  beat: number;
  beatPhase: number;
  bpm: number;
  playing: boolean;
  amplitude: number;
  bassAmp: number;
}

export interface CanvasBinding {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  color: [number, number, number];
  moduleId: string;
}

export class WebGpuEngine {
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private bindings = new Map<string, CanvasBinding>();
  private moduleColors = new Map<string, [number, number, number]>();
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
  private placeholderVideo: HTMLVideoElement | null = null;
  private sampler: GPUSampler | null = null;

  private ensurePlaceholderVideo(): HTMLVideoElement {
    if (this.placeholderVideo) return this.placeholderVideo;
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 2, 2);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.srcObject = canvas.captureStream(1);
    void video.play();
    video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(video);
    this.placeholderVideo = video;
    return video;
  }

  async init(): Promise<boolean> {
    this.device = await getSharedWebGpuDevice();
    if (!this.device) return false;
    this.format = getPreferredCanvasFormat();
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
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
    if (!this.device) return false;
    const context = canvas.getContext('webgpu');
    if (!context) return false;

    context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque'
    });

    const existing = this.bindings.get(id);
    if (existing) {
      existing.uniformBuffer.destroy();
    }

    const shaderModule = this.device.createShaderModule({ code: MODULE_FX_WGSL });
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
      ]
    });

    const pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vertexMain' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list' }
    });

    const uniformBuffer = this.device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        {
          binding: 1,
          resource: this.device.importExternalTexture({
            source: this.ensurePlaceholderVideo()
          })
        },
        { binding: 2, resource: sampler }
      ]
    });

    this.moduleColors.set(id, color);
    this.bindings.set(id, {
      canvas,
      context,
      pipeline,
      uniformBuffer,
      bindGroup,
      bindGroupLayout,
      color,
      moduleId: moduleId ?? id
    });

    return true;
  }

  detachCanvas(id: string) {
    const binding = this.bindings.get(id);
    if (binding) {
      binding.uniformBuffer.destroy();
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

    const data = new Float32Array(18);
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
    data[13] = hasVideo;
    data[14] = accent[0];
    data[15] = accent[1];
    data[16] = accent[2];
    data[17] = 0;

    this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);

    const sourceVideo = hasVideo && video ? video : this.ensurePlaceholderVideo();
    const externalTexture = this.device.importExternalTexture({ source: sourceVideo });

    const bindGroup = this.device.createBindGroup({
      layout: binding.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: binding.uniformBuffer } },
        { binding: 1, resource: externalTexture },
        { binding: 2, resource: this.sampler }
      ]
    });

    const textureView = binding.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.04, g: 0.05, b: 0.07, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });
    pass.setPipeline(binding.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  getDevice() {
    return this.device;
  }

  dispose() {
    this.stop();
    for (const id of [...this.bindings.keys()]) {
      this.detachCanvas(id);
    }
    this.device = null;
  }
}

export const webGpuEngine = new WebGpuEngine();
