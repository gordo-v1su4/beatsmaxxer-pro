import { derived, get, writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { midiLayers } from '$lib/stores/rack';
import { ARRANGEMENT_STEPS } from '$lib/stores/arrangement';

/**
 * What fires the rack: the track itself, or a MIDI part.
 *
 * Onset triggering reacts to whatever the mix is doing, which is right until the
 * mix is dense — then everything is an onset and the rack fires constantly. A
 * MIDI part is the escape hatch: pick one instrument and let its notes be the
 * trigger, so a busy section can still cut on the kick alone.
 */
export type TriggerSource = 'audio' | 'midi';
export const triggerSource = writable<TriggerSource>('audio');

/** Which module's MIDI layer feeds the lane when the source is MIDI. */
export const triggerMidiModule = writable<string | null>(null);

/**
 * Onset times in transport seconds, mirrored out of the engine.
 *
 * The engine owns the array; this store holds the copy the UI draws from. Kept
 * in sync by generation counter rather than by polling the array, which is
 * thousands of numbers on a full track.
 */
export const analysisOnsets = writable<readonly number[]>([]);
export const analysisBeatGrid = writable<readonly number[]>([]);

let lastOnsetGeneration = -1;

/** Called from the transport poll — cheap unless the generation moved. */
export function syncAnalysisTriggers(onsetGeneration: number) {
  if (onsetGeneration === lastOnsetGeneration) return;
  lastOnsetGeneration = onsetGeneration;
  analysisOnsets.set([...audioEngine.getAnalysisOnsets()]);
  analysisBeatGrid.set([...audioEngine.getBeatGrid()]);
}

/**
 * Seconds to a fractional beat position, using the hosted grid when there is
 * one and constant BPM otherwise.
 *
 * The grid is the honest conversion: a track that drifts has beats that are not
 * `60/bpm` apart, and quantizing its onsets against a constant tempo smears
 * every hit in the back half of the song into the wrong sixteenth.
 */
function beatAt(seconds: number, grid: readonly number[], bpm: number): number {
  if (grid.length < 2) return (seconds * bpm) / 60;
  if (seconds <= grid[0]) {
    const span = grid[1] - grid[0];
    return span > 0 ? (seconds - grid[0]) / span : 0;
  }
  const last = grid.length - 1;
  if (seconds >= grid[last]) {
    const span = grid[last] - grid[last - 1];
    return span > 0 ? last + (seconds - grid[last]) / span : last;
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] <= seconds) lo = mid;
    else hi = mid;
  }
  const span = grid[hi] - grid[lo];
  return span > 0 ? lo + (seconds - grid[lo]) / span : lo;
}

export interface TriggerProfile {
  /** Per-sixteenth share of the track's hits, 0–1, peak-normalised. */
  density: number[];
  /** Raw hit count per sixteenth, for the readout. */
  counts: number[];
  /** Total events behind the profile. Zero means nothing to draw. */
  total: number;
  source: TriggerSource;
  /** Set when the source is MIDI but the chosen module has no part loaded. */
  missing: boolean;
}

const EMPTY_PROFILE: TriggerProfile = {
  density: Array.from({ length: ARRANGEMENT_STEPS }, () => 0),
  counts: Array.from({ length: ARRANGEMENT_STEPS }, () => 0),
  total: 0,
  source: 'audio',
  missing: false
};

/**
 * Fold every trigger event onto the sixteen steps of a bar.
 *
 * Which notes they are does not matter here — only where in the bar they land.
 * A track that puts its hits on 1, 5, 9 and 13 lights four cells; one that
 * plays sixteenths lights all of them, and that difference is the whole point:
 * it says at a glance whether triggering off this source will read as an
 * accent or as a strobe.
 */
function buildProfile(
  times: readonly number[],
  grid: readonly number[],
  bpm: number,
  source: TriggerSource,
  missing: boolean
): TriggerProfile {
  const counts = Array.from({ length: ARRANGEMENT_STEPS }, () => 0);
  for (const time of times) {
    const beat = beatAt(time, grid, bpm);
    if (!Number.isFinite(beat) || beat < 0) continue;
    // Round rather than floor: a hit 2ms early is on the beat, not off it.
    const step = Math.round(beat * 4) % ARRANGEMENT_STEPS;
    counts[(step + ARRANGEMENT_STEPS) % ARRANGEMENT_STEPS] += 1;
  }
  const peak = Math.max(...counts);
  return {
    counts,
    density: peak > 0 ? counts.map((c) => c / peak) : counts.map(() => 0),
    total: counts.reduce((a, b) => a + b, 0),
    source,
    missing
  };
}

/**
 * MIDI note times are relative to the file, and the file is assumed to start
 * with the track. That assumption is the reason the lane exists: if the part is
 * offset or in another tempo the profile will look wrong, which is a far more
 * useful failure than a silent misfire at performance time.
 */
export function midiTriggerTimes(moduleId: string | null): number[] | null {
  if (!moduleId) return null;
  const layer = get(midiLayers)[moduleId];
  if (!layer || layer.notes.length === 0) return null;
  return layer.notes.map((note) => note.time);
}

/** Modules currently holding a MIDI part — the pickable trigger channels. */
export const midiChannelIds = derived(midiLayers, (layers) =>
  Object.entries(layers)
    .filter(([, layer]) => layer != null && layer.notes.length > 0)
    .map(([id]) => id)
);

export function triggerProfileFor(
  source: TriggerSource,
  moduleId: string | null,
  onsets: readonly number[],
  grid: readonly number[],
  bpm: number
): TriggerProfile {
  if (source === 'midi') {
    const times = midiTriggerTimes(moduleId);
    if (!times) return { ...EMPTY_PROFILE, source: 'midi', missing: true };
    return buildProfile(times, grid, bpm, 'midi', false);
  }
  if (onsets.length === 0) return { ...EMPTY_PROFILE, source: 'audio', missing: false };
  return buildProfile(onsets, grid, bpm, 'audio', false);
}
