import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { shouldAutoloadQaMidi } from '$lib/qa/loadQaMedia';
import { midiUiOpen, setMidiUiOpen } from '$lib/stores/rackUi';
import { moduleTriggerSource, setModuleTriggerSource } from '$lib/stores/midiTrigger';

describe('QA MIDI autoload', () => {
  test('loads rack module parts by default on QA sessions', () => {
    expect(shouldAutoloadQaMidi('?qa=1')).toBe(true);
    expect(shouldAutoloadQaMidi('?qa=1&qaAutoplay=1')).toBe(true);
  });

  test('opts out only with qaMidi=0', () => {
    expect(shouldAutoloadQaMidi('?qa=1&qaMidi=0')).toBe(false);
    expect(shouldAutoloadQaMidi('')).toBe(true);
  });
});

describe('MIDI surface toggle', () => {
  beforeEach(() => {
    midiUiOpen.set(false);
    moduleTriggerSource.set({});
  });

  test('hiding MIDI returns every module to audio triggers', () => {
    setModuleTriggerSource('transition', 'midi');
    setModuleTriggerSource('leak', 'midi');
    setMidiUiOpen(true);
    expect(get(midiUiOpen)).toBe(true);
    expect(get(moduleTriggerSource).transition).toBe('midi');

    setMidiUiOpen(false);
    expect(get(midiUiOpen)).toBe(false);
    expect(get(moduleTriggerSource).transition).toBe('audio');
    expect(get(moduleTriggerSource).leak).toBe('audio');
  });
});
