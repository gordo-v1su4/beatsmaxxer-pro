import { get } from 'svelte/store';
import { afterEach, describe, expect, test } from 'vitest';
import {
  advanceBars,
  advanceMode,
  CLIP_ADVANCE_BARS
} from '$lib/mobile/mobileSession';

/**
 * The transport's NEXT CLIP stepper folds "does the video change" and "how
 * often" into one control, with OFF at the bottom of the same range. These
 * cover the fold, because the failure it replaces is silent: before this the
 * interval was fixed at eight bars with no way to reach it.
 *
 * The stepper's arithmetic is reproduced here rather than imported, because it
 * lives in a component. Keep the two in step: if ADVANCE_STOPS or the clamp
 * changes in MobileTransport.svelte, change it here too.
 */

const STOPS: readonly number[] = [0, ...CLIP_ADVANCE_BARS];

function currentIndex(): number {
  return get(advanceMode) === 'hold'
    ? 0
    : Math.max(1, STOPS.indexOf(get(advanceBars)));
}

/** Mirrors nudgeAdvance(), including the remembered non-hold order. */
function nudge(delta: number, lastMovingMode: 'linear' | 'random' = 'linear') {
  const next = Math.max(0, Math.min(STOPS.length - 1, currentIndex() + delta));
  if (next === 0) {
    advanceMode.set('hold');
    return;
  }
  advanceMode.set(lastMovingMode);
  advanceBars.set(STOPS[next]!);
}

afterEach(() => {
  advanceMode.set('hold');
  advanceBars.set(8);
});

describe('clip advance interval', () => {
  test('the offered intervals are whole bars, ascending', () => {
    expect([...CLIP_ADVANCE_BARS]).toEqual([1, 2, 4, 8, 16]);
    for (const bars of CLIP_ADVANCE_BARS) {
      expect(Number.isInteger(bars)).toBe(true);
      expect(bars).toBeGreaterThan(0);
    }
  });

  test('stepping up from OFF starts advancing at the shortest interval', () => {
    advanceMode.set('hold');
    nudge(1);
    expect(get(advanceMode)).toBe('linear');
    expect(get(advanceBars)).toBe(1);
  });

  test('stepping down off the bottom holds instead of advancing faster', () => {
    advanceMode.set('linear');
    advanceBars.set(1);
    nudge(-1);
    expect(get(advanceMode)).toBe('hold');
  });

  test('turning it back on restores RANDOM rather than defaulting to LINEAR', () => {
    advanceMode.set('random');
    advanceBars.set(4);
    nudge(-1, 'random');
    nudge(-1, 'random');
    nudge(-1, 'random');
    expect(get(advanceMode)).toBe('hold');

    nudge(1, 'random');
    // The order the set was built with survives a trip through OFF.
    expect(get(advanceMode)).toBe('random');
  });

  test('walks the whole range and clamps at both ends', () => {
    advanceMode.set('hold');
    for (let i = 0; i < 20; i++) nudge(1);
    expect(get(advanceBars)).toBe(CLIP_ADVANCE_BARS.at(-1));
    expect(get(advanceMode)).toBe('linear');

    for (let i = 0; i < 20; i++) nudge(-1);
    expect(get(advanceMode)).toBe('hold');
  });

  test('an interval set outside the stop list still steps somewhere sane', () => {
    // advanceBars is a plain writable, so nothing stops another surface from
    // parking it off-grid. indexOf returns -1 there; the clamp must not let
    // that read as OFF while the mode says it is advancing.
    advanceMode.set('linear');
    advanceBars.set(7);
    expect(currentIndex()).toBe(1);
    nudge(1);
    expect(get(advanceBars)).toBe(CLIP_ADVANCE_BARS[1]);
  });
});
