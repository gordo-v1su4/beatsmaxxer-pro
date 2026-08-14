import { beatAt } from '$lib/stores/triggerLane';
import type { MidiLayer } from '$lib/stores/rack';

/**
 * What an imported MIDI part looks like on the way in — read only.
 *
 * Nothing here modifies a note. The point of loading a part from a track is that
 * it carries that track's actual timing, including wherever the generator left
 * it loose; snapping it would destroy the one thing that makes it worth syncing
 * to. This exists so the timing can be SEEN, not corrected: whether the part
 * arrived quantised, how tight it is, and whether it swings.
 *
 * Everything is derived against the hosted beat grid via beatAt() rather than
 * against constant BPM, because a track that drifts has beats that are not
 * 60/bpm apart — measuring a part's tightness against a tempo the song does not
 * actually keep would report human timing for a part that is dead on the grid.
 */

/** Grids a part is tested against, coarsest first: the first that holds wins. */
const CANDIDATE_GRIDS = [
  { label: '1/4', beats: 1 },
  { label: '1/4T', beats: 2 / 3 },
  { label: '1/8', beats: 0.5 },
  { label: '1/8T', beats: 1 / 3 },
  { label: '1/16', beats: 0.25 },
  { label: '1/16T', beats: 1 / 6 },
  { label: '1/32', beats: 0.125 }
] as const;

/**
 * How close to a gridline a note must sit to count as on it, as a fraction of
 * the grid step. A twelfth of a step is roughly 10ms on sixteenths at 120bpm —
 * inside what a sequencer would call tight, outside what a human plays.
 */
const ON_GRID_TOLERANCE = 1 / 12;

/** Below this share of notes on the grid, a part is not quantised to it. */
const QUANTISED_SHARE = 0.9;

export interface MidiTimingProfile {
  /** Notes measured. Zero means there was nothing to analyse. */
  noteCount: number;
  /** Finest grid the part fits, or null if it fits none of them. */
  grid: string | null;
  /** 0-1 share of notes landing within tolerance of that grid. */
  onGridShare: number;
  /** Median absolute distance from the grid, in milliseconds. */
  medianDeviationMs: number;
  /**
   * Where the off-beats sit between their neighbours, 0.5 straight and ~0.667
   * triplet swing. Null when the part has too few off-beats to tell.
   */
  swingRatio: number | null;
  /** True when the part sits tightly enough on its grid to look machine-placed. */
  quantised: boolean;
}

const EMPTY: MidiTimingProfile = {
  noteCount: 0,
  grid: null,
  onGridShare: 0,
  medianDeviationMs: 0,
  swingRatio: null,
  quantised: false
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Signed distance from `beat` to its nearest gridline, in grid steps. */
function offsetInSteps(beat: number, step: number): number {
  const position = beat / step;
  return position - Math.round(position);
}

/**
 * Swing estimate from where off-beats fall.
 *
 * On a straight eighth-note part every off-beat sits halfway between the beats
 * either side of it. Swing pushes it late, and the classic triplet feel lands it
 * two thirds of the way across. Averaging that fraction over the part is a more
 * robust read than looking at any one pair, because a single late note is
 * indistinguishable from a mistake.
 */
function estimateSwing(beats: number[]): number | null {
  const positions: number[] = [];
  let sixteenthHits = 0;

  for (const beat of beats) {
    const withinBeat = beat - Math.floor(beat);
    // A part that uses the sixteenth positions is not an eighth-note part, and
    // this measure has nothing to say about it: the quarter and three-quarter
    // notes would drag the median toward 0.625 and report a swing that is not
    // there. Straight sixteenths were being called 63% swung before this.
    if (Math.abs(withinBeat - 0.25) < 0.08 || Math.abs(withinBeat - 0.75) < 0.08) {
      sixteenthHits++;
      continue;
    }
    // Only notes near the middle of a beat say anything about swing; ones on
    // the beat itself sit in the same place under any feel.
    if (withinBeat > 0.35 && withinBeat < 0.82) positions.push(withinBeat);
  }

  if (sixteenthHits > beats.length * 0.1) return null;
  if (positions.length < 4) return null;
  return median(positions);
}

/**
 * Measure a part's timing. Pass the hosted beat grid when there is one; without
 * it the reading falls back to constant BPM, which is less honest on a track
 * that drifts but still meaningful.
 */
export function analyseMidiTiming(
  layer: MidiLayer | null,
  beatGrid: readonly number[] = [],
  bpm = 120
): MidiTimingProfile {
  if (!layer || layer.notes.length === 0) return EMPTY;

  const beats = layer.notes.map((note) => beatAt(note.time, beatGrid, bpm));
  const secondsPerBeat = beatGrid.length >= 2 ? 0 : 60 / (bpm > 0 ? bpm : 120);

  // Milliseconds per beat, measured from the grid where there is one so the
  // deviation figure is in real time rather than in nominal-tempo time.
  const msPerBeat =
    beatGrid.length >= 2
      ? ((beatGrid[beatGrid.length - 1] - beatGrid[0]) / (beatGrid.length - 1)) * 1000
      : secondsPerBeat * 1000;

  let best: { label: string; share: number; deviations: number[] } | null = null;

  for (const candidate of CANDIDATE_GRIDS) {
    const offsets = beats.map((beat) => offsetInSteps(beat, candidate.beats));
    const onGrid = offsets.filter((o) => Math.abs(o) <= ON_GRID_TOLERANCE).length;
    const share = onGrid / beats.length;
    // Coarsest that holds, and stop there. Every sixteenth-note part also sits
    // perfectly on thirty-seconds, so continuing to the finest grid would report
    // 1/32 for everything -- true, and useless. The coarsest grid that still
    // holds the part is the one that describes what was actually played.
    if (share >= QUANTISED_SHARE) {
      best = {
        label: candidate.label,
        share,
        deviations: offsets.map((o) => Math.abs(o) * candidate.beats * msPerBeat)
      };
      break;
    }
  }

  // Nothing held it: report against the finest grid so the deviation figure
  // still describes how loose the part is rather than being omitted.
  if (!best) {
    const fallback = CANDIDATE_GRIDS[CANDIDATE_GRIDS.length - 1];
    const offsets = beats.map((beat) => offsetInSteps(beat, fallback.beats));
    best = {
      label: fallback.label,
      share: offsets.filter((o) => Math.abs(o) <= ON_GRID_TOLERANCE).length / beats.length,
      deviations: offsets.map((o) => Math.abs(o) * fallback.beats * msPerBeat)
    };
  }

  const quantised = best.share >= QUANTISED_SHARE;
  return {
    noteCount: beats.length,
    grid: best.label,
    onGridShare: best.share,
    medianDeviationMs: median(best.deviations),
    swingRatio: estimateSwing(beats),
    quantised
  };
}

/** One line for the MIDI lane, e.g. "1/16 · 99% · 2ms" or "loose · 23ms · sw 66%". */
export function formatMidiTiming(profile: MidiTimingProfile): string {
  if (profile.noteCount === 0) return 'no notes';
  const parts = [
    profile.quantised ? (profile.grid ?? '—') : 'loose',
    `${Math.round(profile.onGridShare * 100)}%`,
    `${profile.medianDeviationMs < 10
      ? profile.medianDeviationMs.toFixed(1)
      : Math.round(profile.medianDeviationMs)}ms`
  ];
  // Only worth showing once it is audibly away from straight.
  if (profile.swingRatio !== null && profile.swingRatio > 0.54) {
    parts.push(`sw ${Math.round(profile.swingRatio * 100)}%`);
  }
  return parts.join(' · ');
}
