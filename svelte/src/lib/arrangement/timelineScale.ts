import { beatAt } from '$lib/stores/triggerLane';

export interface ArrangementTimelineScale {
  startStep: number;
  endStep: number;
  totalSteps: number;
}

/**
 * One horizontal coordinate system for cuts, audio analysis, MIDI and transport.
 * Step zero remains the first detected beat; negative steps preserve audible
 * lead-in instead of squeezing it into bar one.
 */
export function arrangementTimelineScale(
  arrangementSteps: number,
  durationSeconds: number,
  beatGrid: readonly number[],
  bpm: number
): ArrangementTimelineScale {
  const startStep = Math.min(0, Math.floor(beatAt(0, beatGrid, bpm) * 4));
  const songEndStep = durationSeconds > 0
    ? Math.ceil(beatAt(durationSeconds, beatGrid, bpm) * 4)
    : arrangementSteps;
  const endStep = Math.max(arrangementSteps, songEndStep, startStep + 1);
  return { startStep, endStep, totalSteps: endStep - startStep };
}

export function stepPercent(step: number, scale: ArrangementTimelineScale) {
  return ((step - scale.startStep) / scale.totalSteps) * 100;
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
