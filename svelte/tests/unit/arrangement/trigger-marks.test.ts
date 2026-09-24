import { get } from 'svelte/store';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  commitTriggerMarksToCuts,
  deleteTriggerMark,
  moveTriggerMark,
} from '$lib/arrangement/triggerMarks';
import { arrangementTriggers, cuts } from '$lib/stores/arrangement';

describe('arrangement trigger marks', () => {
  beforeEach(() => {
    arrangementTriggers.set([
      { id: 'a', slotIndex: 2, seconds: 1 },
      { id: 'b', slotIndex: 5, seconds: 2 },
    ]);
    cuts.set([]);
  });

  test('moves and deletes marks', () => {
    moveTriggerMark('a', 3.5);
    expect(get(arrangementTriggers).find((m) => m.id === 'a')?.seconds).toBe(3.5);
    deleteTriggerMark('b');
    expect(get(arrangementTriggers).map((m) => m.id)).toEqual(['a']);
  });

  test('commits marks to cuts on the sixteenth grid', () => {
    const grid = [0, 0.5, 1, 1.5, 2];
    const result = commitTriggerMarksToCuts('all', 64, grid, 120);
    expect(result.committed).toBeGreaterThan(0);
    expect(get(cuts).length).toBeGreaterThan(0);
    for (const cut of get(cuts)) {
      expect(cut.slotIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
