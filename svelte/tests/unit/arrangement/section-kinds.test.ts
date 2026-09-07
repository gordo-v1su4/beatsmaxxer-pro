import { describe, expect, it } from 'vitest';
import {
  formatSectionName,
  inferSectionKind,
  renumberSectionLabels,
} from '$lib/arrangement/sectionKinds';
import type { ArrangementSection } from '$lib/stores/arrangement';

function stubSection(partial: Partial<ArrangementSection> & Pick<ArrangementSection, 'id'>): ArrangementSection {
  return {
    id: partial.id,
    name: partial.name ?? 'SECTION 1',
    kind: partial.kind,
    bars: partial.bars ?? 8,
    hue: partial.hue ?? '#35e08a',
    bank: { top: [], bottom: [] },
    pattern: Array.from({ length: 16 }, () => null),
    ...partial,
  };
}

describe('sectionKinds', () => {
  it('infers hook and pre-chorus aliases', () => {
    expect(inferSectionKind('hook')).toBe('hook');
    expect(inferSectionKind('pre-chorus')).toBe('pre-chorus');
    expect(inferSectionKind('VERSE 2')).toBe('verse');
  });

  it('formats numbered and singleton labels', () => {
    expect(formatSectionName('verse', 1)).toBe('VERSE 1');
    expect(formatSectionName('intro', 1)).toBe('INTRO');
    expect(formatSectionName('outro', 2)).toBe('OUTRO 2');
  });

  it('re-numbers ordinals after a kind change', () => {
    const sections = [
      stubSection({ id: 'a', name: 'VERSE 1', kind: 'verse' }),
      stubSection({ id: 'b', name: 'CHORUS 1', kind: 'chorus' }),
      stubSection({ id: 'c', name: 'VERSE 2', kind: 'verse' }),
    ];
    sections[1] = { ...sections[1], kind: 'hook' };
    const next = renumberSectionLabels(sections);
    expect(next.map((section) => section.name)).toEqual(['VERSE 1', 'HOOK 1', 'VERSE 2']);
  });
});
