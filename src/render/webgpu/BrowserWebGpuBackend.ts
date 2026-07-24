import type { DecodedFrameLike } from "../../media/types";
import type { RenderFrameRequest } from "../contracts";
import type {
  LinearTextureDescriptor,
  WebGpuBackend,
} from "./GpuCompositor";
import {
  EXTERNAL_TEXTURE_INGEST_WGSL,
  TIMESAMPLER_COMPOSITE_WGSL,
} from "./shaders";

interface BrowserGpu {
  requestAdapter(): Promise<{
    requestDevice(): Promise<BrowserGpuDevice>;
  } | null>;
  getPreferredCanvasFormat(): string;
}

interface BrowserGpuDevice {
  readonly queue: {
    submit(commands: unknown[]): void;
    writeBuffer(
      buffer: unknown,
      offset: number,
      data: ArrayBufferView,
    ): void;
  };
  readonly lost: Promise<{ message?: string }>;
  importExternalTexture(descriptor: {
    source: unknown;
    colorSpace: "srgb";
  }): unknown;
  createTexture(descriptor: object): {
    createView(): unknown;
    destroy(): void;
  };
  createShaderModule(descriptor: object): unknown;
  createRenderPipeline(descriptor: object): {
    getBindGroupLayout(index: number): unknown;
  };
  createSampler(descriptor: object): unknown;
  createBuffer(descriptor: object): unknown;
  createBindGroup(descriptor: object): unknown;
  createCommandEncoder(): {
    beginRenderPass(descriptor: object): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, bindGroup: unknown): void;
      draw(vertexCount: number): void;
      end(): void;
    };
    finish(): unknown;
  };
  destroy?(): void;
}

interface BrowserGpuCanvasContext {
  configure(descriptor: object): void;
  getCurrentTexture(): { createView(): unknown };
}

const GPU_TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const GPU_TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const GPU_BUFFER_USAGE_UNIFORM = 0x40;
const GPU_BUFFER_USAGE_COPY_DST = 0x08;

function accentMode(request: RenderFrameRequest) {
  if (request.effect !== "timesampler" || request.accentMode === "OFF") {
    return 2;
  }
  return request.accentMode === "LUM" ? 0 : 1;
}

export class BrowserWebGpuBackend<
  Frame extends DecodedFrameLike,
> implements WebGpuBackend<Frame> {
  private readonly ingestPipeline: ReturnType<
    BrowserGpuDevice["createRenderPipeline"]
  >;
  private readonly compositePipeline: ReturnType<
    BrowserGpuDevice["createRenderPipeline"]
  >;
  private readonly sampler: unknown;
  private readonly uniformBuffer: unknown;
  private commandEncoder: ReturnType<
    BrowserGpuDevice["createCommandEncoder"]
  > | null = null;
  private lostState = false;
  private readonly lossListeners = new Set<(reason: string) => void>();

  private constructor(
    private readonly device: BrowserGpuDevice,
    private readonly context: BrowserGpuCanvasContext,
    canvasFormat: string,
  ) {
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: "opaque",
      colorSpace: "srgb",
    });
    this.ingestPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          code: EXTERNAL_TEXTURE_INGEST_WGSL,
        }),
        entryPoint: "vertexMain",
      },
      fragment: {
        module: device.createShaderModule({
          code: EXTERNAL_TEXTURE_INGEST_WGSL,
        }),
        entryPoint: "fragmentMain",
        targets: [{ format: "rgba16float" }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.compositePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          code: TIMESAMPLER_COMPOSITE_WGSL,
        }),
        entryPoint: "vertexMain",
      },
      fragment: {
        module: device.createShaderModule({
          code: TIMESAMPLER_COMPOSITE_WGSL,
        }),
        entryPoint: "fragmentMain",
        targets: [{ format: canvasFormat }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
    });
    this.uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
    });
    void device.lost.then((info) => {
      this.lostState = true;
      const reason = info.message || "webgpu-device-lost";
      for (const listener of this.lossListeners) listener(reason);
    });
  }

  static async create<Frame extends DecodedFrameLike>(
    canvas: HTMLCanvasElement,
  ) {
    if (!globalThis.isSecureContext) {
      throw new DOMException(
        "WebGPU requires a secure context",
        "SecurityError",
      );
    }
    const gpu = (
      navigator as unknown as { gpu?: BrowserGpu }
    ).gpu;
    if (!gpu) throw new Error("webgpu-unavailable");
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error("webgpu-adapter-unavailable");
    const device = await adapter.requestDevice();
    const context = canvas.getContext(
      "webgpu" as "2d",
    ) as unknown as BrowserGpuCanvasContext | null;
    if (!context) throw new Error("webgpu-context-unavailable");
    return new BrowserWebGpuBackend<Frame>(
      device,
      context,
      gpu.getPreferredCanvasFormat(),
    );
  }

  get lost() {
    return this.lostState;
  }

  importExternalTexture(frame: Frame, colorSpace: "srgb") {
    return this.device.importExternalTexture({
      source: frame,
      colorSpace,
    });
  }

  createLinearTexture(descriptor: LinearTextureDescriptor) {
    return this.device.createTexture({
      size: [descriptor.width, descriptor.height, 1],
      format: descriptor.format,
      usage:
        GPU_TEXTURE_USAGE_TEXTURE_BINDING |
        GPU_TEXTURE_USAGE_RENDER_ATTACHMENT,
      label: descriptor.colorSpace,
    });
  }

  destroyTexture(texture: unknown) {
    (texture as { destroy(): void }).destroy();
  }

  encodeExternalToLinear(
    externalTexture: unknown,
    linearTexture: unknown,
  ) {
    const encoder = this.device.createCommandEncoder();
    const bindGroup = this.device.createBindGroup({
      layout: this.ingestPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: externalTexture }],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: (linearTexture as { createView(): unknown }).createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(this.ingestPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.commandEncoder = encoder;
  }

  encodeComposition(
    linearTexture: unknown,
    request: RenderFrameRequest,
  ) {
    if (!this.commandEncoder) {
      throw new Error("webgpu-ingest-pass-required");
    }
    const uniforms = new Float32Array([
      accentMode(request),
      request.accentEnvelope,
      request.rgbOffset,
      request.mix,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
    const bindGroup = this.device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: (linearTexture as {
            createView(): unknown;
          }).createView(),
        },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const pass = this.commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(this.compositePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  submit() {
    if (!this.commandEncoder) {
      throw new Error("webgpu-command-buffer-empty");
    }
    this.device.queue.submit([this.commandEncoder.finish()]);
    this.commandEncoder = null;
  }

  onDeviceLost(callback: (reason: string) => void) {
    this.lossListeners.add(callback);
    return () => this.lossListeners.delete(callback);
  }

  dispose() {
    this.commandEncoder = null;
    this.lossListeners.clear();
    this.device.destroy?.();
  }
}
