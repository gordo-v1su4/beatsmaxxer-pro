import { afterEach, describe, expect, test, vi } from 'vitest';
import { WebGpuEngine, type CanvasBinding } from '$lib/rendering/webgpu/WebGpuEngine';
import type { TimelineFrame } from '$lib/transport';
import { WEB_PREVIEW_TARGET_FPS } from '$lib/platform/desktopPerformance';
import { videoPool } from '$lib/media/VideoPool';

afterEach(() => vi.restoreAllMocks());

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
  const encodeBinding = vi.fn(
    (_: unknown, __: unknown, ___: unknown, moduleId: string, _sourceId?: string, _force?: boolean) => {
      renderDiag.set(moduleId, {});
    }
  );
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
  test('caps PGM and previews at the 24 fps output cadence', () => {
    const { engine, encodeBinding } = scheduledEngine();

    // Drive one second of 60fps display frames. PGM and previews share the
    // 24fps output cadence: running the full-resolution program effect at the
    // display refresh rate only repeats source frames and can starve decoding.
    // Counting over a second keeps this honest if the budget changes.
    const DISPLAY_FPS = 60;
    for (let i = 0; i < DISPLAY_FPS; i++) engine.renderAll(frame(i / DISPLAY_FPS, i));

    const rendered = encodeBinding.mock.calls.map((call) => call[3] as string);
    expect(rendered.filter((id) => id === 'transition')).toHaveLength(
      WEB_PREVIEW_TARGET_FPS
    );
    for (let slot = 0; slot < 8; slot++) {
      expect(rendered.filter((id) => id === `module-${slot}`)).toHaveLength(
        WEB_PREVIEW_TARGET_FPS
      );
    }

    const cadence = engine.getRenderDiagnostics()['slot-0'];
    expect(cadence).toMatchObject({ bindingId: 'slot-0', targetFps: WEB_PREVIEW_TARGET_FPS });
    expect(cadence?.renderCount).toBe(WEB_PREVIEW_TARGET_FPS);
    expect(cadence?.frameIntervalMs).toBeGreaterThanOrEqual(1000 / WEB_PREVIEW_TARGET_FPS);
    expect(cadence?.frameIntervalMs).toBeLessThanOrEqual(
      1000 / WEB_PREVIEW_TARGET_FPS + 1000 / DISPLAY_FPS
    );
    expect(engine.getRenderDiagnostics().pgm).toMatchObject({
      bindingId: 'pgm',
      targetFps: WEB_PREVIEW_TARGET_FPS,
      renderCount: WEB_PREVIEW_TARGET_FPS
    });
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
    expect(encodeBinding).not.toHaveBeenCalled();

    engine.setModuleParams('module-3', { mix: 75 });
    encodeBinding.mockClear();
    engine.renderAll(frame(0.2, 4));
    expect(encodeBinding).toHaveBeenCalledOnce();
    expect(encodeBinding.mock.calls.map((call) => call[3])).toEqual(['module-3']);
  });

  test('renders a PGM cut immediately even inside the cadence interval', () => {
    const { engine, encodeBinding } = scheduledEngine();
    engine.renderAll(frame(0, 0));

    encodeBinding.mockClear();
    engine.setPgmLiveModule('module-4', 'slot-4');
    engine.renderAll(frame(0.01, 1));

    expect(encodeBinding.mock.calls.map((call) => [call[3], call[4]])).toContainEqual([
      'module-4',
      'slot-4'
    ]);
  });

  test('repaints a stopped preview, effect pass forced, once its effect pipeline lands', () => {
    const { engine, encodeBinding } = scheduledEngine();
    let ready = false;
    Object.assign(engine, { modePipelines: { isReady: () => ready } });

    // Transport stopped: context time and fixed step never advance, so the
    // cadence gate alone would hold the dry-fallback frame forever.
    engine.renderAll(frame(0, 0));
    engine.renderAll(frame(0, 0));
    encodeBinding.mockClear();
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).not.toHaveBeenCalled();

    ready = true;
    encodeBinding.mockClear();
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).toHaveBeenCalledTimes(9);
    expect(encodeBinding.mock.calls.every((call) => call[5] === true)).toBe(true);

    encodeBinding.mockClear();
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).not.toHaveBeenCalled();
  });

  test('repaints a newly decoded stopped source once without a clock or parameter change', () => {
    const { engine, encodeBinding } = scheduledEngine();
    const video = { currentTime: 0, seeking: false, readyState: 1, videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    vi.spyOn(videoPool, 'get').mockImplementation(id => id === 'slot-0' ? video : undefined);
    vi.spyOn(videoPool, 'hasReadyFrame').mockImplementation(id => id === 'slot-0' && video.readyState >= 2 && video.videoWidth > 0);
    engine.renderAll(frame(0, 0));
    encodeBinding.mockClear();

    Object.assign(video, { readyState: 4, videoWidth: 1280, videoHeight: 720 });
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).toHaveBeenCalledOnce();
    expect(encodeBinding.mock.calls[0].slice(3)).toEqual(['module-0', 'slot-0', true]);

    encodeBinding.mockClear();
    for (let i = 0; i < 10; i++) engine.renderAll(frame(0, 0));
    expect(encodeBinding).not.toHaveBeenCalled();
  });

  test('repaints an equally ready replacement in the same stopped slot once', () => {
    const { engine, encodeBinding } = scheduledEngine();
    let video = { currentTime: 0, seeking: false, readyState: 4, videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
    vi.spyOn(videoPool, 'get').mockImplementation(id => id === 'slot-0' ? video : undefined);
    vi.spyOn(videoPool, 'hasReadyFrame').mockImplementation(id => id === 'slot-0');
    engine.renderAll(frame(0, 0));
    encodeBinding.mockClear();

    video = { ...video };
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).toHaveBeenCalledOnce();
    expect(encodeBinding.mock.calls[0].slice(3)).toEqual(['module-0', 'slot-0', true]);

    encodeBinding.mockClear();
    engine.renderAll(frame(0, 0));
    expect(encodeBinding).not.toHaveBeenCalled();
  });

  test('keeps the playback cadence cap as ready video frames advance', () => {
    const { engine, encodeBinding } = scheduledEngine();
    const video = { currentTime: 0, seeking: false, readyState: 4, videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
    vi.spyOn(videoPool, 'get').mockImplementation(id => id === 'slot-0' ? video : undefined);
    vi.spyOn(videoPool, 'hasReadyFrame').mockImplementation(id => id === 'slot-0');
    for (let i = 0; i < 60; i++) {
      video.currentTime = i / 60;
      engine.renderAll(frame(i / 60, i));
    }
    expect(encodeBinding.mock.calls.filter(call => call[4] === 'slot-0')).toHaveLength(WEB_PREVIEW_TARGET_FPS);
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
