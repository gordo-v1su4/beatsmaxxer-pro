import { describe, expect, it } from 'vitest';
import {
  alignStructureSectionsToBarGrid,
  arrangementFromStructureSections,
  sectionSpanToBars,
} from '$lib/arrangement/seedFromStructure';

describe('sectionSpanToBars', () => {
  const beats = Array.from({ length: 32 }, (_, i) => i * 0.5);

  it('converts four beats of audio into one bar', () => {
    expect(sectionSpanToBars(0, 2, beats, 120)).toBe(1);
  });

  it('rounds longer spans to whole bars', () => {
    expect(sectionSpanToBars(0, 8, beats, 120)).toBe(4);
  });

  it('never returns less than one bar', () => {
    expect(sectionSpanToBars(1, 1.1, beats, 120)).toBe(1);
  });
});

describe('alignStructureSectionsToBarGrid', () => {
  const beats = Array.from({ length: 80 }, (_, i) => i * 0.5);

  it('pins intro end to bar 5 when Essentia intro is in the 3–7 bar window', () => {
    const sections = [
      { start: 0, end: 9.2, label: 'intro', duration: 9.2, energy: 0.1 },
      { start: 9.2, end: 32, label: 'verse', duration: 22.8, energy: 0.2 },
    ];
    const aligned = alignStructureSectionsToBarGrid(sections, beats);
    expect(barCount(aligned[0]!, beats)).toBe(5);
    expect(aligned[0]?.end).toBe(10);
  });
});

function barCount(section: { start: number; end: number }, beats: number[]) {
  return sectionSpanToBars(section.start, section.end, beats, 120);
}

describe('arrangementFromStructureSections', () => {
  it('maps labels and bar counts from Essentia sections', () => {
    const sections = [
      { start: 0, end: 8, label: 'intro', duration: 8, energy: 0.1 },
      { start: 8, end: 40, label: 'verse', duration: 32, energy: 0.2 },
      { start: 40, end: 56, label: 'chorus', duration: 16, energy: 0.4 },
    ];
    const beats = Array.from({ length: 120 }, (_, i) => i * 0.5);
    const arrangement = arrangementFromStructureSections(sections, beats, 120);

    expect(arrangement).toHaveLength(3);
    expect(arrangement[0]?.name).toBe('INTRO');
    expect(arrangement[1]?.name).toBe('VERSE 1');
    expect(arrangement[2]?.name).toBe('CHORUS 1');
    expect(arrangement[0]?.bars).toBeGreaterThan(0);
    expect(arrangement.every((section) => section.pattern.every((step) => step === null))).toBe(true);
    expect(arrangement[0]?.timeStartS).toBe(0);
    expect(arrangement[0]?.timeEndS).toBe(10);
  });

  it('returns empty for no sections', () => {
    expect(arrangementFromStructureSections([], [], 120)).toEqual([]);
  });
});
