import { beatAt } from '$lib/stores/triggerLane';
import { ARRANGEMENT_STEPS, type ArrangementSection } from '$lib/stores/arrangement';

export interface SongTimeline {
  /** Wall-clock span of the arrangement view — 0 is the file start (DAW-style). */
  durationSeconds: number;
}

export interface RulerBarMark {
  /** 1-indexed bar number on the analysed grid (1, 5, 9, …). */
  label: number;
  timeSeconds: number;
}

/**
 * One horizontal coordinate system for sections, ruler, playhead, and lanes.
 * Anchored at time 0 — no negative-step padding before bar 1.
 */
/** Wall-clock offset of the analysed downbeat — song/file time 0 is bar 1. */
export function beatGridSongOffset(beatGrid: readonly number[]): number {
  return beatGrid.length >= 2 ? beatGrid[0]! : 0;
}

/** Shift Essentia's beat grid so bar 1 beat 1 lands at file time 0. */
export function anchorBeatGridToSongStart(beatGrid: readonly number[]): readonly number[] {
  if (beatGrid.length < 2) return beatGrid;
  const off = beatGrid[0]!;
  if (off <= 1e-9) return beatGrid;
  return beatGrid.map((t) => Math.max(0, t - off));
}

export function songTimeline(
  durationSeconds: number,
  beatGrid: readonly number[],
  bpm: number,
): SongTimeline {
  const gridEnd =
    beatGrid.length > 1 ? stepSeconds((beatGrid.length - 1) * 4, beatGrid, bpm) : 0;
  return {
    durationSeconds: Math.max(durationSeconds, gridEnd, 1e-6),
  };
}

export function timePercent(seconds: number, timeline: SongTimeline): number {
  if (timeline.durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (seconds / timeline.durationSeconds) * 100));
}

/** Visible time window on the arrangement timeline (DAW-style horizontal zoom). */
export interface TimelineViewport {
  startSeconds: number;
  endSeconds: number;
}

export function fullTimelineViewport(timeline: SongTimeline): TimelineViewport {
  return { startSeconds: 0, endSeconds: timeline.durationSeconds };
}

export function viewportSpan(viewport: TimelineViewport): number {
  return Math.max(viewport.endSeconds - viewport.startSeconds, 1e-6);
}

export function isFullViewport(viewport: TimelineViewport, timeline: SongTimeline): boolean {
  const full = timeline.durationSeconds;
  return viewport.startSeconds <= 1e-4 && Math.abs(viewport.endSeconds - full) < 0.05;
}

export function viewportZoomFactor(viewport: TimelineViewport, timeline: SongTimeline): number {
  return timeline.durationSeconds / viewportSpan(viewport);
}

/** Map wall-clock seconds into 0–100% of the visible viewport. */
export function viewTimePercent(seconds: number, viewport: TimelineViewport): number {
  const span = viewportSpan(viewport);
  return Math.min(100, Math.max(0, ((seconds - viewport.startSeconds) / span) * 100));
}

export function viewSecondsFromFraction(fraction: number, viewport: TimelineViewport): number {
  const span = viewportSpan(viewport);
  return viewport.startSeconds + fraction * span;
}

/** Zoom in/out around an anchor while clamping to the song bounds. */
export function zoomViewportAround(
  viewport: TimelineViewport,
  timeline: SongTimeline,
  factor: number,
  anchorSeconds: number,
): TimelineViewport {
  const full = timeline.durationSeconds;
  const span = viewportSpan(viewport);
  const newSpan = Math.min(full, Math.max(full / 64, span / factor));
  const anchorFrac = span > 0 ? (anchorSeconds - viewport.startSeconds) / span : 0.5;
  let start = anchorSeconds - anchorFrac * newSpan;
  let end = start + newSpan;
  if (start < 0) {
    start = 0;
    end = newSpan;
  }
  if (end > full) {
    end = full;
    start = Math.max(0, full - newSpan);
  }
  return { startSeconds: start, endSeconds: end };
}

export function frameViewportFromSeconds(
  startSeconds: number,
  endSeconds: number,
  timeline: SongTimeline,
  paddingRatio = 0.06,
): TimelineViewport {
  const span = Math.max(endSeconds - startSeconds, 0.5);
  const pad = span * paddingRatio;
  const full = timeline.durationSeconds;
  return {
    startSeconds: Math.max(0, startSeconds - pad),
    endSeconds: Math.min(full, endSeconds + pad),
  };
}

/** Every beat boundary inside the viewport — Ableton-style beat grid. */
export function rulerBeatTicks(
  viewport: TimelineViewport,
  beatGrid: readonly number[],
  bpm: number,
): number[] {
  const start = Math.max(0, viewport.startSeconds - 0.01);
  const end = viewport.endSeconds + 0.01;
  const grid = anchorBeatGridToSongStart(beatGrid);
  if (grid.length >= 2) {
    const times: number[] = [];
    for (const t of grid) {
      if (t >= start && t <= end) times.push(t);
    }
    return times;
  }
  const period = 60 / bpm;
  const times: number[] = [];
  const first = Math.floor(start / period) * period;
  for (let t = first; t <= end; t += period) {
    if (t >= start) times.push(t);
  }
  return times;
}

export function barStartSeconds(
  barIndex: number,
  beatGrid: readonly number[],
  bpm: number,
): number {
  return Math.max(0, stepSeconds(barIndex * ARRANGEMENT_STEPS, beatGrid, bpm));
}

export function barNumberAtTime(
  seconds: number,
  beatGrid: readonly number[],
  bpm: number,
): number {
  const beat = beatAt(seconds, beatGrid, bpm);
  return Math.max(1, Math.floor(beat / 4) + 1);
}

/** Major ruler labels on the beat grid (bar 1 at file time 0). */
export function rulerBarMarks(
  timeline: SongTimeline,
  beatGrid: readonly number[],
  bpm: number,
): RulerBarMark[] {
  const marks: RulerBarMark[] = [];
  const lastBarIndex = Math.ceil(beatAt(timeline.durationSeconds, beatGrid, bpm) / 4) + 2;
  for (let bar = 1; bar <= lastBarIndex; bar += 4) {
    const timeSeconds = barStartSeconds(bar - 1, beatGrid, bpm);
    if (timeSeconds > timeline.durationSeconds + 0.01) break;
    marks.push({ label: bar, timeSeconds });
  }
  return marks;
}

/** Hairline at every bar boundary. */
export function rulerBarTicks(
  timeline: SongTimeline,
  beatGrid: readonly number[],
  bpm: number,
): number[] {
  const times: number[] = [];
  const lastBarIndex = Math.ceil(beatAt(timeline.durationSeconds, beatGrid, bpm) / 4) + 2;
  for (let bar = 0; bar < lastBarIndex; bar += 1) {
    const timeSeconds = barStartSeconds(bar, beatGrid, bpm);
    if (timeSeconds > timeline.durationSeconds + 0.01) break;
    times.push(timeSeconds);
  }
  return times;
}

export function secondsToCutStep(
  seconds: number,
  beatGrid: readonly number[],
  bpm: number,
  totalSteps: number,
): number {
  return Math.min(totalSteps, Math.max(0, Math.round(secondsStep(seconds, beatGrid, bpm))));
}

export function arrangementStepToSeconds(
  step: number,
  sections: readonly ArrangementSection[],
  sectionStarts: readonly number[],
  beatGrid: readonly number[],
  bpm: number,
): number {
  const bar = Math.floor(step / ARRANGEMENT_STEPS);
  const sixteenth = step % ARRANGEMENT_STEPS;

  for (let i = 0; i < sections.length; i++) {
    const startBar = sectionStarts[i]!;
    const endBar = startBar + sections[i]!.bars;
    if (bar < startBar || bar >= endBar) continue;

    const section = sections[i]!;
    if (section.timeStartS != null && section.timeEndS != null) {
      const off = beatGridSongOffset(beatGrid);
      const sectionStart = i === 0 ? 0 : Math.max(0, section.timeStartS - off);
      const sectionEnd = Math.max(sectionStart, section.timeEndS - off);
      const barsInto = bar - startBar;
      const span = sectionEnd - sectionStart;
      const barDur = span / section.bars;
      return sectionStart + barsInto * barDur + (sixteenth / ARRANGEMENT_STEPS) * barDur;
    }
    return stepSeconds(step, beatGrid, bpm);
  }

  return stepSeconds(step, beatGrid, bpm);
}

/** @deprecated Prefer songTimeline + timePercent. */
export interface ArrangementTimelineScale {
  startStep: number;
  endStep: number;
  totalSteps: number;
}

/** @deprecated Prefer songTimeline. */
export function arrangementTimelineScale(
  arrangementSteps: number,
  durationSeconds: number,
  beatGrid: readonly number[],
  bpm: number,
): ArrangementTimelineScale {
  const timeline = songTimeline(durationSeconds, beatGrid, bpm);
  const endStep = Math.max(
    arrangementSteps,
    Math.ceil(secondsStep(timeline.durationSeconds, beatGrid, bpm)),
    1,
  );
  return { startStep: 0, endStep, totalSteps: endStep };
}

/** @deprecated Prefer timePercent. */
export function stepPercent(step: number, scale: ArrangementTimelineScale) {
  return (step / scale.totalSteps) * 100;
}

export function secondsStep(seconds: number, beatGrid: readonly number[], bpm: number) {
  const grid = anchorBeatGridToSongStart(beatGrid);
  const songSeconds = Math.max(0, seconds - beatGridSongOffset(beatGrid));
  return beatAt(songSeconds, grid, bpm) * 4;
}

export function stepSeconds(step: number, beatGrid: readonly number[], bpm: number) {
  const grid = anchorBeatGridToSongStart(beatGrid);
  const beat = step / 4;
  if (grid.length < 2) return Math.max(0, (beat * 60) / bpm);
  if (beat <= 0) {
    const span = grid[1]! - grid[0]!;
    return Math.max(0, grid[0]! + beat * span);
  }
  const lo = Math.min(Math.floor(beat), grid.length - 1);
  if (lo >= grid.length - 1) {
    const span = grid.at(-1)! - grid.at(-2)!;
    return Math.max(0, grid.at(-1)! + (beat - (grid.length - 1)) * span);
  }
  const fraction = beat - lo;
  return grid[lo]! + (grid[lo + 1]! - grid[lo]!) * fraction;
}

/** Pan the visible window so the playhead stays in view while zoomed. */
export function followPlayheadViewport(
  viewport: TimelineViewport,
  timeline: SongTimeline,
  playheadSeconds: number,
  marginRatio = 0.18,
): TimelineViewport | null {
  const span = viewportSpan(viewport);
  if (span <= 0 || isFullViewport(viewport, timeline)) return null;
  const margin = span * marginRatio;
  const start = viewport.startSeconds;
  const end = viewport.endSeconds;
  if (playheadSeconds >= start + margin && playheadSeconds <= end - margin) return null;

  let nextStart = start;
  if (playheadSeconds < start + margin) {
    nextStart = Math.max(0, playheadSeconds - margin);
  } else if (playheadSeconds > end - margin) {
    nextStart = Math.max(0, playheadSeconds - span + margin);
  }
  let nextEnd = nextStart + span;
  if (nextEnd > timeline.durationSeconds) {
    nextEnd = timeline.durationSeconds;
    nextStart = Math.max(0, nextEnd - span);
  }
  if (Math.abs(nextStart - start) < 1e-4 && Math.abs(nextEnd - end) < 1e-4) return null;
  return { startSeconds: nextStart, endSeconds: nextEnd };
}
