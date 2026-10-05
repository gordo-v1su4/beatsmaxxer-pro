import type { ArrangementTrigger, Cut } from '$lib/stores/arrangement';
import { secondsToCutStep } from '$lib/arrangement/timelineScale';

/**
 * Quantize recorded trigger marks onto the cut grid. Later marks at the same
 * sixteenth win (last performance intent).
 */
export function cutsFromTriggerMarks(
  marks: readonly ArrangementTrigger[],
  beatGrid: readonly number[],
  bpm: number,
  totalSteps: number,
): Cut[] {
  const byStep = new Map<number, Cut>();
  const sorted = [...marks].sort((a, b) => a.seconds - b.seconds);
  for (const mark of sorted) {
    const step = secondsToCutStep(mark.seconds, beatGrid, bpm, totalSteps);
    byStep.set(step, { step, slotIndex: mark.slotIndex });
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

/** Merge committed cuts into an existing list — same step replaces prior slot. */
export function mergeCommittedCuts(existing: readonly Cut[], committed: readonly Cut[]): Cut[] {
  const byStep = new Map<number, Cut>();
  for (const cut of existing) byStep.set(cut.step, cut);
  for (const cut of committed) byStep.set(cut.step, cut);
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

export type CommitMode = 'overdub' | 'replace';

/**
 * A recorded take's PGM cuts: each clip's start is the moment the performer
 * cut to that slot. Quantized onto the cut grid like trigger marks.
 */
export function cutsFromRecordedClips(
  clips: readonly { slotIndex: number; startSeconds: number }[],
  beatGrid: readonly number[],
  bpm: number,
  totalSteps: number,
): Cut[] {
  return cutsFromTriggerMarks(
    clips.map((clip) => ({ id: '', slotIndex: clip.slotIndex, seconds: clip.startSeconds })),
    beatGrid,
    bpm,
    totalSteps,
  );
}

/**
 * Lay a take onto the arrangement. Overdub keeps existing cuts and lets the
 * take win where both land on a step; replace first clears every cut inside
 * the take's own step range, so the span you performed over is exactly what
 * you played.
 */
export function applyTake(
  existing: readonly Cut[],
  take: readonly Cut[],
  mode: CommitMode,
  span: { startStep: number; endStep: number } | null,
): Cut[] {
  const base =
    mode === 'replace' && span
      ? existing.filter((cut) => cut.step < span.startStep || cut.step >= span.endStep)
      : existing;
  return mergeCommittedCuts(base, take);
}
