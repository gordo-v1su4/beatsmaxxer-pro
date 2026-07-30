import { describe, expect, it } from 'vitest';
import { computeSpeedRampRate } from '$lib/runtime/speedramp';

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
