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

/** Major ruler labels on the beat grid (bar 1 at the first downbeat). */
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
      const barsInto = bar - startBar;
      const span = section.timeEndS - section.timeStartS;
      const barDur = span / section.bars;
      return section.timeStartS + barsInto * barDur + (sixteenth / ARRANGEMENT_STEPS) * barDur;
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
  return beatAt(seconds, beatGrid, bpm) * 4;
}

export function stepSeconds(step: number, beatGrid: readonly number[], bpm: number) {
  const beat = step / 4;
  if (beatGrid.length < 2) return Math.max(0, (beat * 60) / bpm);
  if (beat <= 0) {
    const span = beatGrid[1]! - beatGrid[0]!;
    return Math.max(0, beatGrid[0]! + beat * span);
  }
  const lo = Math.min(Math.floor(beat), beatGrid.length - 1);
  if (lo >= beatGrid.length - 1) {
    const span = beatGrid.at(-1)! - beatGrid.at(-2)!;
    return Math.max(0, beatGrid.at(-1)! + (beat - (beatGrid.length - 1)) * span);
  }
  const fraction = beat - lo;
  return beatGrid[lo]! + (beatGrid[lo + 1]! - beatGrid[lo]!) * fraction;
}
