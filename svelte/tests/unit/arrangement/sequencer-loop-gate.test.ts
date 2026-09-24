import { describe, expect, test } from 'vitest';
import { cutStepAllowedInLoop } from '$lib/arrangement/sequencerLoopGate';

describe('sequencer loop gate', () => {
  const loop = { startSeconds: 10, endSeconds: 20 };

  test('allows all steps when loop is off', () => {
    expect(cutStepAllowedInLoop(5, null)).toBe(true);
    expect(cutStepAllowedInLoop(25, null)).toBe(true);
  });

  test('allows steps inside the loop span', () => {
    expect(cutStepAllowedInLoop(10, loop)).toBe(true);
    expect(cutStepAllowedInLoop(19.9, loop)).toBe(true);
  });

  test('blocks steps outside the loop span', () => {
    expect(cutStepAllowedInLoop(9.9, loop)).toBe(false);
    expect(cutStepAllowedInLoop(20, loop)).toBe(false);
  });
});
