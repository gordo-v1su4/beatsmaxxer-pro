import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { WebGpuEngine, type CanvasBinding } from '$lib/rendering/webgpu/WebGpuEngine';
import type { FeedbackPair } from '$lib/rendering/webgpu/feedback';
import type { TimelineFrame } from '$lib/transport';
import { videoPool } from '$lib/media/VideoPool';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

type MockFormat = 'rgba8unorm' | 'bgra8unorm';
type MockView = { format: MockFormat; name: string };
type MockPipeline = { targetFormat: MockFormat; name: string };

function timeline(contextTimeSeconds: number): TimelineFrame {
  return {
    frameId: 1,
    audioFrameId: 1,
    contextTimeSeconds,
    transportSeconds: 1,
    positionSeconds: 1,
    beatPosition: 2,
    beatPhase: 0,
    bpm: 120,
    playing: false,
    playbackRate: 1,
    generation: 1,
    deterministicSeed: 1,
    fixedStepSeconds: 1 / 60,
    fixedStepIndex: 60,
    fixedStepPhase: 0
  } as TimelineFrame;
}

function makeBinding(moduleId: string): CanvasBinding {
  const offscreenViews = [
    { format: 'rgba8unorm', name: 'feedback-0' },
    { format: 'rgba8unorm', name: 'feedback-1' }
  ] as unknown as FeedbackPair['views'];
  const feedback = {
    textures: [{ destroy: vi.fn() }, { destroy: vi.fn() }],
    views: offscreenViews,
    ping: 0,
    width: 320,
    height: 180,
    generation: -1,
    fixedStepIndex: -1
  } as unknown as FeedbackPair;
  const canvasView = { format: 'bgra8unorm', name: 'canvas' } as MockView;

  return {
    canvas: { width: 320, height: 180, clientWidth: 320, clientHeight: 180 },
    context: {
      getCurrentTexture: () => ({ createView: () => canvasView })
    },
    pipeline: { targetFormat: 'rgba8unorm', name: 'external-fx' },
    idlePipeline: { targetFormat: 'rgba8unorm', name: 'idle-fx' },
    blitPipeline: { targetFormat: 'bgra8unorm', name: 'canvas-blit' },
    uniformBuffer: {},
    bindGroup: {},
    bindGroupLayout: {},
    idleBindGroupLayout: {},
    blitBindGroupLayout: {},
    color: [0.1, 0.2, 0.3],
    moduleId,
    feedback,
    placeholderFeedback: {},
    placeholderFeedbackView: { format: 'rgba8unorm', name: 'placeholder' },
    active: true
  } as unknown as CanvasBinding;
}

function formatCheckingEngine(id: 'pgm' | 'slot-0') {
  const engine = new WebGpuEngine();
  const binding = makeBinding('transition');
  const submittedPasses: Array<Array<{ attachment: MockView; pipeline: MockPipeline }>> = [];

  const device = {
    createBindGroup: () => ({}),
    importExternalTexture: () => ({}),
    createTexture: () => ({ createView: () => ({ format: 'rgba8unorm', name: 'video' }), destroy: vi.fn() }),
    createCommandEncoder: () => {
      const passes: Array<{ attachment: MockView; pipeline: MockPipeline }> = [];
      return {
        beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
          const attachment = descriptor.colorAttachments[0]!.view as unknown as MockView;
          return {
            setPipeline(pipeline: GPURenderPipeline) {
              const mockPipeline = pipeline as unknown as MockPipeline;
              if (attachment.format !== mockPipeline.targetFormat) {
                throw new Error(
                  `RenderPass ${attachment.format} is incompatible with RenderPipeline ${mockPipeline.targetFormat}`
                );
              }
              passes.push({ attachment, pipeline: mockPipeline });
            },
            setBindGroup: vi.fn(),
            draw: vi.fn(),
            end: vi.fn()
          };
        },
        finish: () => {
          submittedPasses.push(passes);
          return {};
        }
      };
    },
    queue: { writeBuffer: vi.fn(), submit: vi.fn(), copyExternalImageToTexture: vi.fn() }
  };

  Object.assign(engine, {
    device,
    sampler: {},
    bindings: new Map([[id, binding]])
  });
  return { engine, submittedPasses };
}

describe.each([
  ['PGM', 'pgm'],
  ['rack preview', 'slot-0']
] as const)('WebGPU format compatibility for %s', (_label, id) => {
  test('blits the existing RGBA feedback texture on a duplicate fixed step', () => {
    const { engine, submittedPasses } = formatCheckingEngine(id);

    engine.renderAll(timeline(1));
    if (id !== 'pgm') engine.setModuleParams('transition', { mix: 75 });

    expect(() => engine.renderAll(timeline(1.1))).not.toThrow();
    const blit = {
      attachment: expect.objectContaining({ format: 'bgra8unorm', name: 'canvas' }),
      pipeline: expect.objectContaining({ targetFormat: 'bgra8unorm', name: 'canvas-blit' })
    };
    // A stopped PGM with no changed input submits no duplicate GPU work. The
    // preview's params changed, so it re-runs the effect into the RGBA feedback
    // target before blitting — a stopped transport must not hold stale input.
    expect(submittedPasses[1]).toEqual(
      id === 'pgm'
        ? undefined
        : [
            {
              attachment: expect.objectContaining({ format: 'rgba8unorm' }),
              pipeline: expect.objectContaining({ targetFormat: 'rgba8unorm' })
            },
            blit
          ]
    );
  });
});

test('a decoded paused preview reruns its effect before blitting, then stays idle', () => {
  vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 });
  const { engine, submittedPasses } = formatCheckingEngine('slot-0');
  const video = Object.assign(new EventTarget(), {
    readyState: 1, videoWidth: 0, videoHeight: 0, currentTime: 0,
    duration: 10, seeking: false, paused: true, src: 'first.mp4', currentSrc: 'first.mp4'
  });
  vi.spyOn(videoPool, 'get').mockImplementation(id => id === 'slot-0' ? video as HTMLVideoElement : undefined);
  vi.spyOn(videoPool, 'hasReadyFrame').mockImplementation(id => id === 'slot-0' && video.readyState >= 2 && video.videoWidth > 0);
  engine.renderAll(timeline(0));
  expect(engine.getRenderDiagnostics()['slot-0'].hasVideo).toBe(0);

  Object.assign(video, { readyState: 4, videoWidth: 1280, videoHeight: 720 });
  engine.renderAll(timeline(0));
  expect(submittedPasses).toHaveLength(2);
  expect(submittedPasses[1].map(pass => pass.pipeline.name)).toEqual(['external-fx', 'canvas-blit']);
  expect(engine.getRenderDiagnostics()['slot-0']).toMatchObject({ hasVideo: 1, externalTextureBound: true });

  engine.renderAll(timeline(0));
  expect(submittedPasses).toHaveLength(2);
});

test('source only binds the canvas-format blit pipeline to the canvas render pass', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/rendering/webgpu/WebGpuEngine.ts'), 'utf8');
  const canvasPassIndex = source.indexOf('const canvasPass = encoder.beginRenderPass');
  expect(canvasPassIndex).toBeGreaterThan(-1);
  const mainCanvasBlit = source.slice(canvasPassIndex, canvasPassIndex + 500);
  expect(mainCanvasBlit).toContain('binding.context.getCurrentTexture().createView()');
  expect(mainCanvasBlit).toContain('canvasPass.setPipeline(binding.blitPipeline)');
  expect(mainCanvasBlit).not.toContain('fxPass.setPipeline(pipeline)');
});
