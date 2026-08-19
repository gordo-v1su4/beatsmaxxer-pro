import { describe, expect, test } from 'vitest';
import {
  arrangementTimelineScale,
  secondsStep,
  stepPercent,
  stepSeconds
} from '$lib/arrangement/timelineScale';

describe('arrangement timeline scale', () => {
  const grid = [1, 1.5, 2, 2.5, 3];

  test('preserves lead-in before the first detected beat', () => {
    const scale = arrangementTimelineScale(64, 3, grid, 120);
    expect(scale.startStep).toBe(-8);
    expect(stepPercent(0, scale)).toBeGreaterThan(0);
    expect(secondsStep(1, grid, 120)).toBe(0);
  });

  test('extends beyond authored sections to the real song duration', () => {
    const scale = arrangementTimelineScale(16, 12, grid, 120);
    expect(scale.endStep).toBeGreaterThan(16);
  });

  test('round trips grid-aligned seek positions', () => {
    for (const seconds of grid) {
      expect(stepSeconds(secondsStep(seconds, grid, 120), grid, 120)).toBeCloseTo(seconds, 8);
    }
  });
});
