import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { listCatalog } from '$lib/modules/catalog';
import { MIDI_TIMING_CONTRACTS, supportsModuleMidi } from '$lib/modules/midiContracts';

describe('per-module MIDI timing contracts', () => {
  test('documents every current module and no retired module', () => {
    const catalogIds = listCatalog().map((module) => module.id).sort();
    expect(Object.keys(MIDI_TIMING_CONTRACTS).sort()).toEqual(catalogIds);
    expect(catalogIds).toHaveLength(19);
  });

  test.each(listCatalog().map((module) => [module.id, module] as const))(
    '%s exposes MIDI only when its contract names a live consumer',
    (id, module) => {
      const contract = MIDI_TIMING_CONTRACTS[id as keyof typeof MIDI_TIMING_CONTRACTS];
      expect(contract.consumer.length).toBeGreaterThan(20);
      expect(contract.velocity.length).toBeGreaterThan(10);
      expect(contract.proof.length).toBeGreaterThan(20);
      if (contract.timingClass === 'none') {
        expect(module.midiControl).toBeUndefined();
        expect(contract.density).toBe(false);
      } else {
        expect(module.midiControl).toBe(contract.timingClass);
        expect(contract.density).toBe(true);
      }
    }
  );

  test('one supported set drives import gating, rack UI, runtime, and Arrange projection', async () => {
    const expected = [
      'transition', 'tapdelay', 'timesampler', 'punch', 'shake', 'orbit', 'leak',
      'dutch', 'bulge', 'vhs', 'streak', 'mirror', 'lens'
    ];
    expect(Object.keys(MIDI_TIMING_CONTRACTS).filter(supportsModuleMidi)).toEqual(expected);

    const [route, appLoop, effect, compact, arrange] = await Promise.all([
      readFile('src/routes/+page.svelte', 'utf8'),
      readFile('src/lib/runtime/AppLoop.ts', 'utf8'),
      readFile('src/lib/components/EffectModule.svelte', 'utf8'),
      readFile('src/lib/components/CompactModule.svelte', 'utf8'),
      readFile('src/lib/components/ArrangeView.svelte', 'utf8')
    ]);
    expect(route).toContain("from '$lib/modules/midiContracts'");
    expect(route).toContain('supportsModuleMidi(id)');
    expect(appLoop).toContain('supportsModuleMidi(id)');
    expect(effect).toContain('moduleMidiContract(mod.id)');
    expect(compact).toContain('moduleMidiContract(mod.id)');
    expect(arrange).toContain('Object.entries($midiLayers)');
    expect(arrange).not.toContain('registerModuleMidiChannel');
  });
});
