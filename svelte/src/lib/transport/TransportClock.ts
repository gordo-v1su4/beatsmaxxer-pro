import { BeatGrid, type BeatGridSample, type BeatGridStatus } from "./BeatGrid";
import {
  orderTransportEvents,
  type ImmediateParameterChangeEvent,
  type ScheduledParameterChangeEvent,
  type SourceMapChangeEvent,
  type TransportDiscontinuityEvent,
  type TransportDiscontinuityReason,
  type TransportEvent,
} from "./events";

const BACKWARD_DISCONTINUITY_EPSILON_SECONDS = 0.001;

export interface AudioMasterReading {
  transportSeconds: number;
  audioOutputTimeSeconds: number;
  performanceTimeSeconds: number;
  presentationTimeSeconds: number;
  playing: boolean;
  bypassHostedGrid?: boolean;
}

export interface TransportSample extends BeatGridSample {
  transportSeconds: number;
  audioOutputTimeSeconds: number;
  performanceTimeSeconds: number;
  presentationTimeSeconds: number;
  playing: boolean;
  discontinuityGeneration: number;
  transportSecondsAtBeat: (beatPosition: number) => number;
}

export interface TransportClockOptions {
  beats?: readonly number[];
  bpm?: number;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Audio-master transport clock.
 *
 * The clock never integrates RAF/performance deltas. Every sample derives its
 * transport position from the supplied audio-master reading.
 */
export class TransportClock {
  private beatGrid: BeatGrid;
  private generation = 0;
  private sequence = 0;
  private lastTransportSeconds = 0;
  private lastPresentationTimeSeconds = 0;
  private playing = false;
  private events: TransportEvent[] = [];

  constructor(options: TransportClockOptions = {}) {
    this.beatGrid = new BeatGrid(options.beats ?? [], options.bpm);
  }

  get discontinuityGeneration() {
    return this.generation;
  }

  get beatGridStatus(): BeatGridStatus {
    return this.beatGrid.status;
  }

  sample(reading: AudioMasterReading): TransportSample {
    const transportSeconds = finiteNonNegative(reading.transportSeconds);
    if (reading.playing !== this.playing) {
      this.discontinuity(reading.playing ? "play" : "pause", transportSeconds);
    } else if (
      reading.playing &&
      transportSeconds <
        this.lastTransportSeconds - BACKWARD_DISCONTINUITY_EPSILON_SECONDS
    ) {
      this.discontinuity("loop-wrap", transportSeconds);
    }

    const presentationTimeSeconds = Math.max(
      this.lastPresentationTimeSeconds,
      finiteNonNegative(reading.presentationTimeSeconds),
    );
    const beatGrid = this.beatGrid;
    const bypassHostedGrid = reading.bypassHostedGrid;
    const beat = beatGrid.sample(transportSeconds, bypassHostedGrid);

    this.lastTransportSeconds = transportSeconds;
    this.lastPresentationTimeSeconds = presentationTimeSeconds;
    this.playing = reading.playing;

    return {
      ...beat,
      transportSeconds,
      audioOutputTimeSeconds: finiteNonNegative(reading.audioOutputTimeSeconds),
      performanceTimeSeconds: finiteNonNegative(reading.performanceTimeSeconds),
      presentationTimeSeconds,
      playing: reading.playing,
      discontinuityGeneration: this.generation,
      transportSecondsAtBeat: (beatPosition) =>
        beatGrid.transportSecondsAtBeat(beatPosition, bypassHostedGrid),
    };
  }

  setPlaying(
    playing: boolean,
    transportSeconds = this.lastTransportSeconds,
  ): TransportDiscontinuityEvent | null {
    if (playing === this.playing) return null;
    return this.discontinuity(playing ? "play" : "pause", transportSeconds);
  }

  seek(transportSeconds: number, reason: "seek" | "loop-wrap" = "seek") {
    return this.discontinuity(reason, transportSeconds);
  }

  sourceChanged(transportSeconds = 0) {
    return this.discontinuity("source-change", transportSeconds);
  }

  setBeatGrid(beats: readonly number[], bpm: number, transportSeconds = this.lastTransportSeconds) {
    this.beatGrid = new BeatGrid(beats, bpm);
    return this.enqueue<ImmediateParameterChangeEvent>({
      type: "immediate-parameter-change",
      parameter: "beat-grid",
      value: {
        beats: this.beatGrid.beats,
        status: this.beatGrid.status,
      },
      transportSeconds: finiteNonNegative(transportSeconds),
    });
  }

  setBpm(bpm: number, transportSeconds = this.lastTransportSeconds) {
    this.beatGrid = new BeatGrid(this.beatGrid.beats, bpm);
    return this.enqueue<ImmediateParameterChangeEvent>({
      type: "immediate-parameter-change",
      parameter: "bpm",
      value: bpm,
      transportSeconds: finiteNonNegative(transportSeconds),
    });
  }

  queueScheduledParameter(
    parameter: ScheduledParameterChangeEvent["parameter"],
    value: unknown,
    transportSeconds = this.lastTransportSeconds,
  ) {
    return this.enqueue<ScheduledParameterChangeEvent>({
      type: "scheduled-parameter-change",
      parameter,
      value,
      transportSeconds: finiteNonNegative(transportSeconds),
    });
  }

  queueImmediateParameter(
    parameter: ImmediateParameterChangeEvent["parameter"],
    value: unknown,
    transportSeconds = this.lastTransportSeconds,
  ) {
    return this.enqueue<ImmediateParameterChangeEvent>({
      type: "immediate-parameter-change",
      parameter,
      value,
      transportSeconds: finiteNonNegative(transportSeconds),
    });
  }

  queueSourceMapChange(
    change: Omit<SourceMapChangeEvent, "type" | "sequence" | "transportSeconds">,
    transportSeconds = this.lastTransportSeconds,
  ) {
    return this.enqueue<SourceMapChangeEvent>({
      type: "source-map-change",
      ...change,
      transportSeconds: finiteNonNegative(transportSeconds),
    });
  }

  queueEvent(event: Omit<TransportEvent, "sequence">) {
    return this.enqueue<TransportEvent>(event);
  }

  drainEvents() {
    const ordered = orderTransportEvents(this.events);
    this.events = [];
    return ordered;
  }

  private discontinuity(
    reason: TransportDiscontinuityReason,
    toSeconds: number,
  ): TransportDiscontinuityEvent {
    const fromSeconds = this.lastTransportSeconds;
    const nextSeconds = finiteNonNegative(toSeconds);
    this.generation += 1;
    this.lastTransportSeconds = nextSeconds;
    this.playing = reason === "play" ? true : reason === "pause" ? false : this.playing;

    return this.enqueue<TransportDiscontinuityEvent>({
      type: "transport-discontinuity",
      reason,
      generation: this.generation,
      fromSeconds,
      toSeconds: nextSeconds,
      transportSeconds: nextSeconds,
    });
  }

  private enqueue<T extends TransportEvent>(event: Omit<T, "sequence">): T {
    const queued = { ...event, sequence: this.sequence++ } as T;
    this.events.push(queued);
    return queued;
  }
}
