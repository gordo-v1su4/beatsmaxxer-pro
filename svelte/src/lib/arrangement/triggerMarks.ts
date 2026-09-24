import { get } from 'svelte/store';
import { secondsToCutStep } from '$lib/arrangement/timelineScale';
import {
  arrangementTriggers,
  cuts,
  toggleCut,
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

  selected.sort((a, b) => a.seconds - b.seconds);
  let committed = 0;
  let skipped = 0;
  for (const mark of selected) {
    if (totalSteps <= 0) {
      skipped += 1;
      continue;
    }
    const step = secondsToCutStep(mark.seconds, beatGrid, bpm, totalSteps);
    const existing = get(cuts).find((cut) => cut.step === step);
    if (existing?.slotIndex === mark.slotIndex) {
      skipped += 1;
      continue;
    }
    toggleCut(step, mark.slotIndex);
    committed += 1;
  }
  return { committed, skipped };
}
