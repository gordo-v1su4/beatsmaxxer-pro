import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  assignModuleToSlot,
  rackBottom,
  rackTop,
  swapRackSlots
} from '$lib/stores/rack';
import { DEFAULT_RACK_BOTTOM, DEFAULT_RACK_TOP } from '$lib/modules/catalog';

describe('rack row placement', () => {
  beforeEach(() => {
    rackTop.set([...DEFAULT_RACK_TOP]);
    rackBottom.set([...DEFAULT_RACK_BOTTOM]);
  });

  test('rejects incompatible, unknown, unchanged, and out-of-range assignments as no-ops', () => {
    const top = get(rackTop);

    expect(assignModuleToSlot('top', 0, 'shake')).toBe(false);
    expect(assignModuleToSlot('top', 0, 'missing-module')).toBe(false);
    expect(assignModuleToSlot('top', -1, 'streak')).toBe(false);
    expect(assignModuleToSlot('top', 0, top[0]!)).toBe(false);
    expect(get(rackTop)).toEqual(top);
  });

  test('accepts a compatible palette assignment', () => {
    expect(assignModuleToSlot('top', 0, 'streak')).toBe(true);
    expect(get(rackTop)[0]).toBe('streak');
  });

  test('rejects a cross-row drop unless both swapped modules fit their destination rows', () => {
    const top = get(rackTop);
    const bottom = get(rackBottom);

    expect(swapRackSlots(
      { row: 'top', index: 0 },
      { row: 'bottom', index: 0 }
    )).toBe(false);
    expect(get(rackTop)).toEqual(top);
    expect(get(rackBottom)).toEqual(bottom);
  });

  test('keeps compatible same-row drops working and rejects invalid targets', () => {
    expect(swapRackSlots(
      { row: 'top', index: 0 },
      { row: 'top', index: 1 }
    )).toBe(true);
    expect(get(rackTop).slice(0, 2)).toEqual(['speedramp', 'transition']);

    const afterMove = get(rackTop);
    expect(swapRackSlots(
      { row: 'top', index: 0 },
      { row: 'top', index: 99 }
    )).toBe(false);
    expect(get(rackTop)).toEqual(afterMove);
  });
});
