import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { shouldAutoloadQaArrangerMidi, shouldAutoloadQaMidi } from '$lib/qa/loadQaMedia';
import { midiUiOpen, setMidiUiOpen } from '$lib/stores/rackUi';
import { moduleTriggerSource, setModuleTriggerSource } from '$lib/stores/midiTrigger';

describe('QA MIDI autoload', () => {
  test('does not load rack module parts unless qaMidi=1', () => {
    expect(shouldAutoloadQaMidi('?qa=1')).toBe(false);
    expect(shouldAutoloadQaMidi('?qa=1&qaAutoplay=1')).toBe(false);
  });

  test('opts in only with qaMidi=1', () => {
    expect(shouldAutoloadQaMidi('?qa=1&qaMidi=1')).toBe(true);
    expect(shouldAutoloadQaMidi('?qa=1&qaMidi=1&qaAutoplay=1')).toBe(true);
  });
});

describe('QA arranger MIDI autoload', () => {
  test('does not load arrangement stem lanes unless qaArrangerMidi=1', () => {
    expect(shouldAutoloadQaArrangerMidi('?qa=1')).toBe(false);
    expect(shouldAutoloadQaArrangerMidi('?qa=1&qaAutoplay=1')).toBe(false);
  });

  test('opts in only with qaArrangerMidi=1', () => {
    expect(shouldAutoloadQaArrangerMidi('?qa=1&qaArrangerMidi=1')).toBe(true);
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
