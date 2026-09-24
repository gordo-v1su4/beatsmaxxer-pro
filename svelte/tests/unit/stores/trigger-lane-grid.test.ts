import { beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { analysisBeatGrid, analysisOnsets, syncAnalysisTriggers } from '$lib/stores/triggerLane';

vi.mock('$lib/audio', () => ({
  audioEngine: {
    getAnalysisOnsets: () => [1.2, 2.4],
    getBeatGrid: () => [1, 1.5, 2, 2.5],
  },
}));

describe('analysis trigger sync', () => {
  beforeEach(() => {
    analysisBeatGrid.set([]);
    analysisOnsets.set([]);
  });

  test('anchors beat grid and onsets to song time 0', () => {
    syncAnalysisTriggers(1);
    expect(get(analysisBeatGrid)[0]).toBeCloseTo(0, 8);
    expect(get(analysisOnsets)[0]).toBeCloseTo(0.2, 8);
    syncAnalysisTriggers(1);
    expect(get(analysisBeatGrid).length).toBe(4);
  });
});
