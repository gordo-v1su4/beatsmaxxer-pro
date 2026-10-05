import { get } from 'svelte/store';
import { cutsFromTriggerMarks, mergeCommittedCuts } from '$lib/arrangement/triggerCommit';
import {
  arrangementTriggers,
  cuts,
  type ArrangementTrigger,
} from '$lib/stores/arrangement';

export function moveTriggerMark(id: string, seconds: number) {
  const next = Math.max(0, seconds);
  arrangementTriggers.update((marks) =>
    marks.map((mark) => (mark.id === id ? { ...mark, seconds: next } : mark)),
  );
}

export function deleteTriggerMark(id: string) {
  arrangementTriggers.update((marks) => marks.filter((mark) => mark.id !== id));
}

export interface CommitTriggerMarksResult {
  committed: number;
  skipped: number;
}

/**
 * Quantize selected trigger marks onto the song cut grid. Last mark wins per step.
 */
export function commitTriggerMarksToCuts(
  markIds: readonly string[] | 'all',
  totalSteps: number,
  beatGrid: readonly number[],
  bpm: number,
): CommitTriggerMarksResult {
  const marks = get(arrangementTriggers);
  const selected: ArrangementTrigger[] =
    markIds === 'all' ? [...marks] : marks.filter((mark) => markIds.includes(mark.id));
  if (selected.length === 0) return { committed: 0, skipped: 0 };

  if (totalSteps <= 0) return { committed: 0, skipped: selected.length };
  const committedCuts = cutsFromTriggerMarks(selected, beatGrid, bpm, totalSteps);
  cuts.set(mergeCommittedCuts(get(cuts), committedCuts));
  return {
    committed: committedCuts.length,
    skipped: Math.max(0, selected.length - committedCuts.length),
  };
}
