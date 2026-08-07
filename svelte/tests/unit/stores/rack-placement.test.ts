import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  applyModuleDrop,
  assignModuleToSlot,
  canDropModuleOnSlot,
  currentRackSlotForModule,
  RACK_SLOT_IDS,
  rackBottom,
  rackTop,
  swapRackSlots,
  videoLayers
} from '$lib/stores/rack';
import { DEFAULT_RACK_BOTTOM, DEFAULT_RACK_TOP } from '$lib/modules/catalog';
import { pgmSource, queuedPgmSource } from '$lib/stores/pgm';

describe('rack row placement', () => {
  beforeEach(() => {
    rackTop.set([...DEFAULT_RACK_TOP]);
    rackBottom.set([...DEFAULT_RACK_BOTTOM]);
    videoLayers.set(Object.fromEntries(RACK_SLOT_IDS.map((id) => [id, null])));
    pgmSource.set('transition');
    queuedPgmSource.set(null);
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

  test('adds one compatible fifth module and keeps the row capped at five', () => {
    const four = DEFAULT_RACK_TOP.filter((id) => id !== 'streak');
    rackTop.set([...four]);
    expect(canDropModuleOnSlot(
      { moduleId: 'streak', source: 'palette' },
      { row: 'top', index: 4 }
    )).toBe(true);
    expect(applyModuleDrop(
      { moduleId: 'streak', source: 'palette' },
      { row: 'top', index: 4 }
    )).toBe(true);
    expect(get(rackTop)).toEqual([...four, 'streak']);
    expect(get(videoLayers)['top-4']).toBeNull();

    expect(assignModuleToSlot('top', 5, 'leak')).toBe(false);
    expect(get(rackTop)).toHaveLength(5);
  });

  test('the fifth slot rejects incompatible and already-racked effects', () => {
    const four = DEFAULT_RACK_TOP.filter((id) => id !== 'streak');
    rackTop.set([...four]);
    expect(canDropModuleOnSlot(
      { moduleId: 'shake', source: 'palette' },
      { row: 'top', index: 4 }
    )).toBe(false);
    expect(canDropModuleOnSlot(
      { moduleId: 'transition', source: 'palette' },
      { row: 'top', index: 4 }
    )).toBe(false);
    expect(get(rackTop)).toEqual(four);
  });

  test('treats a library drop as an exact effect swap, even when the effect is already in the rack', () => {
    expect(applyModuleDrop(
      { moduleId: 'timesampler', source: 'palette' },
      { row: 'top', index: 0 }
    )).toBe(true);
    expect(get(rackTop)).toEqual(['timesampler', 'speedramp', 'tapdelay', 'transition', 'streak']);
  });

  test('keeps stable slot video ownership unchanged when replacing its effect', () => {
    const clip = { name: 'slot-video.mp4', url: 'blob:slot-video', duration: 12 };
    videoLayers.update((layers) => ({ ...layers, 'top-0': clip }));

    expect(assignModuleToSlot('top', 0, 'streak')).toBe(true);
    expect(get(rackTop)[0]).toBe('streak');
    expect(get(videoLayers)['top-0']).toBe(clip);
  });

  test('keeps PGM on the same video slot when its effect is replaced', () => {
    pgmSource.set('speedramp');

    expect(applyModuleDrop(
      { moduleId: 'streak', source: 'palette' },
      { row: 'top', index: 1 }
    )).toBe(true);
    expect(get(pgmSource)).toBe('streak');
    expect(currentRackSlotForModule(get(pgmSource))).toBe('top-1');
  });

  test('reports incompatible and unchanged targets before drop', () => {
    expect(canDropModuleOnSlot(
      { moduleId: 'streak', source: 'palette' },
      { row: 'top', index: 0 }
    )).toBe(true);
    expect(canDropModuleOnSlot(
      { moduleId: 'shake', source: 'palette' },
      { row: 'top', index: 0 }
    )).toBe(false);
    expect(canDropModuleOnSlot(
      { moduleId: 'transition', source: 'palette' },
      { row: 'top', index: 0 }
    )).toBe(false);
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
