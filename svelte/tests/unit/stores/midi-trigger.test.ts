import { describe, expect, test } from 'vitest';
import {
  firingNotes,
  firingTimes,
  lastTriggerTime,
  noteFires,
  noteIsHighlighted,
  triggerAgeBeats
} from '$lib/stores/midiTrigger';
import type { MidiLayer } from '$lib/stores/rack';

function layer(times: number[], velocity = 100): MidiLayer {
  return {
    name: 'part.mid',
    notes: times.map((time) => ({ time, note: 60, velocity })),
    duration: times[times.length - 1] ?? 0
  };
}

describe('MIDI trigger source', () => {
  test('DENSITY thins the part deterministically', () => {
    const part = layer(Array.from({ length: 200 }, (_, i) => i * 0.25));
    const first = firingTimes(part, 0.4);
    const second = firingTimes(part, 0.4);

    // Same notes every pass: a section that comes round twice has to perform
    // the same way, or the rack is unrepeatable.
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(part.notes.length);
  });

  test('DENSITY 100 keeps everything and 0 keeps nothing', () => {
    const part = layer([0, 1, 2, 3, 4]);
    expect(firingTimes(part, 1)).toHaveLength(5);
    expect(firingTimes(part, 0)).toHaveLength(0);
  });

  test('thinning keeps more of the part as DENSITY rises', () => {
    const part = layer(Array.from({ length: 400 }, (_, i) => i * 0.125));
    const counts = [0.2, 0.5, 0.8].map((d) => firingTimes(part, d).length);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  test('accents survive deeper thinning than ghost notes', () => {
    const times = Array.from({ length: 300 }, (_, i) => i * 0.25);
    const loud = firingTimes(layer(times, 127), 0.35).length;
    const quiet = firingTimes(layer(times, 20), 0.35).length;
    expect(loud).toBeGreaterThan(quiet);
  });

  test('a single note is kept or dropped consistently for its index', () => {
    const a = noteFires(17, 100, 0.5);
    const b = noteFires(17, 100, 0.5);
    expect(a).toBe(b);
  });

  test('trigger age is beats since the last firing note', () => {
    // 120bpm: one beat is 0.5s.
    expect(triggerAgeBeats([0, 1, 2], 1.25, 120)).toBeCloseTo(0.5, 5);
    expect(triggerAgeBeats([0, 1, 2], 2.0, 120)).toBeCloseTo(0, 5);
    expect(triggerAgeBeats([0, 1, 2], 5.0, 120)).toBeCloseTo(6, 5);
  });

  test('returns -1 before the first note and for an empty part', () => {
    // -1 is what the shader reads as "follow the transport's beat grid", so a
    // module must not be pinned to a stale pulse before the part starts.
    expect(triggerAgeBeats([4, 5], 1.0, 120)).toBe(-1);
    expect(triggerAgeBeats([], 1.0, 120)).toBe(-1);
    expect(firingTimes(null, 1)).toEqual([]);
  });

  test('finds the most recent kept note in absolute song time', () => {
    expect(lastTriggerTime([0.25, 1, 3], 0.1)).toBeNull();
    expect(lastTriggerTime([0.25, 1, 3], 1)).toBe(1);
    expect(lastTriggerTime([0.25, 1, 3], 20)).toBe(3);
  });

  test('falls back to 120bpm rather than dividing by zero', () => {
    expect(Number.isFinite(triggerAgeBeats([0], 1, 0))).toBe(true);
    expect(triggerAgeBeats([0], 1, 0)).toBeCloseTo(2, 5);
  });

  test('firing times come back sorted for a part written out of order', () => {
    const part = layer([3, 0, 2, 1]);
    const times = firingTimes(part, 1);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test('uses absolute song time and pause suppresses highlights', () => {
    expect(noteIsHighlighted(0.25, 0.25, 2, true)).toBe(true);
    expect(noteIsHighlighted(0.25, 2.25, 2, true)).toBe(false);
    expect(noteIsHighlighted(0.25, 0.25, 2, false)).toBe(false);
  });

  test('the canonical subset preserves original note identity for every consumer', () => {
    const part = layer([3, 0, 2, 1]);
    const kept = firingNotes(part, 0.6);
    expect(kept.map(({ note }) => note.time)).toEqual(firingTimes(part, 0.6));
    expect(kept.every(({ note, index }) => note === part.notes[index])).toBe(true);
  });
});
