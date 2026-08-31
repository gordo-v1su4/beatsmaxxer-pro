import { describe, expect, test } from 'vitest';
import {
  advanceLiveOnsetStutter,
  audioStutterTriggerAge,
  firingOnsetTimes,
  lastFiringOnsetTime,
  mergeStutterTriggerAge,
  stutterDivisionProgress,
  stutterInFreezePhase,
  stutterLenBeats,
  stutterTriggerWindowBeats
} from '$lib/runtime/stutterTrigger';

describe('stutterTrigger', () => {
  test('stutterLenBeats matches shader zones', () => {
    expect(stutterLenBeats(10)).toBe(0.125);
    expect(stutterLenBeats(70)).toBe(0.5);
    expect(stutterLenBeats(90)).toBe(1);
  });

  test('trigger window is shorter than bar grid length', () => {
    expect(stutterTriggerWindowBeats(90, 100)).toBeLessThan(stutterLenBeats(90));
    expect(stutterTriggerWindowBeats(10, 100)).toBeLessThanOrEqual(0.125);
  });

  test('analysis onsets produce beat age after a hit', () => {
    const onsets = [0, 0.5, 1.0, 1.5];
    const age = audioStutterTriggerAge(
      {
        beatPosition: 2.5,
        positionSeconds: 1.2,
        bpm: 120,
        playbackRate: 1,
        playing: true
      },
      onsets,
      [],
      1
    );
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(1);
  });

  test('density thins onset list', () => {
    const dense = firingOnsetTimes([0, 0.1, 0.2, 0.3, 0.4], 0.2);
    expect(dense.length).toBeLessThan(5);
    expect(firingOnsetTimes([0, 0.1, 0.2], 1)).toHaveLength(3);
  });

  test('finds the latest density-kept onset without materializing the filtered list', () => {
    const onsets = Array.from({ length: 128 }, (_, index) => index * 0.125);
    for (const density of [0, 0.2, 0.55, 1]) {
      for (const seconds of [0, 1.1, 7.75, 30]) {
        const expected = firingOnsetTimes(onsets, density).filter((time) => time <= seconds).at(-1);
        expect(lastFiringOnsetTime(onsets, seconds, density)).toBe(expected ?? null);
      }
    }
  });

  test('live onset stutter arms on rising flux', () => {
    const first = advanceLiveOnsetStutter(null, 0.05, 4, true, 0.125);
    expect(first.age).toBeNull();

    const strike = advanceLiveOnsetStutter(first.state, 0.35, 4.02, true, 0.125);
    expect(strike.age).toBe(0);
    expect(strike.state.armed).toBe(true);

    const mid = advanceLiveOnsetStutter(strike.state, 0.2, 4.06, true, 0.125);
    expect(mid.age).toBeCloseTo(0.04, 2);
  });

  test('merge prefers MIDI then freshest onset age', () => {
    expect(mergeStutterTriggerAge(0.2, undefined, 0.8, 0.1)).toBe(0.2);
    expect(mergeStutterTriggerAge(-1, 0.3, 0.8, 0.1)).toBe(0.3);
    expect(mergeStutterTriggerAge(undefined, undefined, 0.8, 0.1)).toBe(0.1);
    expect(mergeStutterTriggerAge(undefined, undefined, -1, -1)).toBe(-1);
  });

  test('freeze phase sits between capture and release', () => {
    const params = { time: 70, gate: 70, feedback: 92 };
    expect(stutterInFreezePhase(0.04, params, true)).toBe(false);
    expect(stutterInFreezePhase(0.2, params, true)).toBe(true);
    expect(stutterInFreezePhase(0.95, params, true)).toBe(false);
    expect(stutterInFreezePhase(0.2, params, false)).toBe(false);
  });

  test('trigger age uses a shorter window than the bar grid', () => {
    const params = { time: 90, gate: 100, feel: 0 };
    const window = stutterTriggerWindowBeats(90, 100);
    expect(window).toBeLessThan(stutterLenBeats(90));
    expect(stutterDivisionProgress(0, params, window)).toBeCloseTo(1, 5);
    expect(stutterDivisionProgress(10.2, params, -1)).toBeLessThan(1);
  });
});
