import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { WebGpuEngine, type CanvasBinding } from '$lib/rendering/webgpu/WebGpuEngine';
import type { FeedbackPair } from '$lib/rendering/webgpu/feedback';
import type { TimelineFrame } from '$lib/transport';

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
    queue: { writeBuffer: vi.fn(), submit: vi.fn() }
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
    expect(submittedPasses[1]).toEqual([
      {
        attachment: expect.objectContaining({ format: 'bgra8unorm', name: 'canvas' }),
        pipeline: expect.objectContaining({ targetFormat: 'bgra8unorm', name: 'canvas-blit' })
      }
    ]);
  });
});

test('source only binds the canvas-format blit pipeline to the canvas render pass', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/rendering/webgpu/WebGpuEngine.ts'), 'utf8');
  const canvasView = 'binding.context.getCurrentTexture().createView()';
  const canvasViewIndex = source.indexOf(canvasView);

  expect(canvasViewIndex).toBeGreaterThan(-1);
  expect(source.indexOf(canvasView, canvasViewIndex + canvasView.length)).toBe(-1);
  expect(source.slice(canvasViewIndex, canvasViewIndex + 500)).toContain(
    'canvasPass.setPipeline(binding.blitPipeline)'
  );
  expect(source.slice(canvasViewIndex, canvasViewIndex + 500)).not.toContain(
    'fxPass.setPipeline(pipeline)'
  );
});
