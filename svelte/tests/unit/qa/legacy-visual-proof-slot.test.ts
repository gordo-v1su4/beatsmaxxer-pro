import { describe, expect, test } from 'vitest';
import { listCatalog, canPlaceInRow } from '$lib/modules/catalog';
import { RACK_SLOT_IDS } from '$lib/stores/rack';
import { visualProofSlotForModule } from '$lib/qa/bmxQa';

describe('legacy visual-proof stable media slots', () => {
  test('maps every catalog module to a deterministic eligible stable slot', () => {
    for (const mod of listCatalog()) {
      const first = visualProofSlotForModule(mod.id);
      const second = visualProofSlotForModule(mod.id);
      expect(first).toBe(second);
      expect(RACK_SLOT_IDS).toContain(first);
      expect(canPlaceInRow(mod, first!.startsWith('top-') ? 'top' : 'bottom')).toBe(true);
    }
  });

  test('never allocates more than the eight stable media slots across the catalog', () => {
    const slots = new Set(listCatalog().map((mod) => visualProofSlotForModule(mod.id)));
    expect(slots.size).toBeLessThanOrEqual(8);
  });

  test('rejects an unknown module instead of creating a module-owned media key', () => {
    expect(visualProofSlotForModule('not-in-catalog')).toBeNull();
  });
});
