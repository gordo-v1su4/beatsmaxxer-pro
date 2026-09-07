import { describe, expect, test } from 'vitest';
import {
  arrangementTimelineScale,
  barNumberAtTime,
  barStartSeconds,
  rulerBarMarks,
  secondsStep,
  songTimeline,
  stepPercent,
  stepSeconds,
  timePercent,
} from '$lib/arrangement/timelineScale';

describe('arrangement timeline scale', () => {
  const grid = [1, 1.5, 2, 2.5, 3];

  test('anchors the view at file time 0 with no pre-bar padding', () => {
    const timeline = songTimeline(3, grid, 120);
    expect(timePercent(0, timeline)).toBe(0);
    expect(timePercent(1, timeline)).toBeCloseTo(33.333, 1);
  });

  test('places bar 1 on the first downbeat, not at time 0', () => {
    const timeline = songTimeline(3, grid, 120);
    const marks = rulerBarMarks(timeline, grid, 120);
    expect(marks[0]?.label).toBe(1);
    expect(marks[0]?.timeSeconds).toBeCloseTo(1, 8);
    expect(barNumberAtTime(1, grid, 120)).toBe(1);
  });

  test('extends beyond authored sections to the real song duration', () => {
    const timeline = songTimeline(12, grid, 120);
    expect(timeline.durationSeconds).toBeGreaterThanOrEqual(12);
  });

  test('round trips grid-aligned seek positions', () => {
    for (const seconds of grid) {
      expect(stepSeconds(secondsStep(seconds, grid, 120), grid, 120)).toBeCloseTo(seconds, 8);
    }
  });

  test('legacy step scale starts at zero for older callers', () => {
    const scale = arrangementTimelineScale(64, 3, grid, 120);
    expect(scale.startStep).toBe(0);
    expect(stepPercent(0, scale)).toBe(0);
  });

  test('bar starts follow the analysed grid', () => {
    expect(barStartSeconds(0, grid, 120)).toBeCloseTo(1, 8);
    expect(barStartSeconds(1, grid, 120)).toBeGreaterThan(barStartSeconds(0, grid, 120));
  });
});
