import { describe, expect, test } from 'vitest';
import { parseMidi } from '$lib/audio/MidiParser';
import { analyseMidiTiming } from '$lib/stores/midiTiming';

/**
 * Build a real Standard MIDI File in memory.
 *
 * The readout is only worth anything if it survives the actual parser, which is
 * the path a file dropped on the rack takes. Testing the analyser against
 * hand-made note arrays would skip tick-to-second conversion entirely — the one
 * step most likely to misplace a note.
 */
function buildMidi(noteTicks: number[], ticksPerBeat = 480): ArrayBuffer {
  const bytes: number[] = [];
  const push = (...v: number[]) => bytes.push(...v);
  const str = (s: string) => push(...[...s].map((c) => c.charCodeAt(0)));
  const u32 = (v: number) => push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const u16 = (v: number) => push((v >>> 8) & 255, v & 255);
  const varLen = (v: number) => {
    const out = [v & 0x7f];
    let rest = v >> 7;
    while (rest > 0) {
      out.unshift((rest & 0x7f) | 0x80);
      rest >>= 7;
    }
    push(...out);
  };

  str('MThd');
  u32(6);
  u16(0); // format 0
  u16(1); // one track
  u16(ticksPerBeat);

  const track: number[] = [];
  const tPush = (...v: number[]) => track.push(...v);
  const tVarLen = (v: number) => {
    const out = [v & 0x7f];
    let rest = v >> 7;
    while (rest > 0) {
      out.unshift((rest & 0x7f) | 0x80);
      rest >>= 7;
    }
    tPush(...out);
  };

  let lastTick = 0;
  for (const tick of noteTicks) {
    tVarLen(tick - lastTick);
    tPush(0x90, 36, 100); // note-on, kick, velocity 100
    lastTick = tick;
  }
  tVarLen(0);
  tPush(0xff, 0x2f, 0x00); // end of track

  str('MTrk');
  u32(track.length);
  push(...track);

  return new Uint8Array(bytes).buffer;
}

describe('MIDI parse into the timing readout', () => {
  test('a quantised file survives the parser and reads as quantised', () => {
    const ticksPerBeat = 480;
    // Sixteenths: every 120 ticks.
    const ticks = Array.from({ length: 64 }, (_, i) => i * (ticksPerBeat / 4));
    const data = parseMidi(buildMidi(ticks, ticksPerBeat));

    expect(data.ticksPerBeat).toBe(ticksPerBeat);
    expect(data.notes).toHaveLength(64);
    // No tempo event, so the parser's 120bpm default applies: 0.125s a sixteenth.
    expect(data.notes[1].time).toBeCloseTo(0.125, 4);

    const profile = analyseMidiTiming(
      { name: 'q.mid', notes: data.notes, duration: data.duration },
      [],
      120
    );
    expect(profile.grid).toBe('1/16');
    expect(profile.quantised).toBe(true);
  });

  test('a file left loose reads as loose through the same path', () => {
    const ticksPerBeat = 480;
    // Eighths dragged by a deterministic wobble of up to ~30 ticks (~30ms).
    const ticks = Array.from({ length: 64 }, (_, i) => {
      const drift = Math.round(Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 30);
      return i * (ticksPerBeat / 2) + drift;
    });
    const data = parseMidi(buildMidi(ticks, ticksPerBeat));

    const profile = analyseMidiTiming(
      { name: 'loose.mid', notes: data.notes, duration: data.duration },
      [],
      120
    );
    expect(profile.quantised).toBe(false);
    expect(profile.medianDeviationMs).toBeGreaterThan(2);
  });

  test('the parser leaves note times exactly where they were written', () => {
    // The whole feature depends on this: the parser must not snap anything, or
    // a part would lose the song timing it was loaded for.
    const ticksPerBeat = 96;
    const ticks = [0, 37, 101, 195]; // deliberately off any sane grid
    const data = parseMidi(buildMidi(ticks, ticksPerBeat));
    ticks.forEach((tick, i) => {
      expect(data.notes[i].time).toBeCloseTo((tick / ticksPerBeat) * 0.5, 6);
    });
  });
});
