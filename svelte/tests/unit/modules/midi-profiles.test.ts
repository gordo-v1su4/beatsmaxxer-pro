import { describe, expect, test } from 'vitest';
import { catalogIds } from '$lib/modules/catalog';
import { MODULE_MIDI_PROFILES, moduleAcceptsMidi } from '$lib/modules/midiProfiles';

describe('per-module MIDI acceptance contract', () => {
  test('documents every current module and no retired module', () => {
    expect(Object.keys(MODULE_MIDI_PROFILES)).toEqual(catalogIds());
  });

  test('does not expose one generic MIDI behavior to the whole rack', () => {
    const classes = new Set(Object.values(MODULE_MIDI_PROFILES).map((profile) => profile.timingClass));
    expect(classes).toEqual(new Set(['none', 'scheduler-jump', 'shader-envelope', 'shader-gate']));
  });

  test('only deterministic shader consumers expose DENS', () => {
    for (const [id, profile] of Object.entries(MODULE_MIDI_PROFILES)) {
      expect(profile.trigger.length, `${id} trigger`).toBeGreaterThan(20);
      expect(profile.evidence, `${id} evidence`).toMatch(/filename|rejected/i);
      expect(profile.scenario, `${id} scenario`).toMatch(/Real MP4 \+ audio/i);
      if (profile.density) {
        expect(profile.velocity, id).toBe('density-priority-only');
        expect(profile.timingClass, id).toMatch(/^shader-/);
      }
      if (profile.timingClass === 'none') expect(moduleAcceptsMidi(id), id).toBe(false);
    }
  });

  test('rejects the eight modules with no meaningful note consumer', () => {
    expect(catalogIds().filter((id) => !moduleAcceptsMidi(id))).toEqual([
      'transition', 'speedramp', 'tapdelay', 'focus', 'anamorphic',
      'grain', 'halation', 'prism'
    ]);
  });
});
