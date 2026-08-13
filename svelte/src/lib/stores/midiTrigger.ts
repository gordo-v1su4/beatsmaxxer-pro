import { writable } from 'svelte/store';
import type { MidiLayer } from '$lib/stores/rack';

/**
 * Which clock fires a module: the track's own onsets, or a MIDI part.
 *
 * Deliberately exclusive, never a blend. Onset detection reacts to whatever the
 * mix is doing and MIDI fires on written notes; running both means two
 * uncorrelated trigger streams into one effect, which does not read as "more
 * rhythm" -- it reads as constant retriggering, and the only way back is to turn
 * one of them down until it may as well be off. Picking one is the feature.
 *
 * Per module rather than global: modules sit in different slots doing different
 * jobs, so cutting PUNCH on a written kick while LEAK still breathes with the
 * mix is the point of having the choice at all.
 */
export type ModuleTriggerSource = 'audio' | 'midi';

export const moduleTriggerSource = writable<Record<string, ModuleTriggerSource>>({});

export function setModuleTriggerSource(moduleId: string, source: ModuleTriggerSource) {
  moduleTriggerSource.update((map) => ({ ...map, [moduleId]: source }));
}

/**
 * Deterministic keep/drop for one note.
 *
 * DENSITY thins a part rather than scaling it: at 40 the same 40% of notes fire
 * every pass, so a busy hi-hat line can drive an effect on a sparse subset of
 * its own hits and still be the same performance every time the section comes
 * round. Random selection per frame would make the rack unrepeatable, which
 * matters here because the whole transport is built to be deterministic.
 *
 * Velocity breaks the tie, so thinning keeps the accents and drops the ghost
 * notes -- the musical choice rather than an arbitrary one.
 */
export function noteFires(index: number, velocity: number, density: number): boolean {
  const keep = Math.max(0, Math.min(1, density));
  if (keep >= 1) return true;
  if (keep <= 0) return false;
  // Hash the index into 0..1, then bias by velocity so loud notes survive
  // deeper thinning than quiet ones.
  const h = Math.abs(Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
  const vel = Math.max(0, Math.min(1, velocity / 127));
  return h < keep * (0.55 + 0.9 * vel);
}

/** Note times, in seconds, that survive DENSITY. Sorted ascending. */
export function firingTimes(layer: MidiLayer | null, density: number): number[] {
  if (!layer) return [];
  const out: number[] = [];
  for (let i = 0; i < layer.notes.length; i++) {
    const n = layer.notes[i];
    if (noteFires(i, n.velocity, density)) out.push(n.time);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Beats since the most recent firing note at or before `seconds`, or -1 when
 * none has landed yet.
 *
 * Binary search rather than a scan: a full drum part is thousands of notes and
 * this runs once per module per frame.
 */
export function triggerAgeBeats(
  times: readonly number[],
  seconds: number,
  bpm: number
): number {
  if (times.length === 0 || seconds < times[0]) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (times[mid] <= seconds) lo = mid;
    else hi = mid - 1;
  }
  const safeBpm = bpm > 0 ? bpm : 120;
  return ((seconds - times[lo]) * safeBpm) / 60;
}
