import { derived, get, writable } from 'svelte/store';
import { parseMidi } from '$lib/audio/MidiParser';

/**
 * A trigger channel: one instrument's note times, taken from a stem's .mid.
 *
 * Separate from `midiLayers` in stores/rack, which is keyed by module id and
 * answers "what part is this effect playing to". A channel answers the earlier
 * question — "what is the drummer doing" — and is not bound to a slot, because
 * you pick the channel first and decide what it drives second.
 */
export interface MidiChannel {
  id: string;
  /** Instrument name, taken from the filename's trailing (Parens) when present. */
  name: string;
  /** Chord-collapsed onset times in seconds from song start. */
  onsets: number[];
  /** Every note time before collapsing — kept for the density readout. */
  noteCount: number;
  /** Time of the last note. Not the song length; a stem can stop early. */
  duration: number;
  /** First note. Backing vocals that enter at 115s should read as entering late. */
  firstOnset: number;
  color: string;
}

/**
 * Simultaneous notes are one hit.
 *
 * The Synth stem is 1445 notes with a median gap of zero — it is chords, and
 * drawing a tick per note paints a solid bar that says nothing. What a trigger
 * channel wants is attacks, so notes inside one window collapse to the first.
 * 25ms is below the shortest musical gap at any sane tempo (a 32nd at 200bpm is
 * 37ms) and above the few-millisecond spread of a strummed or humanised chord.
 */
const CHORD_WINDOW_SECONDS = 0.025;

export function collapseToOnsets(times: readonly number[]): number[] {
  const sorted = [...times].filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of sorted) {
    if (out.length === 0 || t - out[out.length - 1] > CHORD_WINDOW_SECONDS) out.push(t);
  }
  return out;
}

/**
 * Stem exports are named "Track (Instrument).mid". Fall back to the bare
 * filename so a hand-named part still gets a usable label.
 */
export function channelNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.mid[i]?$/i, '');
  const paren = base.match(/\(([^)]+)\)\s*$/);
  return (paren?.[1] ?? base).trim().toUpperCase();
}

/**
 * Fixed palette rather than per-channel hues pulled from the effect catalog:
 * these lanes sit under the cut lanes, and giving them the same saturated
 * colours as the effects made the dock read as confetti. One family, varied
 * only enough to tell eight lanes apart.
 */
const CHANNEL_COLORS = [
  '#5fb8ff',
  '#4fd6e8',
  '#7aa2ff',
  '#8f9dff',
  '#5eead4',
  '#9d7bff',
  '#67b7a4',
  '#a0b4ff'
];

export const midiChannels = writable<MidiChannel[]>([]);

/** Which channel the trigger lane and the FX trigger route are reading. */
export const activeChannelId = writable<string | null>(null);

export const activeChannel = derived(
  [midiChannels, activeChannelId],
  ([channels, id]) => channels.find((c) => c.id === id) ?? null
);

let channelSeq = 0;

export async function addMidiChannels(files: File[]): Promise<MidiChannel[]> {
  const added: MidiChannel[] = [];
  for (const file of files) {
    try {
      const data = parseMidi(await file.arrayBuffer());
      if (data.notes.length === 0) continue;
      const times = data.notes.map((n) => n.time);
      const onsets = collapseToOnsets(times);
      added.push({
        id: `midi-${channelSeq++}`,
        name: channelNameFromFile(file.name),
        onsets,
        noteCount: data.notes.length,
        duration: data.duration,
        firstOnset: onsets[0] ?? 0,
        color: CHANNEL_COLORS[channelSeq % CHANNEL_COLORS.length]
      });
    } catch (error) {
      console.error(`[midi] failed to parse ${file.name}:`, error);
    }
  }
  if (added.length === 0) return [];
  midiChannels.update((list) => [...list, ...added]);
  // Loading a part is an intent to use it; without this the lane stays empty
  // after an import and reads as a failed parse.
  if (get(activeChannelId) === null) activeChannelId.set(added[0].id);
  return added;
}

export function removeMidiChannel(id: string) {
  midiChannels.update((list) => list.filter((c) => c.id !== id));
  if (get(activeChannelId) === id) {
    activeChannelId.set(get(midiChannels)[0]?.id ?? null);
  }
}

export function clearMidiChannels() {
  midiChannels.set([]);
  activeChannelId.set(null);
}
