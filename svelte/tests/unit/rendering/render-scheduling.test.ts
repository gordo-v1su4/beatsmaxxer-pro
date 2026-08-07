import { describe, expect, test, vi } from 'vitest';
import { WebGpuEngine, type CanvasBinding } from '$lib/rendering/webgpu/WebGpuEngine';
import type { TimelineFrame } from '$lib/transport';
import { WEB_PREVIEW_TARGET_FPS } from '$lib/platform/desktopPerformance';

function frame(contextTimeSeconds: number, fixedStepIndex: number, generation = 1): TimelineFrame {
  return {
    contextTimeSeconds,
    positionSeconds: fixedStepIndex / 60,
    fixedStepIndex,
    generation
  } as TimelineFrame;
}

function binding(moduleId: string, active = true): CanvasBinding {
  return {
    moduleId,
    active,
    color: [0.1, 0.2, 0.3],
    canvas: { width: 320, height: 180 }
  } as CanvasBinding;
}

function scheduledEngine(active = true) {
  const engine = new WebGpuEngine();
  const finish = vi.fn(() => ({} as GPUCommandBuffer));
  const submit = vi.fn();
  const createCommandEncoder = vi.fn(() => ({ finish }));
  const renderDiag = new Map<string, Record<string, unknown>>();
  const encodeBinding = vi.fn((_: unknown, __: unknown, ___: unknown, moduleId: string) => {
    renderDiag.set(moduleId, {});
  });
  const bindings = new Map<string, CanvasBinding>([
    ['pgm', binding('transition', active)],
    ...Array.from({ length: 8 }, (_, index) => [
      `slot-${index}`,
      binding(`module-${index}`, active)
    ] as [string, CanvasBinding])
  ]);
  Object.assign(engine, {
    device: { createCommandEncoder, queue: { submit } },
    bindings,
    renderDiag,
    encodeBinding
  });
  return { engine, encodeBinding, createCommandEncoder, submit, bindings };
}

describe('bounded WebGPU render scheduling', () => {
  test('keeps PGM at display cadence while capping previews at the web budget', () => {
    const { engine, encodeBinding } = scheduledEngine();

    // Drive one second of 60fps display frames. PGM is exempt from the cadence
    // cap and must render on every one; each preview must land on exactly the
    // web budget. Counting over a second rather than asserting a frame pattern
    // keeps this honest if the budget changes.
    const DISPLAY_FPS = 60;
    for (let i = 0; i < DISPLAY_FPS; i++) engine.renderAll(frame(i / DISPLAY_FPS, i));

    const rendered = encodeBinding.mock.calls.map((call) => call[3] as string);
    expect(rendered.filter((id) => id === 'transition')).toHaveLength(DISPLAY_FPS);
    for (let slot = 0; slot < 8; slot++) {
      expect(rendered.filter((id) => id === `module-${slot}`)).toHaveLength(
        WEB_PREVIEW_TARGET_FPS
      );
    }

    const cadence = engine.getRenderDiagnostics()['slot-0'];
    expect(cadence).toMatchObject({ bindingId: 'slot-0', targetFps: WEB_PREVIEW_TARGET_FPS });
    expect(cadence?.renderCount).toBe(WEB_PREVIEW_TARGET_FPS);
    expect(cadence?.frameIntervalMs).toBeCloseTo(1000 / WEB_PREVIEW_TARGET_FPS, 0);
  });

  test('the first frame renders every binding', () => {
    const { engine, encodeBinding, submit } = scheduledEngine();
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).toHaveBeenCalledTimes(9);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test('renders sparse previews only after logical input changes', () => {
    const { engine, encodeBinding } = scheduledEngine();
    engine.renderAll(frame(0, 4));

    encodeBinding.mockClear();
    engine.renderAll(frame(0.1, 4));
    expect(encodeBinding).toHaveBeenCalledTimes(1);

    engine.setModuleParams('module-3', { mix: 75 });
    encodeBinding.mockClear();
    engine.renderAll(frame(0.2, 4));
    expect(encodeBinding).toHaveBeenCalledTimes(2);
    expect(encodeBinding.mock.calls.map((call) => call[3])).toEqual(['transition', 'module-3']);
  });

  test('never encodes inactive bindings and avoids empty command submissions', () => {
    const { engine, encodeBinding, createCommandEncoder, submit, bindings } = scheduledEngine(false);
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).not.toHaveBeenCalled();
    expect(createCommandEncoder).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    bindings.get('pgm')!.active = true;
    engine.renderAll(frame(1 / 60, 1));
    expect(encodeBinding).toHaveBeenCalledOnce();
  });

  test('makes identical scheduling decisions for identical timeline sequences', () => {
    const first = scheduledEngine();
    const second = scheduledEngine();
    const sequence = [frame(0, 0), frame(0.01, 1), frame(0.05, 3), frame(0.1, 6, 2)];

    for (const next of sequence) {
      first.engine.renderAll(next);
      second.engine.renderAll(next);
    }

    expect(first.encodeBinding.mock.calls.map((call) => call[3]))
      .toEqual(second.encodeBinding.mock.calls.map((call) => call[3]));
  });
});
