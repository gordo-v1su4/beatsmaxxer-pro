import { describe, expect, test } from 'vitest';
import { grooveSegment, nextGrooveBeat } from '$lib/runtime/groove';
import { nextQuantizedBeat } from '$lib/timesampler/integration';

describe('rack groove', () => {
  test('straight is an even grid', () => {
    expect(nextGrooveBeat(0, 1, 0)).toBeCloseTo(1, 6);
    expect(nextGrooveBeat(0.5, 1, 0)).toBeCloseTo(1, 6);
    expect(nextGrooveBeat(3.2, 4, 0)).toBeCloseTo(4, 6);
  });

  test('swing splits each pair 2:1, not the whole grid', () => {
    // One beat of swing: the first hit of the pair lands at 4/3, the second at
    // 2. That 2:1 ratio is what a sequencer calls 66% swing.
    expect(nextGrooveBeat(0, 1, 1)).toBeCloseTo(4 / 3, 6);
    expect(nextGrooveBeat(1.5, 1, 1)).toBeCloseTo(2, 6);
    // The pair repeats, so the grid does not drift away from the bar.
    expect(nextGrooveBeat(2, 1, 1)).toBeCloseTo(2 + 4 / 3, 6);
  });

  test('swing segments have unequal lengths that sum to the pair', () => {
    const long = grooveSegment(0.2, 1, 1);
    const short = grooveSegment(1.7, 1, 1);
    expect(long.length).toBeCloseTo(4 / 3, 6);
    expect(short.length).toBeCloseTo(2 / 3, 6);
    expect(long.length + short.length).toBeCloseTo(2, 6);
  });

  test('dotted walks against the bar at 1.5x', () => {
    expect(nextGrooveBeat(0, 1, 2)).toBeCloseTo(1.5, 6);
    expect(nextGrooveBeat(1.6, 1, 2)).toBeCloseTo(3, 6);
  });

  test('progress runs 0 to 1 across every segment, whatever its length', () => {
    for (const feel of [0, 1, 2] as const) {
      for (const beat of [0, 0.3, 1.1, 2.7, 5.9]) {
        const seg = grooveSegment(beat, 1, feel);
        expect(seg.progress).toBeGreaterThanOrEqual(0);
        expect(seg.progress).toBeLessThan(1);
        expect(seg.start).toBeLessThanOrEqual(beat);
        expect(seg.start + seg.length).toBeGreaterThan(beat);
      }
    }
  });

  test('nextGrooveBeat is exactly the end of the current segment', () => {
    // The two used to be written separately and drifted apart; deriving one
    // from the other is what stops that happening again.
    for (const feel of [0, 1, 2] as const) {
      for (const beat of [0, 0.75, 2.4, 6.1]) {
        const seg = grooveSegment(beat, 1, feel);
        expect(nextGrooveBeat(beat, 1, feel)).toBeCloseTo(seg.start + seg.length, 6);
      }
    }
  });

  test('PGM cut boundaries still agree with the shared groove', () => {
    // nextQuantizedBeat was the reference this was extracted from, so any
    // divergence means the extraction changed PGM cut timing.
    for (const feel of [0, 1, 2] as const) {
      for (const interval of [1, 2, 4, 8]) {
        for (const beat of [0, 0.9, 3.3, 7.75, 12.2]) {
          expect(nextQuantizedBeat(beat, interval, feel)).toBeCloseTo(
            nextGrooveBeat(beat, interval, feel),
            6
          );
        }
      }
    }
  });

  test('guards a zero or negative interval instead of dividing by it', () => {
    expect(Number.isFinite(nextGrooveBeat(1, 0, 0))).toBe(true);
    expect(Number.isFinite(nextGrooveBeat(1, -4, 1))).toBe(true);
    expect(Number.isFinite(grooveSegment(-3, 1, 2).progress)).toBe(true);
  });

  test('boundaries always advance', () => {
    for (const feel of [0, 1, 2] as const) {
      let beat = 0;
      for (let i = 0; i < 24; i++) {
        const next = nextGrooveBeat(beat, 1, feel);
        expect(next).toBeGreaterThan(beat);
        beat = next;
      }
    }
  });
});
