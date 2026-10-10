import { get } from 'svelte/store';
import { describe, expect, test } from 'vitest';
import {
  BLANK_SECTION_BARS,
  arrangement,
  cuts,
  fitBlankArrangementToSong,
  loadDemoArrangement,
  resetArrangement,
} from '$lib/stores/arrangement';

describe('a session starts with a blank arrangement', () => {
  test('one plain section and no cuts on a fresh load', () => {
    const sections = get(arrangement);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.kind).toBe('section');
    expect(sections[0]!.bars).toBe(BLANK_SECTION_BARS);
    expect(sections[0]!.pattern.every((step) => step === null)).toBe(true);
    expect(get(cuts)).toEqual([]);
  });

  test('the blank section stretches over a loaded song, but not over edits', () => {
    resetArrangement();
    // 180s at 120 BPM = 360 beats = 90 bars.
    fitBlankArrangementToSong(180, 120);
    expect(get(arrangement)[0]!.bars).toBe(90);

    cuts.set([{ step: 0, slotIndex: 1 }]);
    fitBlankArrangementToSong(60, 120);
    expect(get(arrangement)[0]!.bars).toBe(90);

    resetArrangement();
    fitBlankArrangementToSong(Number.NaN, 120);
    expect(get(arrangement)[0]!.bars).toBe(BLANK_SECTION_BARS);
  });

  test('reset goes back to blank, not to the demo', () => {
    loadDemoArrangement();
    expect(get(arrangement).length).toBeGreaterThan(1);
    expect(get(cuts).length).toBeGreaterThan(0);

    resetArrangement();
    expect(get(arrangement)).toHaveLength(1);
    expect(get(cuts)).toEqual([]);
  });
});
