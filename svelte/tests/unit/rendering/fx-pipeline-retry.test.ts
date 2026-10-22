import { afterEach, expect, test, vi } from 'vitest';
import { WebGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { detectFxCapabilities } from '$lib/rendering/webgpu/FxCapabilities';
import { ModePipelineCache } from '$lib/rendering/webgpu/ModePipelineCache';

vi.mock('$lib/rendering/webgpu/FxCapabilities', () => ({ detectFxCapabilities: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('GPUShaderStage', { FRAGMENT: 2 });
  const device = { createBindGroupLayout: vi.fn(() => ({})) } as unknown as GPUDevice;
  const engine = new WebGpuEngine();
  Object.assign(engine, { device });
  const internals = engine as unknown as {
    ensureModulePipelines(device: GPUDevice): Promise<void>;
    handleDeviceLost(): void;
    modePipelinesPromise: Promise<void> | null;
    modePipelines: ModePipelineCache | null;
  };
  vi.mocked(detectFxCapabilities).mockReset().mockResolvedValue({ immediates: false, sharedTextures: false });
  vi.spyOn(ModePipelineCache.prototype, 'warmAll').mockResolvedValue();
  vi.spyOn(ModePipelineCache.prototype, 'isReady').mockReturnValue(true);
  vi.spyOn(ModePipelineCache.prototype, 'get').mockReturnValue({} as GPURenderPipeline);
  return { device, engine, internals };
}

test('a mounted canvas receives false rather than an unhandled setup rejection', async () => {
  const { engine, internals } = setup();
  vi.mocked(detectFxCapabilities).mockRejectedValueOnce(new Error('transient probe failure'));
  await expect(engine.attachCanvas('preview', {} as HTMLCanvasElement)).resolves.toBe(false);
  expect(internals.modePipelinesPromise).toBeNull();
});

test('a rejected capability probe clears its memo so the next attach can retry', async () => {
  const { device, internals } = setup();
  vi.mocked(detectFxCapabilities).mockRejectedValueOnce(new Error('probe failed'));
  await expect(internals.ensureModulePipelines(device)).resolves.toBeUndefined();
  expect(internals.modePipelinesPromise).toBeNull();
  await expect(internals.ensureModulePipelines(device)).resolves.toBeUndefined();
  expect(detectFxCapabilities).toHaveBeenCalledTimes(2);
});

test('a rejected warmup disposes the failed cache and permits a fresh attempt', async () => {
  const { device, internals } = setup();
  const dispose = vi.spyOn(ModePipelineCache.prototype, 'dispose');
  vi.mocked(ModePipelineCache.prototype.warmAll).mockRejectedValueOnce(new Error('warmup failed'));
  await expect(internals.ensureModulePipelines(device)).resolves.toBeUndefined();
  expect(dispose).toHaveBeenCalledOnce();
  expect(internals.modePipelines).toBeNull();
  await expect(internals.ensureModulePipelines(device)).resolves.toBeUndefined();
});

test('an old probe rejection cannot clear a replacement device setup', async () => {
  const { device, internals } = setup();
  let rejectOld!: (error: Error) => void;
  vi.mocked(detectFxCapabilities).mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
  const oldAttempt = internals.ensureModulePipelines(device);
  internals.handleDeviceLost();
  const replacement = { createBindGroupLayout: vi.fn(() => ({})) } as unknown as GPUDevice;
  Object.assign(internals, { device: replacement });
  const newAttempt = internals.ensureModulePipelines(replacement);
  await newAttempt;
  const newCache = internals.modePipelines;
  rejectOld(new Error('old device'));
  await expect(oldAttempt).resolves.toBeUndefined();
  expect(internals.modePipelines).toBe(newCache);
  expect(internals.modePipelinesPromise).toBe(newAttempt);
});
