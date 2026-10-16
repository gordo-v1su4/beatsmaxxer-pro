import { expect, test, vi } from 'vitest';
import { AudioEngine } from '$lib/audio/AudioEngine';
import * as essentia from '$lib/audio/essentia';
import { resetArrangement } from '$lib/stores/arrangement';

test.each(['success', 'failure'])('late hosted analysis %s cannot overwrite restored rhythm and audio controls', async outcome => {
  let finish!: (value: any) => void, fail!: (reason: Error) => void;
  const pending = new Promise<any>((resolve, reject) => { finish = resolve; fail = reject; });
  const request = vi.spyOn(essentia, 'fetchEssentiaRhythmAnalysis').mockReturnValue(pending);
  const engine = new AudioEngine();
  Object.assign(engine, { ctx: { state: 'running', currentTime: 0 }, gainNode: { gain: { value: 1 } } });
  vi.spyOn(engine as any, 'ensureContext').mockResolvedValue(undefined);
  vi.spyOn(engine as any, 'attachMediaElement').mockImplementation(() => {});
  vi.spyOn(engine as any, 'disposeMediaElement').mockImplementation(() => {});
  vi.spyOn(engine, 'stop').mockImplementation(() => {});
  try {
    const loading = engine.loadAudioFile(new File(['song'], 'custom.mp3'), { hostedAnalysis: true });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(engine.getState().analysisStatus).toBe('analyzing');
    const generation = engine.getUploadedTrackLoadGeneration();
    engine.cancelPendingAnalysis();
    expect(engine.getState().analysisStatus).toBe('fallback');
    engine.applyPreparedRhythm({ bpm: 125.39, beats: [0, .4785, .957], onsets: [1, 2], duration: 30, keyIndex: 7 });
    engine.setTempo(1.35); engine.setPitch(2); engine.nudgeKey(-3);
    const before = engine.getSoundTouchState();
    if (outcome === 'success') finish({ bpm: 90, beats: [0, 1, 2], onsets: [], duration: 30, keyIndex: 0, confidence: 1 });
    else fail(new Error('late analysis failure'));
    await loading;
    expect(engine.getSoundTouchState()).toEqual(before);
    expect(engine.getAnalysisBpm()).toBe(125.39);
    expect(engine.getBeatGrid()).toEqual([0, .4785, .957]);
    expect(engine.getState().analysisStatus).toBe('ready');
    expect(engine.getUploadedTrackLoadGeneration()).toBe(generation);
  } finally {
    URL.revokeObjectURL((engine as any).objectUrl);
    Object.assign(engine, { ctx: null, gainNode: null });
    await engine.dispose(); vi.restoreAllMocks(); resetArrangement();
  }
});
