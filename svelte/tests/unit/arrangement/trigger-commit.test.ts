import { describe, expect, test } from 'vitest';
import { cutsFromTriggerMarks, mergeCommittedCuts } from '$lib/arrangement/triggerCommit';

describe('trigger commit helpers', () => {
  const grid = [0, 0.5, 1, 1.5, 2];

  test('last mark wins at the same sixteenth', () => {
    const cuts = cutsFromTriggerMarks(
      [
        { id: 'a', slotIndex: 1, seconds: 0.52 },
        { id: 'b', slotIndex: 3, seconds: 0.48 },
      ],
      grid,
      120,
      64,
    );
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.slotIndex).toBe(1);
  });

  test('merge replaces existing step slots', () => {
    const merged = mergeCommittedCuts(
      [{ step: 4, slotIndex: 0 }],
      [{ step: 4, slotIndex: 2 }, { step: 8, slotIndex: 1 }],
    );
    expect(merged.find((c) => c.step === 4)?.slotIndex).toBe(2);
    expect(merged.find((c) => c.step === 8)?.slotIndex).toBe(1);
  });
});
