export interface BeatGridSample {
  beatPosition: number;
  beatPhase: number;
  beatIntervalSeconds: number;
  beatIndex: number;
  source: "hosted-grid" | "bpm-fallback";
  fallbackReason: BeatGridFallbackReason | "bpm-lock" | null;
}

export type BeatGridFallbackReason =
  | "missing"
  | "insufficient-beats"
  | "non-finite-beat"
  | "negative-beat"
  | "non-increasing-beats";

export interface BeatGridStatus {
  usingHostedGrid: boolean;
  fallbackReason: BeatGridFallbackReason | null;
}

const DEFAULT_BPM = 128;
const MIN_INTERVAL_SECONDS = 0.001;

function intervalFromBpm(bpm: number) {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : DEFAULT_BPM;
  return 60 / safeBpm;
}

function positivePhase(position: number) {
  return position - Math.floor(position);
}

function fallbackSample(
  transportSeconds: number,
  interval: number,
  fallbackReason: BeatGridSample["fallbackReason"],
): BeatGridSample {
  const beatPosition = Math.max(0, transportSeconds) / interval;
  return {
    beatPosition,
    beatPhase: positivePhase(beatPosition),
    beatIntervalSeconds: interval,
    beatIndex: Math.floor(beatPosition),
    source: "bpm-fallback",
    fallbackReason,
  };
}

function validateHostedBeats(beats: readonly number[]): BeatGridFallbackReason | null {
  if (beats.length === 0) return "missing";
  if (beats.length < 2) return "insufficient-beats";

  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    if (!Number.isFinite(beat)) return "non-finite-beat";
    if (beat < 0) return "negative-beat";
    if (index > 0 && beat <= beats[index - 1]) return "non-increasing-beats";
  }

  return null;
}

/**
 * Immutable hosted beat grid with a BPM fallback.
 *
 * Hosted timestamps stay intact when callers temporarily bypass them (for
 * example while BPM lock is enabled).
 */
export class BeatGrid {
  readonly beats: readonly number[];
  readonly status: BeatGridStatus;

  private readonly fallbackIntervalSeconds: number;

  constructor(beats: readonly number[], fallbackBpm = DEFAULT_BPM) {
    const fallbackReason = validateHostedBeats(beats);
    this.beats = fallbackReason ? [] : Object.freeze([...beats]);
    this.status = Object.freeze({
      usingHostedGrid: fallbackReason === null,
      fallbackReason,
    });
    this.fallbackIntervalSeconds = intervalFromBpm(fallbackBpm);
  }

  sample(transportSeconds: number, bypassHostedGrid = false): BeatGridSample {
    const time = Number.isFinite(transportSeconds) ? Math.max(0, transportSeconds) : 0;

    if (bypassHostedGrid || !this.status.usingHostedGrid) {
      return fallbackSample(
        time,
        this.fallbackIntervalSeconds,
        bypassHostedGrid ? "bpm-lock" : this.status.fallbackReason,
      );
    }

    const beats = this.beats;
    const first = beats[0];
    const second = beats[1];

    if (time < first) {
      const interval = Math.max(MIN_INTERVAL_SECONDS, second - first);
      const beatPosition = (time - first) / interval;
      return {
        beatPosition,
        beatPhase: positivePhase(beatPosition),
        beatIntervalSeconds: interval,
        beatIndex: Math.floor(beatPosition),
        source: "hosted-grid",
        fallbackReason: null,
      };
    }

    let low = 0;
    let high = beats.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (beats[middle] <= time) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    const beatIndex = low;
    const beatTime = beats[beatIndex];
    const nextBeat = beats[beatIndex + 1];
    const previousBeat = beats[Math.max(0, beatIndex - 1)];
    const interval = Math.max(
      MIN_INTERVAL_SECONDS,
      nextBeat === undefined ? beatTime - previousBeat : nextBeat - beatTime,
    );
    const beatPosition = beatIndex + (time - beatTime) / interval;

    return {
      beatPosition,
      beatPhase: positivePhase(beatPosition),
      beatIntervalSeconds: interval,
      beatIndex: Math.floor(beatPosition),
      source: "hosted-grid",
      fallbackReason: null,
    };
  }
}
