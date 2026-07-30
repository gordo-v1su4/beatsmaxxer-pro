import { describe, expect, test } from 'vitest';
import type { TransportSample } from '$lib/transport';
import { LiveScheduleRuntime } from '$lib/timesampler/integration';

function transport(beatPosition: number): TransportSample {
  return {
    transportSeconds: beatPosition * 0.5,
    audioOutputTimeSeconds: beatPosition * 0.5,
    performanceTimeSeconds: beatPosition * 0.5,
    presentationTimeSeconds: beatPosition * 0.5,
    playing: true,
    discontinuityGeneration: 0,
    beatPosition,
    beatPhase: beatPosition - Math.floor(beatPosition),
    beatIntervalSeconds: 0.5,
    beatIndex: Math.floor(beatPosition),
    source: 'bpm-fallback',
    fallbackReason: null,
    transportSecondsAtBeat: (beat) => beat * 0.5
  };
}

describe('PGM stress — fast RAND 1BT swing', () => {
  const sources = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

  test('32 beat boundaries produce 32 cuts without lagging behind', () => {
    const runtime = new LiveScheduleRuntime<string>(0xcafebabe);
    runtime.configurePgm({
      active: 'm1',
      sources,
      queued: null,
      autoRandom: true,
      intervalBeats: 1,
      feel: 1
    });
    runtime.advance(transport(0), []);

    let cuts = 0;
    let active = 'm1';
    for (let beat = 0.01; beat <= 32; beat += 0.01) {
      runtime.configurePgm({
        active,
        sources,
        queued: null,
        autoRandom: true,
        intervalBeats: 1,
        feel: 1
      });
      const frame = runtime.advance(transport(beat), []);
      if (frame.pgm.selected !== null) {
        cuts += 1;
        active = frame.pgm.selected;
      }
    }

    expect(cuts).toBeGreaterThanOrEqual(20);
    expect(cuts).toBeLessThanOrEqual(35);
  });

  test('queued cut wins on next boundary even during fast RAND', () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configurePgm({
      active: 'm1',
      sources,
      queued: 'm8',
      autoRandom: true,
      intervalBeats: 1,
      feel: 0
    });
    runtime.advance(transport(0), []);
    const cut = runtime.advance(transport(1), []);
    expect(cut.pgm.selected).toBe('m8');
    expect(cut.pgm.consumedQueued).toBe(true);
  });

  test('sparse sampling still lands every 1BT boundary', () => {
    const runtime = new LiveScheduleRuntime<string>(0x1234);
    runtime.configurePgm({
      active: 'm1',
      sources,
      queued: null,
      autoRandom: true,
      intervalBeats: 1,
      feel: 0
    });
    runtime.advance(transport(0), []);

    const boundaries = [1, 2, 3, 4, 5, 6, 7, 8];
    let active = 'm1';
    const selections: string[] = [];
    for (const beat of boundaries) {
      runtime.configurePgm({
        active,
        sources,
        queued: null,
        autoRandom: true,
        intervalBeats: 1,
        feel: 0
      });
      const frame = runtime.advance(transport(beat), []);
      if (frame.pgm.selected) {
        selections.push(frame.pgm.selected);
        active = frame.pgm.selected;
      }
    }
    expect(selections).toHaveLength(8);
    expect(new Set(selections).size).toBeGreaterThan(1);
  });
});
