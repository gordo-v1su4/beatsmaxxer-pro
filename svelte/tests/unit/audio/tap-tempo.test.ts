import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from '$lib/audio/AudioEngine';

describe('AudioEngine tapTempo', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('locks BPM from tap intervals', () => {
    const engine = new AudioEngine();
    engine.tapTempo();
    now = 500;
    engine.tapTempo();

    const state = engine.getState();
    expect(state.bpm).toBe(120);
    expect(state.bpmLocked).toBe(true);
  });

  it('ignores taps older than 3 seconds', () => {
    const engine = new AudioEngine();
    engine.tapTempo();
    now = 4000;
    engine.tapTempo();

    expect(engine.getState().bpmLocked).toBe(false);
  });
});
