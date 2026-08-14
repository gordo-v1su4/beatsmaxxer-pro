import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseMidi } from '$lib/audio/MidiParser';
import { analyseMidiTiming } from '$lib/stores/midiTiming';

/**
 * The readout against the real generated stems.
 *
 * Everything else about this feature was built and checked against parts
 * synthesised in a test, which can only confirm the analyser agrees with the
 * assumptions that produced them. These are the actual files, and they turned
 * out to break one of those assumptions: they carry a tempo MAP rather than a
 * fixed tempo, so measuring their seconds against a constant BPM reported every
 * part as loose regardless of where the notes were written.
 */
const STEMS = resolve('..', 'test_media/Redline (Remastered) Stems');
const available = existsSync(STEMS);
const midiFiles = available
  ? readdirSync(STEMS).filter((f) => /\.midi?$/i.test(f)).sort()
  : [];

function load(name: string) {
  const buf = readFileSync(`${STEMS}/${name}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const data = parseMidi(ab);
  return { name, notes: data.notes, duration: data.duration, ticksPerBeat: data.ticksPerBeat };
}

describe.skipIf(!available)('generated stems, as they actually arrive', () => {
  test('every part parses and carries both a time and a written beat', () => {
    expect(midiFiles.length).toBeGreaterThan(0);
    for (const file of midiFiles) {
      const part = load(file);
      expect(part.notes.length, file).toBeGreaterThan(0);
      for (const note of part.notes.slice(0, 50)) {
        expect(Number.isFinite(note.time), file).toBe(true);
        expect(Number.isFinite(note.beat), file).toBe(true);
        expect(note.beat, file).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('the parser leaves the performance where it was played', () => {
    // Notes must stay unsorted-away from their written positions and keep their
    // sub-grid offsets; snapping here would destroy the timing the parts exist
    // to carry.
    const part = load(midiFiles.find((f) => /Drums/i.test(f)) ?? midiFiles[0]);
    const offGrid = part.notes.filter((note) => {
      const sixteenths = (note.beat ?? 0) / 0.25;
      return Math.abs(sixteenths - Math.round(sixteenths)) > 0.02;
    });
    expect(offGrid.length).toBeGreaterThan(0);
  });

  test('these parts are transcribed, not quantised', () => {
    // The answer to what a generator hands over: the notes sit a few
    // milliseconds off every grid line, which is what audio-to-MIDI produces and
    // a sequenced part never does. If a future change starts reporting these as
    // quantised, the analyser has become too forgiving to be worth reading.
    const loose = midiFiles
      .map((f) => analyseMidiTiming(load(f), [], 125))
      .filter((profile) => !profile.quantised);
    expect(loose.length).toBeGreaterThanOrEqual(midiFiles.length - 1);
  });

  test('measuring in written beats beats measuring against a constant tempo', () => {
    // Same notes, same analyser; the only difference is whether the file's own
    // grid is used. Stripping `beat` forces the seconds path and the parts get
    // visibly looser, which is the tempo map showing through rather than
    // anything about the performance.
    const file = midiFiles.find((f) => /Percussion/i.test(f)) ?? midiFiles[0];
    const part = load(file);
    const written = analyseMidiTiming(part, [], 125);
    const secondsOnly = analyseMidiTiming(
      { ...part, notes: part.notes.map(({ time, note, velocity }) => ({ time, note, velocity })) },
      [],
      125
    );
    expect(written.onGridShare).toBeGreaterThan(secondsOnly.onGridShare);
  });
});
