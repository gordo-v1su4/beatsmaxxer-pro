import { describe, expect, test } from 'vitest';
import { visualProofExpectedMediaTime } from '$lib/qa/bmxQa';

describe('TimeSampler visual-proof media target', () => {
  test('uses the scheduler-owned source timestamp for TimeSampler', () => {
    expect(visualProofExpectedMediaTime('timesampler', 1, 15, 8.25)).toBe(8.25);
  });

  test('keeps ordinary modules synchronized to transport time', () => {
    expect(visualProofExpectedMediaTime('transition', 16.25, 15, 8.25)).toBe(1.25);
  });

  test('normalizes scheduled source time across loop boundaries', () => {
    expect(visualProofExpectedMediaTime('timesampler', 0, 15, 16.5)).toBe(1.5);
    expect(visualProofExpectedMediaTime('timesampler', 0, 15, -0.5)).toBe(14.5);
  });
});
