import { get } from 'svelte/store';
import {
  applyTake,
  cutsFromRecordedClips,
  cutsFromTriggerMarks,
  mergeCommittedCuts,
  type CommitMode,
} from '$lib/arrangement/triggerCommit';
import { secondsToCutStep } from '$lib/arrangement/timelineScale';
import {
  arrangementClips,
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

/**
 * Commit the recorded take — the PGM cuts performed while REC was on — onto
 * the song's cut grid. Replace clears the take's own span first; overdub
 * layers it over what is there.
 */
export function commitRecordedTake(
  mode: CommitMode,
  totalSteps: number,
  beatGrid: readonly number[],
  bpm: number,
): CommitTriggerMarksResult {
  const clips = get(arrangementClips);
  if (clips.length === 0 || totalSteps <= 0) return { committed: 0, skipped: clips.length };
  const take = cutsFromRecordedClips(clips, beatGrid, bpm, totalSteps);
  const start = Math.min(...clips.map((clip) => clip.startSeconds));
  const end = Math.max(...clips.map((clip) => clip.endSeconds ?? clip.startSeconds));
  const span = {
    startStep: secondsToCutStep(start, beatGrid, bpm, totalSteps),
    endStep: Math.max(
      secondsToCutStep(end, beatGrid, bpm, totalSteps),
      secondsToCutStep(start, beatGrid, bpm, totalSteps) + 1,
    ),
  };
  cuts.set(applyTake(get(cuts), take, mode, span));
  return { committed: take.length, skipped: Math.max(0, clips.length - take.length) };
}
