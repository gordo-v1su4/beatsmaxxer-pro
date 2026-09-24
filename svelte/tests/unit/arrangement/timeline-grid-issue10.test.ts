import { describe, expect, test } from 'vitest';
import {
  anchorBeatGridToSongStart,
  beatGridSongOffset,
  songTimeline,
  timePercent,
} from '$lib/arrangement/timelineScale';

/** Regression gate for backlog #10: AUTO-RHY grids whose first beat is after file 0. */
describe('timeline grid alignment (#10 gate)', () => {
  const essentiaLikeGrid = [1.2, 1.7, 2.2, 2.7, 3.2, 3.7];

  test('anchors lead-in so bar 1 and playhead start at file time 0', () => {
    expect(beatGridSongOffset(essentiaLikeGrid)).toBeCloseTo(1.2, 8);
    expect(anchorBeatGridToSongStart(essentiaLikeGrid)[0]).toBeCloseTo(0, 8);
    const timeline = songTimeline(180, essentiaLikeGrid, 125);
    expect(timePercent(0, timeline)).toBe(0);
  });
});
