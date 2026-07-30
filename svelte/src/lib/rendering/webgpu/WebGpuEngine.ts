import { getPreferredCanvasFormat, getSharedWebGpuDevice } from './SharedGpuDevice';
import { TEST_PATTERN_WGSL } from './shaders';

export interface CanvasBinding {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  color: [number, number, number];
}

export class WebGpuEngine {
  private device: GPUDevice | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private bindings = new Map<string, CanvasBinding>();
  private moduleColors = new Map<string, [number, number, number]>();
  private rafId = 0;
  private startTime = performance.now();
  private running = false;
  private onFrame: ((time: number) => void) | null = null;
  private pgmLiveModuleId = 'transition';
  private paused = false;

  async init(): Promise<boolean> {
    this.device = await getSharedWebGpuDevice();
    if (!this.device) return false;
    this.format = getPreferredCanvasFormat();
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

  async attachCanvas(
    id: string,
    canvas: HTMLCanvasElement,
    color: [number, number, number] = [0.2, 0.4, 0.8]
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

    const shaderModule = this.device.createShaderModule({ code: TEST_PATTERN_WGSL });
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
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
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    this.moduleColors.set(id, color);
    this.bindings.set(id, {
      canvas,
      context,
      pipeline,
      uniformBuffer,
      bindGroup,
      color
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

  /** Single encoder + single submit per frame — critical for 8+ canvases @ 1BT RAND. */
  renderAll(time: number) {
    if (!this.device || this.bindings.size === 0) return;
    const encoder = this.device.createCommandEncoder();

    for (const [id, binding] of this.bindings) {
      let color = binding.color;
      if (id === 'pgm') {
        color = this.moduleColors.get(this.pgmLiveModuleId) ?? binding.color;
      }
      this.encodeBinding(encoder, binding, time, color);
    }

    this.device.queue.submit([encoder.finish()]);
  }

  private encodeBinding(
    encoder: GPUCommandEncoder,
    binding: CanvasBinding,
    time: number,
    color: [number, number, number]
  ) {
    if (!this.device) return;
    const data = new Float32Array([time, color[0], color[1], color[2]]);
    this.device.queue.writeBuffer(binding.uniformBuffer, 0, data);

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
    pass.setBindGroup(0, binding.bindGroup);
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
