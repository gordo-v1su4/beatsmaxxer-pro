import { describe, expect, test } from 'vitest';
import {
  crossedSequencerSteps,
  MAX_REPLAYED_SEQUENCER_STEPS
} from '$lib/stores/sequencer';

/**
 * A backgrounded phone keeps advancing the transport on the AudioContext clock
 * while nothing renders, so the first frame back reports a gap of every step
 * that elapsed while the screen was off. Replaying them all allocated two
 * arrays that long and fired one PGM cut and one decode prewarm per step into a
 * single frame.
 */
describe('sequencer step catch-up', () => {
  test('replays a gap the size of a real frame drop', () => {
    // 8 steps: two beats behind, which a GC pause or a slow frame can produce.
    const crossed = crossedSequencerSteps(100, (100 + 8) / 4);
    expect(crossed.absoluteSteps).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
    expect(crossed.currentAbsoluteStep).toBe(108);
  });

  test('replays a gap exactly at the bound', () => {
    const previous = 100;
    const target = previous + MAX_REPLAYED_SEQUENCER_STEPS;
    const crossed = crossedSequencerSteps(previous, target / 4);
    expect(crossed.absoluteSteps).toHaveLength(MAX_REPLAYED_SEQUENCER_STEPS);
    expect(crossed.absoluteSteps.at(-1)).toBe(target);
  });

  test('lands on the current step instead of replaying a backgrounded run', () => {
    // Five minutes at 128bpm is roughly 2560 sixteenths.
    const previous = 100;
    const target = previous + 2560;
    const crossed = crossedSequencerSteps(previous, target / 4);

    expect(crossed.absoluteSteps).toEqual([target]);
    expect(crossed.steps).toEqual([target % 16]);
    // The playhead still ends up where the transport actually is — the cap
    // skips the replay, it does not lose the position.
    expect(crossed.currentAbsoluteStep).toBe(target);
  });

  test('a skipped catch-up still reports the bar-relative step', () => {
    const crossed = crossedSequencerSteps(0, 1000);
    expect(crossed.steps[0]).toBe(crossed.currentAbsoluteStep % 16);
    expect(crossed.steps).toHaveLength(1);
  });
});
