import { describe, expect, it } from 'vitest';
import { advanceSpeedRampSource, computeSpeedRampRate } from '$lib/runtime/speedramp';

describe('computeSpeedRampRate', () => {
  it('returns ~1× when curve midline crosses center', () => {
    // 4-beat cycle at beat 2 → phase 0.5 on symmetric curve
    const rate = computeSpeedRampRate(2, {
      len: 50,
      spdMin: 25,
      spdMax: 75,
      bzY0: 100,
      bzY1: 50,
      bzY2: 50,
      bzY3: 100
    });
    expect(rate).toBeCloseTo(1, 0);
  });

  it('respects bypass', () => {
    expect(computeSpeedRampRate(4, { len: 10, spdMax: 100 }, true)).toBe(1);
  });

  it('clamps to hardware playback range', () => {
    const rate = computeSpeedRampRate(0, { len: 10, spdMin: 0, spdMax: 100, bzY0: 0, bzY3: 0 });
    expect(rate).toBeGreaterThanOrEqual(0.0625);
    expect(rate).toBeLessThanOrEqual(4);
  });
});

describe('speedramp timeline source mapping', () => {
  const frame = (fixedStepIndex: number) => ({
    generation: 1,
    positionSeconds: fixedStepIndex / 60,
    beatPosition: fixedStepIndex / 30,
    beatIntervalSeconds: 0.5,
    fixedStepSeconds: 1 / 60,
    fixedStepIndex,
    fixedStepPhase: 0
  });

  it('produces the same source target under dense and sparse publication', () => {
    const params = { spdMin: 20, spdMax: 80, len: 36 };
    let dense = advanceSpeedRampSource(null, frame(0), params);
    for (let step = 1; step <= 6; step += 1) {
      dense = advanceSpeedRampSource(dense.state, frame(step), params);
    }
    const sparseStart = advanceSpeedRampSource(null, frame(0), params);
    const sparse = advanceSpeedRampSource(sparseStart.state, frame(6), params);
    expect(sparse.targetSeconds).toBeCloseTo(dense.targetSeconds, 10);
  });

  it('resets source mapping on timeline generation changes', () => {
    const prior = advanceSpeedRampSource(null, frame(4), {});
    const seek = advanceSpeedRampSource(prior.state, { ...frame(2), generation: 2 }, {});
    expect(seek.targetSeconds).toBe(frame(2).positionSeconds);
  });
});
