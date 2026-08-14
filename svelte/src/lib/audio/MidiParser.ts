/**
 * Lightweight Standard MIDI File parser
 *
 * Extracts note-on events with absolute timestamps (in seconds)
 * from .mid files.  Only reads enough to get note timing —
 * we don't need aftertouch, controllers, etc.
 */

export interface MidiNote {
  /** Absolute time in seconds from song start */
  time: number;
  /**
   * Position on the FILE's own musical grid, in beats (tick / ticksPerBeat).
   *
   * Carried alongside the seconds because the two answer different questions.
   * Seconds are where the note plays; beats are where it was written. A file
   * with a tempo map -- and audio-to-MIDI transcription emits one, drifting
   * every bar -- has notes whose second-positions look scattered against any
   * constant BPM while sitting exactly where they were placed musically.
   * Reading "was this quantised" off the seconds therefore answers a question
   * about the tempo map instead of about the notes.
   */
  beat: number;
  /** MIDI note number 0-127 */
  note: number;
  /** Velocity 0-127 (0 = note-off by convention) */
  velocity: number;
  /** Track index the note came from */
  track: number;
}

export interface MidiData {
  notes: MidiNote[];
  /** Total duration in seconds (time of last event) */
  duration: number;
  /** Ticks per quarter note from the header */
  ticksPerBeat: number;
}

/* ------------------------------------------------------------------ */

class Reader {
  private view: DataView;
  pos = 0;
  constructor(private buf: ArrayBuffer) {
    this.view = new DataView(buf);
  }
  read8() { return this.view.getUint8(this.pos++); }
  read16() { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  read32() { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
  readStr(n: number) {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.read8());
    return s;
  }
  readVarLen(): number {
    let v = 0;
    for (;;) {
      const b = this.read8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
  }
  slice(n: number) {
    const s = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
}

export function parseMidi(buffer: ArrayBuffer): MidiData {
  const r = new Reader(buffer);

  // --- MThd ---
  const headerTag = r.readStr(4);
  if (headerTag !== 'MThd') throw new Error('Not a MIDI file');
  r.read32(); // header length (always 6)
  r.read16(); // format (0, 1, or 2)
  const numTracks = r.read16();
  const ticksPerBeat = r.read16();

  const notes: MidiNote[] = [];

  // Build a tempo map from all tracks first, then convert
  // For simplicity we'll do a single pass collecting tempo + note events with tick times
  // then convert ticks → seconds with the tempo map.

  interface RawEvent { tick: number; type: 'note'; note: number; velocity: number; track: number }
  interface TempoEvent { tick: number; type: 'tempo'; usPerBeat: number }
  type Event = RawEvent | TempoEvent;

  const events: Event[] = [];

  for (let t = 0; t < numTracks; t++) {
    const chunkTag = r.readStr(4);
    if (chunkTag !== 'MTrk') {
      // skip unknown chunk
      const len = r.read32();
      r.pos += len;
      continue;
    }
    const chunkLen = r.read32();
    const chunkEnd = r.pos + chunkLen;

    let tick = 0;
    let runningStatus = 0;

    while (r.pos < chunkEnd) {
      const delta = r.readVarLen();
      tick += delta;

      let status = r.read8();
      if (status < 0x80) {
        // running status — put the byte back
        r.pos--;
        status = runningStatus;
      } else {
        if (status < 0xf0) runningStatus = status;
      }

      const cmd = status & 0xf0;

      if (cmd === 0x90) {
        // Note On
        const note = r.read8();
        const vel = r.read8();
        events.push({ tick, type: 'note', note, velocity: vel, track: t });
      } else if (cmd === 0x80) {
        // Note Off — skip
        r.read8(); r.read8();
      } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
        // Aftertouch / CC / Pitch bend — 2 data bytes
        r.read8(); r.read8();
      } else if (cmd === 0xc0 || cmd === 0xd0) {
        // Program change / Channel pressure — 1 data byte
        r.read8();
      } else if (status === 0xff) {
        // Meta event
        const metaType = r.read8();
        const len = r.readVarLen();
        if (metaType === 0x51 && len === 3) {
          // Tempo
          const b0 = r.read8();
          const b1 = r.read8();
          const b2 = r.read8();
          const usPerBeat = (b0 << 16) | (b1 << 8) | b2;
          events.push({ tick, type: 'tempo', usPerBeat });
        } else {
          r.pos += len;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        const len = r.readVarLen();
        r.pos += len;
      }
      // else: unknown, skip
    }

    r.pos = chunkEnd; // ensure alignment
  }

  // Sort all events by tick
  events.sort((a, b) => a.tick - b.tick);

  // Build tempo map and convert ticks → seconds
  let currentTempo = 500_000; // default 120 BPM
  let lastTempoTick = 0;
  let lastTempoTime = 0; // seconds at lastTempoTick

  function tickToSec(tick: number): number {
    return lastTempoTime + ((tick - lastTempoTick) / ticksPerBeat) * (currentTempo / 1_000_000);
  }

  let maxTime = 0;

  for (const ev of events) {
    if (ev.type === 'tempo') {
      // Update tempo map checkpoint before changing tempo
      lastTempoTime = tickToSec(ev.tick);
      lastTempoTick = ev.tick;
      currentTempo = ev.usPerBeat;
    } else if (ev.type === 'note' && ev.velocity > 0) {
      const time = tickToSec(ev.tick);
      notes.push({
        time,
        beat: ev.tick / ticksPerBeat,
        note: ev.note,
        velocity: ev.velocity,
        track: ev.track
      });
      if (time > maxTime) maxTime = time;
    }
  }

  // Sort notes by time
  notes.sort((a, b) => a.time - b.time);

  return {
    notes,
    duration: maxTime,
    ticksPerBeat,
  };
}
