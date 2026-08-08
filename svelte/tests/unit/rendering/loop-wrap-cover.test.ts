import { beforeEach, describe, expect, test, vi } from 'vitest';

/** `duration` is read-only on HTMLVideoElement, so the stand-in stays a plain
 * mutable object and is cast only where the pool hands it back. */
const fakeVideo = { currentTime: 0, duration: 10 };

vi.mock('$lib/media/VideoPool', () => ({
  videoPool: {
    get: () => fakeVideo as unknown as HTMLVideoElement,
    getDuration: () => fakeVideo.duration
  }
}));

const { WebGpuEngine } = await import('$lib/rendering/webgpu/WebGpuEngine');
type Engine = InstanceType<typeof WebGpuEngine>;

import type { CanvasBinding } from '$lib/rendering/webgpu/WebGpuEngine';
import type { TimelineFrame } from '$lib/transport';

/** The cover is invisible to render diagnostics, so read the decision directly. */
function coveringWrap(engine: Engine, sourceId: string): boolean {
  return (engine as unknown as { isCoveringLoopWrap(id: string): boolean }).isCoveringLoopWrap(
    sourceId
  );
}

function buildEngine() {
  const engine = new WebGpuEngine();
  Object.assign(engine, {
    device: {
      createCommandEncoder: () => ({ finish: () => ({}) }),
      queue: { submit: vi.fn() }
    },
    bindings: new Map([['pgm', { color: [0, 0, 0] } as unknown as CanvasBinding]]),
    encodeBinding: vi.fn()
  });
  return engine;
}

const frame = () => ({ contextTimeSeconds: 0 }) as TimelineFrame;

describe('loop wrap cover', () => {
  beforeEach(() => {
    fakeVideo.currentTime = 0;
    fakeVideo.duration = 10;
  });

  test('first sight of a source is not treated as a wrap', () => {
    const engine = buildEngine();
    fakeVideo.currentTime = 4;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(false);
  });

  test('forward playback never covers', () => {
    const engine = buildEngine();
    for (const t of [1, 2, 3, 4]) {
      fakeVideo.currentTime = t;
      engine.renderAll(frame());
      expect(coveringWrap(engine, 'top-0')).toBe(false);
    }
  });

  test('a wrap covers exactly the configured number of frames, then releases', () => {
    const engine = buildEngine();
    fakeVideo.currentTime = 9.9;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(false);

    // End of clip: currentTime jumps backwards. This is the black frame.
    fakeVideo.currentTime = 0.01;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(true);

    fakeVideo.currentTime = 0.04;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(true);

    // Budget spent — back to the live external texture.
    fakeVideo.currentTime = 0.08;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(false);
  });

  test('float jitter in currentTime is not a wrap', () => {
    const engine = buildEngine();
    fakeVideo.currentTime = 5;
    engine.renderAll(frame());
    fakeVideo.currentTime = 4.999;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(false);
  });

  test('a backward seek is covered too — it opens the same empty-texture window', () => {
    const engine = buildEngine();
    fakeVideo.currentTime = 8;
    engine.renderAll(frame());
    fakeVideo.currentTime = 2;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(true);
  });

  test('a source with no usable duration is left alone', () => {
    const engine = buildEngine();
    fakeVideo.duration = Number.NaN;
    fakeVideo.currentTime = 5;
    engine.renderAll(frame());
    fakeVideo.currentTime = 0;
    engine.renderAll(frame());
    expect(coveringWrap(engine, 'top-0')).toBe(false);
  });
});
