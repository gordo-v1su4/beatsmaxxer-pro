import type { ArrangementSection } from '$lib/stores/arrangement';
import { ARRANGEMENT_STEPS } from '$lib/stores/arrangement';
import { beatGridSongOffset,stepSeconds,barNumberAtTime } from './timelineScale';
export function resolveSectionBounds(
    sections: readonly ArrangementSection[],
    starts: readonly number[],
    grid: readonly number[],
    tempo: number,
  ) {
    const gridOffset = beatGridSongOffset(grid);
    return sections.map((section, i) => {
      let startSeconds =
        section.timeStartS ??
        stepSeconds(starts[i]! * ARRANGEMENT_STEPS, grid, tempo);
      let endSeconds =
        section.timeEndS ??
        stepSeconds((starts[i]! + section.bars) * ARRANGEMENT_STEPS, grid, tempo);
      if (section.timeStartS != null && gridOffset > 0) {
        startSeconds = Math.max(0, section.timeStartS - gridOffset);
      }
      if (section.timeEndS != null && gridOffset > 0) {
        endSeconds = Math.max(startSeconds, section.timeEndS - gridOffset);
      }
      if (i === 0) startSeconds = 0;
      return {
        id: section.id,
        name: section.name,
        hue: section.hue,
        startBar: barNumberAtTime(startSeconds, grid, tempo),
        startSeconds,
        endSeconds,
      };
    });
  }

/**
 * Which section the playhead is in, by position rather than by counting bars
 * since the last transport reset — so a seek lands in the right section.
 * Before the first band reads as the first; past the last end stays on the last.
 */
export function sectionIndexAtSeconds(
  bounds: readonly { startSeconds: number }[],
  seconds: number,
): number {
  if (bounds.length === 0) return -1;
  let index = 0;
  for (let i = 1; i < bounds.length; i++) {
    if (seconds >= bounds[i]!.startSeconds) index = i;
    else break;
  }
  return index;
}
