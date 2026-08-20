import { describe, expect, test } from 'vitest';
import { evaluateSmokeGate } from '$lib/qa/smokeGate';

describe('evaluateSmokeGate', () => {
  test('accepts a truthful Redline smoke snapshot', () => {
    const result = evaluateSmokeGate({
      snapshot: {
        webgpu: true,
        bpm: 125,
        clipsLoaded: 10,
        usingUploadedTrack: true,
        trackName: 'redline/Redline (Remastered).wav',
        modules: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`top-${index}`, { hasReadyFrame: true }])),
        render: {
          pgm: { samplePath: 'external-texture', hasVideo: 1, source: 'blob:clip' }
        }
      },
      videoDelta: 0.5
    });
    expect(result).toEqual({ passed: true, blockers: [] });
  });

  test('accepts playback observation even when transient frame readiness drops', () => {
    const result = evaluateSmokeGate({
      snapshot: {
        webgpu: true,
        bpm: 125,
        clipsLoaded: 6,
        usingUploadedTrack: true,
        trackName: 'redline/Redline (Remastered).wav',
        modules: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
          `mod-${index}`,
          { hasReadyFrame: index < 6, currentTime: index < 6 ? 8.2 : 0 }
        ])),
        render: {
          pgm: { samplePath: 'external-texture', hasVideo: 1, source: 'blob:clip' }
        }
      },
      videoDelta: 1.5
    });
    expect(result).toEqual({ passed: true, blockers: [] });
  });

  test('fails closed on webgpu false, BPM mismatch, and test-card fallback', () => {
    const result = evaluateSmokeGate({
      snapshot: {
        webgpu: false,
        bpm: 128,
        clipsLoaded: 10,
        usingUploadedTrack: true,
        trackName: 'redline/Redline (Remastered).wav',
        modules: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`top-${index}`, { hasReadyFrame: true }])),
        render: {
          pgm: { samplePath: 'test-card', hasVideo: 1, source: null }
        }
      },
      videoDelta: 0.01
    });
    expect(result.blockers).toEqual([
      'WebGPU is false or unavailable in smoke snapshot',
      'Redline BPM mismatch: expected 125',
      'video did not advance during smoke observation',
      'synthetic or missing video sample on loaded slot: pgm'
    ]);
  });
});
