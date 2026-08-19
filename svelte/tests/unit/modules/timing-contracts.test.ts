import { describe, expect, test } from 'vitest';
import { catalogIds } from '$lib/modules/catalog';
import {
  MODULE_TIMING_CONTRACTS,
  moduleAcceptsMidi
} from '$lib/modules/timingContracts';

describe('module timing contracts', () => {
  test('documents exactly every current module', () => {
    expect(Object.keys(MODULE_TIMING_CONTRACTS).sort()).toEqual(catalogIds().sort());
    expect(catalogIds()).toHaveLength(19);
  });

  test.each(catalogIds())('%s has complete acceptance evidence', (moduleId) => {
    const contract = MODULE_TIMING_CONTRACTS[moduleId]!;
    expect(contract.moduleId).toBe(moduleId);
    expect(contract.noteTrigger.length).toBeGreaterThan(20);
    expect(contract.velocity.length).toBeGreaterThan(20);
    expect(contract.density.length).toBeGreaterThan(20);
    expect(contract.evidence.length).toBeGreaterThan(20);
    expect(contract.scenario).toMatch(/Real video/i);
    expect(moduleAcceptsMidi(moduleId)).toBe(contract.midiConsumer);
    expect(contract.midiConsumer).toBe(contract.timingClass !== 'none');
  });

  test('only modules with explicit event or cycle state accept MIDI', () => {
    expect(catalogIds().filter(moduleAcceptsMidi).sort()).toEqual([
      'leak', 'speedramp', 'streak', 'tapdelay', 'timesampler', 'transition'
    ]);
  });
});
