import { describe, expect, test } from 'vitest';
import {
  anchorBeatGridToSongStart,
  arrangementTimelineScale,
  barNumberAtTime,
  barStartSeconds,
  beatGridSongOffset,
  frameViewportFromSeconds,
  fullTimelineViewport,
  isFullViewport,
  rulerBarMarks,
  rulerBeatTicks,
  secondsStep,
  songTimeline,
  stepPercent,
  stepSeconds,
  timePercent,
  viewTimePercent,
  viewportZoomFactor,
  zoomViewportAround,
  followPlayheadViewport,
} from '$lib/arrangement/timelineScale';

describe('arrangement timeline scale', () => {
  const grid = [1, 1.5, 2, 2.5, 3];

  test('anchors the view at file time 0 with no pre-bar padding', () => {
    const timeline = songTimeline(3, grid, 120);
    expect(timePercent(0, timeline)).toBe(0);
    expect(timePercent(1, timeline)).toBeCloseTo(33.333, 1);
  });

  test('places bar 1 at song start (file time 0)', () => {
    const timeline = songTimeline(3, grid, 120);
    const marks = rulerBarMarks(timeline, grid, 120);
    expect(marks[0]?.label).toBe(1);
    expect(marks[0]?.timeSeconds).toBeCloseTo(0, 8);
    expect(barNumberAtTime(0, grid, 120)).toBe(1);
    expect(barStartSeconds(0, grid, 120)).toBeCloseTo(0, 8);
  });

  test('extends beyond authored sections to the real song duration', () => {
    const timeline = songTimeline(12, grid, 120);
    expect(timeline.durationSeconds).toBeGreaterThanOrEqual(12);
  });

  test('round trips grid-aligned seek positions', () => {
    const off = beatGridSongOffset(grid);
    for (const wallSeconds of grid) {
      const songSeconds = Math.max(0, wallSeconds - off);
      expect(stepSeconds(secondsStep(wallSeconds, grid, 120), grid, 120)).toBeCloseTo(
        songSeconds,
        8,
      );
    }
  });

  test('legacy step scale starts at zero for older callers', () => {
    const scale = arrangementTimelineScale(64, 3, grid, 120);
    expect(scale.startStep).toBe(0);
    expect(stepPercent(0, scale)).toBe(0);
  });

  test('bar starts follow the analysed grid', () => {
    expect(barStartSeconds(0, grid, 120)).toBeCloseTo(0, 8);
    expect(barStartSeconds(1, grid, 120)).toBeGreaterThan(barStartSeconds(0, grid, 120));
  });

  test('viewport maps visible seconds to lane percentages', () => {
    const timeline = songTimeline(120, grid, 120);
    const viewport = { startSeconds: 30, endSeconds: 60 };
    expect(viewTimePercent(30, viewport)).toBe(0);
    expect(viewTimePercent(45, viewport)).toBeCloseTo(50, 1);
    expect(viewTimePercent(60, viewport)).toBe(100);
    expect(viewportZoomFactor(viewport, timeline)).toBeCloseTo(4, 1);
  });

  test('frames a selection with padding and clamps to the song', () => {
    const timeline = songTimeline(120, grid, 120);
    const framed = frameViewportFromSeconds(40, 80, timeline);
    expect(framed.startSeconds).toBeLessThan(40);
    expect(framed.endSeconds).toBeGreaterThan(80);
    expect(framed.endSeconds).toBeLessThanOrEqual(120);
  });

  test('zooms in around an anchor without leaving the song bounds', () => {
    const timeline = songTimeline(120, [], 120);
    const full = fullTimelineViewport(timeline);
    const zoomed = zoomViewportAround(full, timeline, 2, 60);
    expect(zoomed.startSeconds).toBeGreaterThanOrEqual(0);
    expect(zoomed.endSeconds).toBeLessThanOrEqual(120);
    expect(zoomed.endSeconds - zoomed.startSeconds).toBeLessThan(120);
    expect(isFullViewport(full, timeline)).toBe(true);
    expect(isFullViewport(zoomed, timeline)).toBe(false);
  });

  test('lists beat ticks inside the viewport', () => {
    const viewport = { startSeconds: 0, endSeconds: 2.5 };
    const beats = rulerBeatTicks(viewport, grid, 120);
    expect(beats.length).toBeGreaterThan(0);
    expect(beats.every((t) => t >= 0 && t <= 2.5)).toBe(true);
  });

  test('anchors Essentia beat grids to file time 0', () => {
    expect(beatGridSongOffset(grid)).toBeCloseTo(1, 8);
    expect(anchorBeatGridToSongStart(grid)[0]).toBeCloseTo(0, 8);
    expect(stepSeconds(0, grid, 120)).toBeCloseTo(0, 8);
  });

  test('pans the viewport to follow the playhead', () => {
    const timeline = songTimeline(120, grid, 120);
    const viewport = { startSeconds: 30, endSeconds: 60 };
    const next = followPlayheadViewport(viewport, timeline, 62);
    expect(next).not.toBeNull();
    expect(next!.startSeconds).toBeGreaterThan(30);
    expect(next!.endSeconds).toBeGreaterThan(62);
  });
});
