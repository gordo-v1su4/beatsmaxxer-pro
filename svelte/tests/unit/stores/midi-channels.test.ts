import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import type { MidiLayer } from '$lib/stores/rack';
import {
  clearMidiChannels,
  midiChannels,
  registerModuleMidiChannel,
  removeModuleMidiChannel
} from '$lib/stores/midiChannels';

describe('module MIDI arrangement identity', () => {
  beforeEach(clearMidiChannels);

  test('publishes the exact parsed notes to Arrange and replaces by module', () => {
    const layer: MidiLayer = {
      name: 'lead.mid',
      notes: [
        { time: 0.25, note: 60, velocity: 100 },
        { time: 0.5, note: 64, velocity: 80 }
      ],
      duration: 1
    };
    registerModuleMidiChannel('punch', layer);
    registerModuleMidiChannel('punch', layer);

    const channels = get(midiChannels);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.notes).toBe(layer.notes);
    expect(channels[0]?.noteCount).toBe(layer.notes.length);
  });

  test('removing a module part removes its shared arrangement profile', () => {
    const layer: MidiLayer = {
      name: 'lead.mid',
      notes: [{ time: 0.25, note: 60, velocity: 100 }],
      duration: 1
    };
    registerModuleMidiChannel('punch', layer);
    removeModuleMidiChannel('punch');
    expect(get(midiChannels)).toEqual([]);
  });
});
