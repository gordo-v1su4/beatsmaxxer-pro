import { describe, expect, test } from 'vitest';
import { applyTake, cutsFromRecordedClips } from '$lib/arrangement/triggerCommit';

// 120bpm from file 0: one sixteenth is 0.125s.
const beatGrid = Array.from({ length: 64 }, (_, i) => i * 0.5);

describe('recorded take commit', () => {
  test('each recorded clip start becomes a cut on the nearest sixteenth', () => {
    const take = cutsFromRecordedClips(
      [{ slotIndex: 2, startSeconds: 1.01 }, { slotIndex: 5, startSeconds: 2.49 }],
      beatGrid,
      120,
      256,
    );
    expect(take).toEqual([{ step: 8, slotIndex: 2 }, { step: 20, slotIndex: 5 }]);
  });

  const existing = [{ step: 4, slotIndex: 0 }, { step: 12, slotIndex: 1 }, { step: 40, slotIndex: 3 }];
  const take = [{ step: 8, slotIndex: 2 }, { step: 12, slotIndex: 6 }];

  test('overdub keeps existing cuts and the take wins a shared step', () => {
    expect(applyTake(existing, take, 'overdub', { startStep: 8, endStep: 20 })).toEqual([
      { step: 4, slotIndex: 0 },
      { step: 8, slotIndex: 2 },
      { step: 12, slotIndex: 6 },
      { step: 40, slotIndex: 3 },
    ]);
  });

  test('replace clears the take span first and leaves the rest alone', () => {
    expect(applyTake([...existing, { step: 16, slotIndex: 9 }], take, 'replace', { startStep: 8, endStep: 20 })).toEqual([
      { step: 4, slotIndex: 0 },
      { step: 8, slotIndex: 2 },
      { step: 12, slotIndex: 6 },
      { step: 40, slotIndex: 3 },
    ]);
  });
});
