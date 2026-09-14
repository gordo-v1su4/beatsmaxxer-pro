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
