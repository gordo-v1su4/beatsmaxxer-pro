import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  arrangementMode,
  arrangementOverridden,
  backToArrangement,
  setArrangementMode,
} from '$lib/arrangement/transportMode';
import { sequencerArmed } from '$lib/stores/sequencer';
import { arrangementRecording } from '$lib/stores/arrangement';

describe('arrangement transport modes (Ableton model)', () => {
  beforeEach(() => setArrangementMode('live', 0));

  test('LIVE drives nothing and records nothing', () => {
    expect(get(arrangementMode)).toBe('live');
    expect(get(sequencerArmed)).toBe(false);
    expect(get(arrangementRecording)).toBe(false);
  });

  test('PLAY arms the timeline; REC arms it and records', () => {
    setArrangementMode('play', 0);
    expect(get(sequencerArmed)).toBe(true);
    expect(get(arrangementRecording)).toBe(false);
    setArrangementMode('rec', 1);
    expect(get(arrangementMode)).toBe('rec');
    expect(get(sequencerArmed)).toBe(true);
    setArrangementMode('live', 2);
    expect(get(arrangementRecording)).toBe(false);
    expect(get(sequencerArmed)).toBe(false);
  });

  test('flags set directly (QA gates) still read as a mode', () => {
    sequencerArmed.set(true);
    expect(get(arrangementMode)).toBe('play');
  });

  test('changing mode or BACK TO ARRANGEMENT clears an override', () => {
    setArrangementMode('play', 0);
    arrangementOverridden.set(true);
    backToArrangement();
    expect(get(arrangementOverridden)).toBe(false);
    arrangementOverridden.set(true);
    setArrangementMode('rec', 0);
    expect(get(arrangementOverridden)).toBe(false);
  });
});
