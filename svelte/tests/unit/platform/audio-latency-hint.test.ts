import { describe, expect, test } from 'vitest';
import { audioLatencyHint } from '$lib/platform/desktopPerformance';

/**
 * A phone needs a bigger output buffer than a laptop, not a smaller one.
 *
 * `'interactive'` is the Web Audio default, so the phone was always running the
 * smallest buffer the device would give — while the GPU competed for the same
 * CPU and thermal budget. That is heard as the track stuttering, worst when
 * SoundTouch refills its WSOLA window, which is exactly what moving TEMPO or
 * BPM makes it do.
 *
 * The reason this is a function taking a flag, rather than a constant, is that
 * the desktop build must not inherit the phone's trade.
 */
describe('audio latency hint', () => {
  test('a phone trades output latency for not dropping out', () => {
    expect(audioLatencyHint(true, 'web')).toBe('playback');
  });

  test('a desktop browser keeps the shortest path to the speaker', () => {
    expect(audioLatencyHint(false, 'web')).toBe('interactive');
  });

  test('the native shell is always interactive, phone flag or not', () => {
    // Tauri is a desktop machine by definition here; nothing should be able to
    // hand it a mobile compromise through this path.
    expect(audioLatencyHint(false, 'tauri')).toBe('interactive');
    expect(audioLatencyHint(true, 'tauri')).toBe('interactive');
  });
});
