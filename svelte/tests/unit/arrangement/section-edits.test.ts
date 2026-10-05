import { describe, expect, test } from 'vitest';
import { DEFAULT_ARRANGEMENT, type ArrangementSection } from '$lib/stores/arrangement';
import { resolveSectionBounds } from '$lib/arrangement/sectionBounds';
import {
  deleteSection,
  mergeWithNext,
  moveBoundary,
  renameSection,
  splitSection,
  type SectionEditContext,
} from '$lib/arrangement/sectionEdits';

// 120bpm, beat every 0.5s from file 0: one bar is 2s.
const beatGrid = Array.from({ length: 80 }, (_, i) => i * 0.5);
const bpm = 120;

function song(): ArrangementSection[] {
  const spans: [number, number][] = [[0, 8], [8, 16], [16, 24]];
  return spans.map(([start, end], i) => ({
    ...DEFAULT_ARRANGEMENT[i]!,
    bars: (end - start) / 2,
    timeStartS: start,
    timeEndS: end,
  }));
}

function ctxFor(sections: ArrangementSection[]): SectionEditContext {
  const starts: number[] = [];
  let bar = 0;
  for (const s of sections) {
    starts.push(bar);
    bar += s.bars;
  }
  return { bounds: resolveSectionBounds(sections, starts, beatGrid, bpm), beatGrid, bpm };
}

const spansOf = (sections: ArrangementSection[]) =>
  sections.map((s) => [s.timeStartS, s.timeEndS, s.bars]);

describe('section edits', () => {
  test('split snaps to the nearest bar and keeps the song tiled', () => {
    const sections = song();
    const next = splitSection(sections, 1, 11.3, ctxFor(sections))!;
    expect(next).toHaveLength(4);
    expect(spansOf(next)).toEqual([[0, 8, 4], [8, 12, 2], [12, 16, 2], [16, 24, 4]]);
    expect(next[2]!.kind).toBe(next[1]!.kind);
    expect(new Set(next.map((s) => s.id)).size).toBe(4);
  });

  test('split on a boundary is refused', () => {
    const sections = song();
    expect(splitSection(sections, 1, 8.1, ctxFor(sections))).toBeNull();
  });

  test('merge folds the next section into this one', () => {
    const sections = song();
    const next = mergeWithNext(sections, 0, ctxFor(sections))!;
    expect(spansOf(next)).toEqual([[0, 16, 8], [16, 24, 4]]);
    expect(next[0]!.id).toBe(sections[0]!.id);
  });

  test('delete gives the span to the previous section, or the next for the first', () => {
    const sections = song();
    expect(spansOf(deleteSection(sections, 2, ctxFor(sections))!)).toEqual([[0, 8, 4], [8, 24, 8]]);
    expect(spansOf(deleteSection(sections, 0, ctxFor(sections))!)).toEqual([[0, 16, 8], [16, 24, 4]]);
    expect(deleteSection([sections[0]!], 0, ctxFor([sections[0]!]))).toBeNull();
  });

  test('moving a boundary snaps to bars and keeps one bar each side', () => {
    const sections = song();
    expect(spansOf(moveBoundary(sections, 1, 9.7, ctxFor(sections))!)).toEqual([[0, 10, 5], [10, 16, 3], [16, 24, 4]]);
    expect(spansOf(moveBoundary(sections, 1, 100, ctxFor(sections))!)).toEqual([[0, 14, 7], [14, 16, 1], [16, 24, 4]]);
    expect(moveBoundary(sections, 0, 3, ctxFor(sections))).toBeNull();
  });

  test('a custom name survives renumbering and clears back to the generated one', () => {
    const renamed = renameSection(song(), 1, 'dance break');
    expect(renamed[1]!.name).toBe('DANCE BREAK');
    const kinded = renameSection(renamed, 1, '');
    expect(kinded[1]!.customName).toBeUndefined();
    expect(kinded[1]!.name).not.toBe('DANCE BREAK');
  });
});
