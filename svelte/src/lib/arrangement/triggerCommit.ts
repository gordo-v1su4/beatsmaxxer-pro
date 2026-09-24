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
