import { describe, expect, test } from 'vitest';
import { isRhythmAnalysisReady } from '$lib/audio/AudioEngine';

describe('isRhythmAnalysisReady', () => {
  test('allows playback when no uploaded track is loaded', () => {
    expect(isRhythmAnalysisReady(false, 'idle')).toBe(true);
    expect(isRhythmAnalysisReady(false, 'analyzing')).toBe(true);
  });

  test('blocks uploaded playback while Essentia analysis is in flight', () => {
    expect(isRhythmAnalysisReady(true, 'analyzing')).toBe(false);
    expect(isRhythmAnalysisReady(true, 'idle')).toBe(false);
  });

  test('allows uploaded playback once analysis settles', () => {
    expect(isRhythmAnalysisReady(true, 'ready')).toBe(true);
    expect(isRhythmAnalysisReady(true, 'fallback')).toBe(true);
    expect(isRhythmAnalysisReady(true, 'error')).toBe(true);
  });
});
