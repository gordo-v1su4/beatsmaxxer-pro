import type { TransportSample } from "../audio/transport";
import { randomSlice } from "./random";
import { createTimeSamplerState, reduceTimeSampler } from "./reducer";
import type {
  TimeSamplerOutput,
  TimeSamplerParams,
  TimeSamplerReduction,
  TimeSamplerTriggerEvent,
} from "./types";

export type PgmFeel = 0 | 1 | 2;

export interface TimeSamplerControlParams {
  mode?: number;
  size?: number;
  slices?: number;
  loops?: number;
  rate?: number;
  accent?: number;
}

export interface LiveTimeSamplerInput {
  controls: TimeSamplerControlParams;
  sourceDurationSeconds: number;
  midiNotes?: readonly { time: number }[];
  midiDurationSeconds?: number;
  onsetStrength?: number;
  onsetSensitivity?: number;
  bypassed?: boolean;
}

const MODE_BY_INDEX = ["FWD", "REV", "PONG", "RND"] as const;
const ACCENT_BY_INDEX = ["LUM", "RGB", "OFF"] as const;
const DEFAULT_RANDOM_SEED = 0x12345678;

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

export function jumpSizeBeatsFromControl(size = 50) {
  if (size < 20) return 0.25;
  if (size < 40) return 0.5;
  if (size < 60) return 1;
  if (size < 80) return 2;
  return 4;
}

export function timeSamplerParamsFromControls(
  controls: TimeSamplerControlParams,
  sourceDurationSeconds: number,
): TimeSamplerParams {
  const modeIndex = Math.min(3, Math.max(0, Math.round(controls.mode ?? 0)));
  const accentIndex = Math.min(
    2,
    Math.max(0, Math.round(controls.accent ?? 0)),
  );

  return {
    sourceDurationSeconds: Math.max(0, sourceDurationSeconds),
    sliceCount: Math.max(1, Math.round(controls.slices ?? 8)),
    mode: MODE_BY_INDEX[modeIndex],
    jumpSizeBeats: jumpSizeBeatsFromControl(controls.size),
    loopCount: Math.max(1, Math.round(controls.loops ?? 2)),
    playbackRate: 0.25 + ((controls.rate ?? 43) / 100) * 1.75,
    accentMode: ACCENT_BY_INDEX[accentIndex],
    randomSeed: DEFAULT_RANDOM_SEED,
  };
}

function crossedMidiNote(
  notes: readonly { time: number }[],
  previousSeconds: number,
  currentSeconds: number,
  loopDurationSeconds: number,
): boolean {
  if (
    notes.length === 0 ||
    loopDurationSeconds <= 0 ||
    currentSeconds <= previousSeconds
  ) {
    return false;
  }

  const previous = positiveModulo(previousSeconds, loopDurationSeconds);
  const current = positiveModulo(currentSeconds, loopDurationSeconds);
  const wrapped =
    current < previous ||
    currentSeconds - previousSeconds >= loopDurationSeconds;

  return notes.some(({ time }) => {
    const note = positiveModulo(time, loopDurationSeconds);
    return wrapped
      ? note > previous || note <= current
      : note > previous && note <= current;
  });
}

export class LiveTimeSamplerSchedule {
  private reduction: TimeSamplerReduction | null = null;
  private lastTriggerScanSeconds: number | null = null;
  private lastSampleKey = "";

  reset() {
    this.reduction = null;
    this.lastTriggerScanSeconds = null;
    this.lastSampleKey = "";
  }

  sample(
    transport: TransportSample,
    orderedTransportTriggers: readonly TimeSamplerTriggerEvent[],
    input: LiveTimeSamplerInput,
  ): TimeSamplerOutput {
    const params = timeSamplerParamsFromControls(
      input.controls,
      input.sourceDurationSeconds,
    );
    const sampleKey = [
      transport.transportSeconds,
      transport.beatPosition,
      transport.discontinuityGeneration,
      input.sourceDurationSeconds,
      input.controls.mode,
      input.controls.size,
      input.controls.slices,
      input.controls.loops,
      input.controls.rate,
      input.controls.accent,
      input.bypassed,
      input.onsetStrength,
      input.onsetSensitivity,
      input.midiNotes?.length,
      input.midiDurationSeconds,
    ].join(":");
    if (
      this.reduction !== null &&
      orderedTransportTriggers.length === 0 &&
      sampleKey === this.lastSampleKey
    ) {
      return this.reduction.output;
    }
    const triggers = [...orderedTransportTriggers];

    if (!input.bypassed && this.lastTriggerScanSeconds !== null) {
      const notes = input.midiNotes ?? [];
      if (notes.length > 0) {
        const lastNote = notes[notes.length - 1]?.time ?? 0;
        const loopDuration = Math.max(
          input.midiDurationSeconds ?? 0,
          lastNote + 0.05,
          0.25,
        );
        if (
          crossedMidiNote(
            notes,
            this.lastTriggerScanSeconds,
            transport.transportSeconds,
            loopDuration,
          )
        ) {
          triggers.push({
            type: "midi-trigger",
            transportSeconds: transport.transportSeconds,
          });
        }
      } else {
        const threshold =
          0.08 + (1 - (input.onsetSensitivity ?? 0.5)) * 1.1;
        if (
          transport.playing &&
          (input.onsetStrength ?? 0) > threshold
        ) {
          triggers.push({
            type: "onset-trigger",
            transportSeconds: transport.transportSeconds,
          });
        }
      }
    }

    if (this.reduction === null) {
      this.reduction = createTimeSamplerState(transport, params);
      if (triggers.length > 0) {
        this.reduction = reduceTimeSampler(
          this.reduction.nextState,
          transport,
          triggers,
          params,
        );
      }
    } else {
      this.reduction = reduceTimeSampler(
        this.reduction.nextState,
        transport,
        triggers,
        params,
      );
    }

    this.lastTriggerScanSeconds = transport.transportSeconds;
    this.lastSampleKey = sampleKey;
    return this.reduction.output;
  }
}

export function nextQuantizedBeat(
  currentBeat: number,
  intervalBeats: number,
  feel: PgmFeel,
) {
  const safeBeat = Math.max(0, currentBeat);
  const base = Math.max(0.25, intervalBeats);

  if (feel === 2) {
    const dotted = base * 1.5;
    return (Math.floor(safeBeat / dotted) + 1) * dotted;
  }

  if (feel === 1) {
    const pairLength = base * 2;
    const pairStart = Math.floor(safeBeat / pairLength) * pairLength;
    const longStep = base * (4 / 3);
    return safeBeat < pairStart + longStep - 1e-4
      ? pairStart + longStep
      : pairStart + pairLength;
  }

  return (Math.floor(safeBeat / base) + 1) * base;
}

export interface PgmScheduleInput<T> {
  active: T;
  sources: readonly T[];
  queued: T | null;
  autoRandom: boolean;
  intervalBeats: number;
  feel: PgmFeel;
}

export interface PgmScheduleOutput<T> {
  selected: T | null;
  consumedQueued: boolean;
  nextBoundaryBeat: number | null;
}

export class DeterministicPgmSchedule<T> {
  private discontinuityGeneration: number | null = null;
  private nextBoundary: number | null = null;
  private configurationKey = "";
  private randomState: number;

  constructor(seed = 0x6d2b79f5) {
    this.randomState = seed >>> 0;
  }

  sample(
    transport: Pick<
      TransportSample,
      "beatPosition" | "playing" | "discontinuityGeneration"
    >,
    input: PgmScheduleInput<T>,
  ): PgmScheduleOutput<T> {
    const configurationKey = `${input.intervalBeats}:${input.feel}:${input.autoRandom}`;
    const discontinuity =
      this.discontinuityGeneration !== transport.discontinuityGeneration;
    const configurationChanged = configurationKey !== this.configurationKey;

    this.discontinuityGeneration = transport.discontinuityGeneration;
    this.configurationKey = configurationKey;

    if (!transport.playing) {
      this.nextBoundary = null;
      return {
        selected: null,
        consumedQueued: false,
        nextBoundaryBeat: null,
      };
    }

    if (
      this.nextBoundary === null ||
      discontinuity ||
      configurationChanged
    ) {
      this.nextBoundary = nextQuantizedBeat(
        transport.beatPosition,
        input.intervalBeats,
        input.feel,
      );
    }

    let selected: T | null = null;
    let consumedQueued = false;
    while (
      this.nextBoundary !== null &&
      transport.beatPosition + 1e-9 >= this.nextBoundary
    ) {
      if (input.queued !== null && !consumedQueued) {
        selected = input.queued;
        consumedQueued = true;
      } else if (input.autoRandom) {
        const candidates = input.sources.filter(
          (source) => source !== (selected ?? input.active),
        );
        if (candidates.length > 0) {
          const random = randomSlice(
            this.randomState,
            candidates.length,
            -1,
          );
          this.randomState = random.state;
          selected = candidates[random.slice] ?? null;
        }
      }

      this.nextBoundary = nextQuantizedBeat(
        this.nextBoundary + 1e-4,
        input.intervalBeats,
        input.feel,
      );
    }

    return {
      selected,
      consumedQueued,
      nextBoundaryBeat: this.nextBoundary,
    };
  }
}

export const liveTimeSamplerSchedule = new LiveTimeSamplerSchedule();
