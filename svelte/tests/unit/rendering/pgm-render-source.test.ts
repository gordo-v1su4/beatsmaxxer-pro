import { describe, expect, test, vi } from 'vitest';
import { WebGpuEngine, type CanvasBinding } from '$lib/rendering/webgpu/WebGpuEngine';
import type { TimelineFrame } from '$lib/transport';

describe('PGM render source ownership', () => {
  test('ignores generic PGM canvas updates and renders the setPgmLiveModule source', () => {
    const engine = new WebGpuEngine();
    const pgmBinding = {
      moduleId: 'stale-viewer-prop',
      color: [0.1, 0.2, 0.3]
    } as unknown as CanvasBinding;
    const finish = vi.fn(() => ({} as GPUCommandBuffer));
    const submit = vi.fn();
    const encodeBinding = vi.fn();

    Object.assign(engine, {
      device: {
        createCommandEncoder: () => ({ finish }),
        queue: { submit }
      },
      bindings: new Map([['pgm', pgmBinding]]),
      encodeBinding
    });

    expect(engine.setCanvasModule('pgm', 'wrong-source')).toBe(false);
    expect(pgmBinding.moduleId).toBe('stale-viewer-prop');

    engine.setPgmLiveModule('shake', 'bottom-1');
    engine.renderAll({} as TimelineFrame);

    expect(encodeBinding).toHaveBeenCalledWith(
      expect.anything(),
      pgmBinding,
      pgmBinding.color,
      'shake',
      'bottom-1'
    );
    expect(submit).toHaveBeenCalledOnce();
  });

  test('continues to update stable preview canvas bindings', () => {
    const engine = new WebGpuEngine();
    const preview = { moduleId: 'transition', color: [0.1, 0.2, 0.3] } as CanvasBinding;
    Object.assign(engine, { bindings: new Map([['top-0', preview]]) });

    expect(engine.setCanvasModule('top-0', 'streak')).toBe(true);
    expect(preview.moduleId).toBe('streak');
    expect(engine.setCanvasModule('missing', 'streak')).toBe(false);
  });

  test('updates preview accent color without reattaching canvas', () => {
    const engine = new WebGpuEngine();
    const preview = { moduleId: 'transition', color: [0.1, 0.2, 0.3] } as CanvasBinding;
    Object.assign(engine, { bindings: new Map([['top-0', preview]]) });

    expect(engine.setCanvasAccent('top-0', [0.9, 0.5, 0.1])).toBe(true);
    expect(preview.color).toEqual([0.9, 0.5, 0.1]);
    expect(engine.setCanvasAccent('pgm', [1, 1, 1])).toBe(false);
    expect(engine.setCanvasAccent('missing', [1, 1, 1])).toBe(false);
  });
});
