import { describe, expect, test } from 'vitest';
import { analyseMidiTiming, formatMidiTiming } from '$lib/stores/midiTiming';
import type { MidiLayer } from '$lib/stores/rack';

const BPM = 120;
const SEC_PER_BEAT = 60 / BPM;

function part(beatPositions: number[], jitterSeconds: (i: number) => number = () => 0): MidiLayer {
  const notes = beatPositions.map((beat, i) => ({
    time: beat * SEC_PER_BEAT + jitterSeconds(i),
    note: 36,
    velocity: 100
  }));
  return { name: 'part.mid', notes, duration: notes[notes.length - 1]?.time ?? 0 };
}

/** Deterministic pseudo-jitter, so a "human" part is the same every run. */
function humanise(spreadSeconds: number) {
  return (i: number) => (Math.sin(i * 12.9898) * 43758.5453 % 1) * spreadSeconds;
}

describe('MIDI timing readout', () => {
  test('a sixteenth-note part reads as quantised to 1/16', () => {
    const beats = Array.from({ length: 64 }, (_, i) => i * 0.25);
    const profile = analyseMidiTiming(part(beats), [], BPM);

    expect(profile.grid).toBe('1/16');
    expect(profile.quantised).toBe(true);
    expect(profile.onGridShare).toBeCloseTo(1, 5);
    expect(profile.medianDeviationMs).toBeLessThan(1);
  });

  test('reports the FINEST grid that holds, not the coarsest', () => {
    // A sixteenth part also sits perfectly on quarters. Reporting the coarsest
    // fit would call a busy hat line a quarter-note part.
    const profile = analyseMidiTiming(
      part(Array.from({ length: 32 }, (_, i) => i * 0.25)),
      [],
      BPM
    );
    expect(profile.grid).toBe('1/16');
  });

  test('a played-in part reads as loose, not quantised', () => {
    const beats = Array.from({ length: 64 }, (_, i) => i * 0.5);
    // ~30ms of drag, well past what a sequencer would produce.
    const profile = analyseMidiTiming(part(beats, humanise(0.03)), [], BPM);

    expect(profile.quantised).toBe(false);
    expect(profile.onGridShare).toBeLessThan(0.9);
    expect(profile.medianDeviationMs).toBeGreaterThan(3);
  });

  test('a swung part is detected as swung, not as loose eighths', () => {
    // Triplet swing: off-beats two thirds of the way through each beat.
    const beats: number[] = [];
    for (let bar = 0; bar < 16; bar++) {
      beats.push(bar, bar + 2 / 3);
    }
    const profile = analyseMidiTiming(part(beats), [], BPM);

    expect(profile.swingRatio).not.toBeNull();
    expect(profile.swingRatio!).toBeGreaterThan(0.6);
    expect(profile.swingRatio!).toBeLessThan(0.72);
  });

  test('a straight part reports no meaningful swing', () => {
    const beats: number[] = [];
    for (let bar = 0; bar < 16; bar++) {
      beats.push(bar, bar + 0.5);
    }
    const profile = analyseMidiTiming(part(beats), [], BPM);
    // Either no reading, or one indistinguishable from halfway.
    expect(profile.swingRatio === null || Math.abs(profile.swingRatio - 0.5) < 0.04).toBe(true);
  });

  test('measures against the hosted beat grid when the track drifts', () => {
    // A track slowing from 120bpm: beats are not 60/bpm apart, so a part that
    // is dead on ITS grid would look sloppy measured against constant tempo.
    const grid: number[] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
      grid.push(t);
      t += SEC_PER_BEAT * (1 + i * 0.004);
    }
    const notes = grid.map((time) => ({ time, note: 36, velocity: 100 }));
    const layer: MidiLayer = { name: 'drift.mid', notes, duration: t };

    const onGrid = analyseMidiTiming(layer, grid, BPM);
    const onConstantTempo = analyseMidiTiming(layer, [], BPM);

    expect(onGrid.quantised).toBe(true);
    expect(onGrid.onGridShare).toBeGreaterThan(onConstantTempo.onGridShare);
  });

  test('empty and missing parts are handled rather than dividing by zero', () => {
    expect(analyseMidiTiming(null).noteCount).toBe(0);
    expect(analyseMidiTiming({ name: 'x', notes: [], duration: 0 }).noteCount).toBe(0);
    expect(formatMidiTiming(analyseMidiTiming(null))).toBe('no notes');
    expect(Number.isFinite(analyseMidiTiming(part([0, 1]), [], 0).medianDeviationMs)).toBe(true);
  });

  test('never mutates the part it is handed', () => {
    // The whole feature is read-only; rewriting note times would destroy the
    // song timing the part exists to carry.
    const layer = part([0, 0.5, 1, 1.5]);
    const before = JSON.stringify(layer);
    analyseMidiTiming(layer, [], BPM);
    expect(JSON.stringify(layer)).toBe(before);
  });

  test('formats a readable one-liner', () => {
    const tight = analyseMidiTiming(
      part(Array.from({ length: 32 }, (_, i) => i * 0.25)),
      [],
      BPM
    );
    expect(formatMidiTiming(tight)).toMatch(/^1\/16 · 100% · /);
  });
});
