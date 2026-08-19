import { nextGrooveBeat } from "$lib/runtime/groove";
import type { TransportSample } from "$lib/transport";
import type { TransportEvent } from "$lib/transport/events";
import { randomSlice } from "./random";
import { createTimeSamplerState, reduceTimeSampler } from "./reducer";
import type {
  TimeSamplerOutput,
  TimeSamplerAccentMode,
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
  sourceKey?: string;
  midiNotes?: readonly { time: number }[];
  midiDurationSeconds?: number;
  onsetSensitivity?: number;
  bypassed?: boolean;
  /**
   * The rack groove from the PGM rail. Not one of the module's controls -- it
   * is set once for the whole rack and every time module follows it.
   */
  feel?: PgmFeel;
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

export interface PgmPreparation<T> {
  source: T | null;
  boundaryBeat: number | null;
}

export interface LiveScheduleFrame<T> {
  transport: TransportSample;
  timeSampler: TimeSamplerOutput;
  accent: LiveTimeSamplerAccent | null;
  pgm: PgmScheduleOutput<T>;
}

export interface LiveTimeSamplerAccent {
  generation: number;
  mode: TimeSamplerAccentMode;
  transportSeconds: number;
  presentationTimeSeconds: number;
}

const MODE_BY_INDEX = ["FWD", "REV", "PONG", "RND"] as const;
const ACCENT_BY_INDEX = ["LUM", "RGB", "OFF"] as const;
const DEFAULT_RANDOM_SEED = 0x12345678;
const DEFAULT_PGM_SEED = 0x6d2b79f5;

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
  feel: PgmFeel = 0,
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
    feel,
  };
}

function nextMidiNoteTime(
  notes: readonly { time: number }[],
  previousSeconds: number,
  currentSeconds: number,
  loopDurationSeconds: number,
): number | null {
  if (
    notes.length === 0 ||
    loopDurationSeconds <= 0 ||
    currentSeconds <= previousSeconds
  ) {
    return null;
  }

  let earliest = Number.POSITIVE_INFINITY;
  for (const { time } of notes) {
    const normalized =
      ((time % loopDurationSeconds) + loopDurationSeconds) %
      loopDurationSeconds;
    const cycle =
      Math.floor((previousSeconds - normalized) / loopDurationSeconds) + 1;
    const candidate = normalized + cycle * loopDurationSeconds;
    if (candidate <= currentSeconds && candidate < earliest) {
      earliest = candidate;
    }
  }

  return Number.isFinite(earliest) ? earliest : null;
}

export class LiveTimeSamplerSchedule {
  private reduction: TimeSamplerReduction | null = null;

  reset() {
    this.reduction = null;
  }

  sample(
    transport: TransportSample,
    orderedTransportTriggers: readonly TimeSamplerTriggerEvent[],
    input: LiveTimeSamplerInput,
  ): TimeSamplerOutput {
    const params = timeSamplerParamsFromControls(
      input.controls,
      input.sourceDurationSeconds,
      input.feel,
    );

    if (this.reduction === null) {
      this.reduction = createTimeSamplerState(transport, params);
      if (orderedTransportTriggers.length > 0) {
        this.reduction = reduceTimeSampler(
          this.reduction.nextState,
          transport,
          orderedTransportTriggers,
          params,
        );
      }
    } else {
      this.reduction = reduceTimeSampler(
        this.reduction.nextState,
        transport,
        orderedTransportTriggers,
        params,
      );
    }

    return this.reduction.output;
  }
}

/**
 * PGM cut boundaries, on the rack's shared groove.
 *
 * Kept as a named re-export rather than replaced at the call sites: this was the
 * reference implementation the shared helper was extracted from, and the name is
 * what the PGM tests and the desktop pre-open path already speak.
 */
export function nextQuantizedBeat(
  currentBeat: number,
  intervalBeats: number,
  feel: PgmFeel,
) {
  return nextGrooveBeat(currentBeat, intervalBeats, feel);
}

function isTriggerEvent(event: TransportEvent): event is TransportEvent &
  TimeSamplerTriggerEvent {
  return (
    event.type === "manual-trigger" ||
    event.type === "midi-trigger" ||
    event.type === "onset-trigger"
  );
}

export class LiveScheduleRuntime<T = string> {
  private readonly timeSampler = new LiveTimeSamplerSchedule();
  private timeSamplerInput: LiveTimeSamplerInput = {
    controls: {},
    sourceDurationSeconds: 1,
  };
  private pgmInput: PgmScheduleInput<T> | null = null;
  private frame: LiveScheduleFrame<T> | null = null;
  private lastTriggerScanSeconds: number | null = null;
  private lastTriggerGeneration: number | null = null;
  private pgmGeneration: number | null = null;
  private pgmNextBoundary: number | null = null;
  private pgmConfigurationKey = "";
  private pgmRandomState: number;
  private accent: LiveTimeSamplerAccent | null = null;

  constructor(pgmSeed = DEFAULT_PGM_SEED) {
    this.pgmRandomState = pgmSeed >>> 0;
  }

  configureTimeSampler(input: LiveTimeSamplerInput) {
    // Swapping the clip has to clear the state that described the old one.
    //
    // Without this the sampler kept its slice position, its half-scanned
    // trigger bookkeeping and -- the one that shows -- its last accent, which
    // is the LUM/RGB channel the shader reads. A stale accent survives into the
    // new clip and decays against a playhead that has moved somewhere else
    // entirely, so the channel appears to work, then not work, depending on
    // whether a clip change happened to land mid-accent.
    if (input.sourceKey !== this.timeSamplerInput.sourceKey) {
      this.timeSampler.reset();
      this.frame = null;
      this.accent = null;
      this.lastTriggerScanSeconds = null;
      this.lastTriggerGeneration = null;
    }
    this.timeSamplerInput = { ...input };
  }

  configurePgm(input: PgmScheduleInput<T>) {
    this.pgmInput = {
      ...input,
      sources: [...input.sources],
    };
  }

  generatedTriggerEvents(
    transport: TransportSample,
    onsetStrength: number,
  ): TimeSamplerTriggerEvent[] {
    const input = this.timeSamplerInput;
    const discontinuity =
      this.lastTriggerGeneration !== transport.discontinuityGeneration;
    const previousSeconds = discontinuity
      ? null
      : this.lastTriggerScanSeconds;

    this.lastTriggerGeneration = transport.discontinuityGeneration;
    this.lastTriggerScanSeconds = transport.transportSeconds;

    if (input.bypassed || previousSeconds === null) {
      return [];
    }

    const notes = input.midiNotes ?? [];
    if (notes.length > 0) {
      const lastNote = notes[notes.length - 1]?.time ?? 0;
      const loopDuration = Math.max(
        input.midiDurationSeconds ?? 0,
        lastNote + 0.05,
        0.25,
      );
      const noteTime = nextMidiNoteTime(
        notes,
        previousSeconds,
        transport.transportSeconds,
        loopDuration,
      );
      return noteTime === null
        ? []
        : [{ type: "midi-trigger", transportSeconds: noteTime }];
    }

    const threshold =
      0.08 + (1 - (input.onsetSensitivity ?? 0.5)) * 1.1;
    return transport.playing && onsetStrength > threshold
      ? [
          {
            type: "onset-trigger",
            transportSeconds: transport.transportSeconds,
          },
        ]
      : [];
  }

  advance(
    transport: TransportSample,
    orderedTransportEvents: readonly TransportEvent[],
  ): LiveScheduleFrame<T> {
    const timeSampler = this.timeSampler.sample(
      transport,
      orderedTransportEvents.filter(isTriggerEvent),
      this.timeSamplerInput,
    );
    const previous = this.frame;
    const sameTransportGeneration =
      previous?.transport.discontinuityGeneration ===
      transport.discontinuityGeneration;
    const crossedBoundary =
      previous !== null &&
      sameTransportGeneration &&
      timeSampler.jumpGeneration > previous.timeSampler.jumpGeneration &&
      timeSampler.jumpReason !== "source-remap";

    if (!sameTransportGeneration) {
      this.accent = null;
    } else if (timeSampler.accent) {
      this.accent = {
        generation: timeSampler.accent.generation,
        mode: timeSampler.accent.mode,
        transportSeconds: timeSampler.accent.transportSeconds,
        presentationTimeSeconds:
          timeSampler.accent.presentationTimeSeconds,
      };
    } else if (crossedBoundary) {
      this.accent = {
        generation: timeSampler.jumpGeneration,
        mode: timeSamplerParamsFromControls(
          this.timeSamplerInput.controls,
          this.timeSamplerInput.sourceDurationSeconds,
        ).accentMode,
        transportSeconds: transport.transportSeconds,
        presentationTimeSeconds: transport.presentationTimeSeconds,
      };
    }

    const frame = {
      transport,
      timeSampler,
      accent: this.accent,
      pgm: this.advancePgm(transport),
    };
    this.frame = frame;
    return frame;
  }

  getFrame() {
    return this.frame;
  }

  /** Deterministically expose the source due at the next boundary without
   * consuming the random state. Native desktop can pre-open that one decoder
   * while the current PGM lane remains live. */
  getPgmPreparation(): PgmPreparation<T> {
    const input = this.pgmInput;
    if (input === null) return { source: null, boundaryBeat: null };
    if (input.queued !== null) {
      return { source: input.queued, boundaryBeat: this.pgmNextBoundary };
    }
    if (!input.autoRandom) {
      return { source: null, boundaryBeat: this.pgmNextBoundary };
    }
    const candidates = input.sources.filter((source) => source !== input.active);
    if (candidates.length === 0) {
      return { source: null, boundaryBeat: this.pgmNextBoundary };
    }
    const random = randomSlice(this.pgmRandomState, candidates.length, -1);
    return {
      source: candidates[random.slice] ?? null,
      boundaryBeat: this.pgmNextBoundary,
    };
  }

  private advancePgm(transport: TransportSample): PgmScheduleOutput<T> {
    const input = this.pgmInput;
    if (input === null || !transport.playing) {
      this.pgmNextBoundary = null;
      return {
        selected: null,
        consumedQueued: false,
        nextBoundaryBeat: null,
      };
    }

    const configurationKey =
      `${input.intervalBeats}:${input.feel}:${input.autoRandom}`;
    const discontinuity =
      this.pgmGeneration !== transport.discontinuityGeneration;
    const configurationChanged =
      configurationKey !== this.pgmConfigurationKey;

    this.pgmGeneration = transport.discontinuityGeneration;
    this.pgmConfigurationKey = configurationKey;

    if (
      this.pgmNextBoundary === null ||
      discontinuity ||
      configurationChanged
    ) {
      this.pgmNextBoundary = nextQuantizedBeat(
        transport.beatPosition,
        input.intervalBeats,
        input.feel,
      );
    }

    let selected: T | null = null;
    let consumedQueued = false;
    while (
      this.pgmNextBoundary !== null &&
      transport.beatPosition + 1e-9 >= this.pgmNextBoundary
    ) {
      if (input.queued !== null && !consumedQueued) {
        selected = input.queued;
        consumedQueued = true;
        this.pgmInput = { ...input, queued: null };
      } else if (input.autoRandom) {
        const candidates = input.sources.filter(
          (source) => source !== (selected ?? input.active),
        );
        if (candidates.length > 0) {
          const random = randomSlice(
            this.pgmRandomState,
            candidates.length,
            -1,
          );
          this.pgmRandomState = random.state;
          selected = candidates[random.slice] ?? null;
        }
      }

      this.pgmNextBoundary = nextQuantizedBeat(
        this.pgmNextBoundary + 1e-4,
        input.intervalBeats,
        input.feel,
      );
    }

    return {
      selected,
      consumedQueued,
      nextBoundaryBeat: this.pgmNextBoundary,
    };
  }
}

export const liveScheduleRuntime = new LiveScheduleRuntime<string>();
