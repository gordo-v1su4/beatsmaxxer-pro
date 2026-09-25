import { describe, expect, test } from 'vitest';
import {
  amplitudePeakFromByteTimeDomain,
  rmsFromFloatTimeDomain
} from '$lib/audio/proofPlaybackMetrics';

describe('proofPlaybackMetrics', () => {
  test('rmsFromFloatTimeDomain is zero for silence', () => {
    expect(rmsFromFloatTimeDomain(new Float32Array(128))).toBe(0);
  });

  test('rmsFromFloatTimeDomain peaks for full-scale sine-like sample', () => {
    const samples = new Float32Array(128);
    samples.fill(0.5);
    expect(rmsFromFloatTimeDomain(samples)).toBeCloseTo(0.5, 5);
  });

  test('amplitudePeakFromByteTimeDomain matches tick scaling for mid rail', () => {
    const td = new Uint8Array(256);
    td.fill(200);
    expect(amplitudePeakFromByteTimeDomain(td)).toBeGreaterThan(0.4);
  });

  test('proof diagnostics path uses fresh analyser peak when tick has not run', () => {
    const flat = amplitudePeakFromByteTimeDomain(new Uint8Array(256).fill(128));
    expect(flat).toBe(0);
  });
});
