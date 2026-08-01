import { describe, expect, test } from 'vitest';
import { advanceFeedbackTo, type FeedbackPair } from '$lib/rendering/webgpu/feedback';
import {
  hashUniformData,
  WebGpuEngine,
  writeTimelineUniformData
} from '$lib/rendering/webgpu/WebGpuEngine';
import { AudioTimeline } from '$lib/transport';

function feedback(): FeedbackPair {
  return {
    textures: [] as unknown as FeedbackPair['textures'],
    views: [] as unknown as FeedbackPair['views'],
    ping: 1,
    width: 2,
    height: 2,
    generation: -1,
    fixedStepIndex: -1
  };
}

describe('timeline feedback advancement', () => {
  test('hashes identical logical uniform inputs identically', () => {
    const first = new Float32Array([4, 0.25, 128, 1, 0.4]);
    const second = new Float32Array(first);
    expect(hashUniformData(first)).toBe(hashUniformData(second));
    second[0] = 5;
    expect(hashUniformData(second)).not.toBe(hashUniformData(first));
  });

  test('serializes the authoritative timeline fields into deterministic uniforms', () => {
    const context = { currentTime: 1, sampleRate: 48_000 };
    const timeline = new AudioTimeline();
    timeline.bindContext(context);
    timeline.play();
    const frame = timeline.publishFrame();
    const first = writeTimelineUniformData(new Float32Array(32), frame);
    const second = writeTimelineUniformData(new Float32Array(32), frame);
    const words = new Uint32Array(first.buffer);

    expect(hashUniformData(first)).toBe(hashUniformData(second));
    expect(first[22]).toBe(frame.positionSeconds);
    expect(words[24]).toBe(frame.fixedStepIndex);
    expect(words[27]).toBe(frame.generation);
    expect(words[28]).toBe(frame.deterministicSeed);
    expect(words[29]).toBe(frame.audioFrameId);

    timeline.seek(frame.positionSeconds);
    const next = writeTimelineUniformData(new Float32Array(32), timeline.publishFrame());
    expect(hashUniformData(next)).not.toBe(hashUniformData(first));
  });

  test('does not advance twice for duplicate display frames', () => {
    const fb = feedback();
    expect(advanceFeedbackTo(fb, 2, 10)).toEqual({
      reset: true, steps: 1, degraded: false, skippedSteps: 0
    });
    expect(advanceFeedbackTo(fb, 2, 10)).toEqual({
      reset: false, steps: 0, degraded: false, skippedSteps: 0
    });
    expect(advanceFeedbackTo(fb, 2, 13)).toEqual({
      reset: true, steps: 1, degraded: true, skippedSteps: 2
    });
    expect(fb.ping).toBe(0);
  });

  test('resets deterministically on a timeline discontinuity', () => {
    const fb = feedback();
    advanceFeedbackTo(fb, 1, 20);
    fb.ping = 1;
    expect(advanceFeedbackTo(fb, 2, 4)).toEqual({
      reset: true, steps: 1, degraded: false, skippedSteps: 0
    });
    expect(fb.ping).toBe(0);
  });

  test('clears renderer initialization state so a remount can initialize again', () => {
    const engine = new WebGpuEngine();
    const staleInit = Promise.resolve(true);
    Object.assign(engine, { device: {}, initPromise: staleInit });

    engine.dispose();

    expect((engine as unknown as { initPromise: Promise<boolean> | null }).initPromise).toBeNull();
  });
});
