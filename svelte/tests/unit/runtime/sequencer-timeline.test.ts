import { describe, expect, test } from 'vitest';
import { crossedSequencerSteps } from '$lib/stores/sequencer';

describe('timeline sequencer catch-up', () => {
  test('enumerates every crossed sixteenth under sparse publication', () => {
    const first = crossedSequencerSteps(null, 0);
    expect(first.steps).toEqual([0]);

    const sparse = crossedSequencerSteps(first.currentAbsoluteStep, 1.1);
    expect(sparse.steps).toEqual([1, 2, 3, 4]);
    expect(sparse.currentAbsoluteStep).toBe(4);
  });

  test('wraps deterministically across the 16-step bar', () => {
    expect(crossedSequencerSteps(14, 4.25).steps).toEqual([15, 0, 1]);
  });

  test('treats a backward/discontinuous cursor as a fresh current step', () => {
    expect(crossedSequencerSteps(12, 0.5).steps).toEqual([2]);
  });
});
