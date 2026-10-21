import { describe, expect, it } from 'vitest';
import { MAX_RACK_SLOTS_PER_ROW, RACK_SLOT_IDS, rackSlotIndex, currentRackModuleForSlot } from '$lib/stores/rack';
import { DEFAULT_RACK_TOP, DEFAULT_RACK_BOTTOM } from '$lib/modules/catalog';
import { parseArrangementFile } from '$lib/arrangement/persistence';

const legacy = () => ({ version: 1, song: { name: 'test.wav', duration: 30 }, sections: [{
  id: 'verse', name: 'Verse', bars: 4,
  bank: { top: DEFAULT_RACK_TOP.slice(0, 5), bottom: DEFAULT_RACK_BOTTOM.slice(0, 5) },
  pattern: [5, 9, ...Array(14).fill(null)]
}], cuts: [{ step: 0, slotIndex: 5 }, { step: 4, slotIndex: 9 }] });

describe('twelve-slot rack compatibility', () => {
  it('provides six real media owners per row and maps all twelve to the arranger', () => {
    expect(MAX_RACK_SLOTS_PER_ROW).toBe(6);
    expect(RACK_SLOT_IDS).toHaveLength(12);
    expect(DEFAULT_RACK_TOP).toHaveLength(6);
    expect(DEFAULT_RACK_BOTTOM).toHaveLength(6);
    expect(rackSlotIndex('top-5')).toBe(5);
    expect(rackSlotIndex('bottom-0')).toBe(6);
    expect(rackSlotIndex('bottom-5')).toBe(11);
    expect(currentRackModuleForSlot('top-5')).toBe(DEFAULT_RACK_TOP[5]);
    expect(currentRackModuleForSlot('bottom-5')).toBe(DEFAULT_RACK_BOTTOM[5]);
  });

  it('keeps legacy bottom-row patterns and recorded cuts on their original slots', () => {
    const restored = parseArrangementFile(JSON.stringify(legacy()));
    expect(restored.sections[0].pattern.slice(0, 2)).toEqual([6, 10]);
    expect(restored.cuts.map(cut => cut.slotIndex)).toEqual([6, 10]);
  });

  it('accepts new sixth-slot cuts without migrating them a second time', () => {
    const doc = { ...legacy(), slotsPerRow: 6 };
    doc.sections[0].bank = { top: [...DEFAULT_RACK_TOP], bottom: [...DEFAULT_RACK_BOTTOM] };
    doc.sections[0].pattern[0] = 11;
    doc.cuts = [{ step: 0, slotIndex: 5 }, { step: 4, slotIndex: 11 }];
    const restored = parseArrangementFile(JSON.stringify(doc));
    expect(restored.sections[0].pattern[0]).toBe(11);
    expect(restored.cuts.map(cut => cut.slotIndex)).toEqual([5, 11]);
  });
});
