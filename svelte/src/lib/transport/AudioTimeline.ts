import { BeatGrid, type BeatGridSample } from "./BeatGrid";

export type TimelineMutationReason =
  | "initial"
  | "context-change"
  | "source-change"
  | "play"
  | "pause"
  | "stop"
  | "seek"
  | "loop-wrap"
  | "rate-change"
  | "beat-grid-change";

export interface TimelineEvent {
  readonly reason: TimelineMutationReason;
  readonly generation: number;
  readonly fromSeconds: number;
  readonly toSeconds: number;
}

export interface TimelineFrame extends BeatGridSample {
  readonly frameId: number;
  readonly audioFrameId: number;
  readonly contextTimeSeconds: number;
  readonly positionSeconds: number;
  readonly transportSeconds: number;
  readonly playbackRate: number;
  readonly playing: boolean;
  readonly generation: number;
  readonly reason: TimelineMutationReason;
  readonly bpm: number;
  readonly fixedStepSeconds: number;
  readonly fixedStepIndex: number;
  readonly fixedStepPhase: number;
  readonly deterministicSeed: number;
  readonly events: readonly TimelineEvent[];
}

export interface AudioTimelineContext {
  readonly currentTime: number;
  readonly sampleRate: number;
}

export interface TimelineSourceConfig {
  readonly id?: string | null;
  readonly durationSeconds?: number;
  readonly loop?: boolean;
  readonly positionSeconds?: number;
}

export type TimelineSubscriber = (frame: TimelineFrame) => void;

const DEFAULT_BPM = 128;
const DEFAULT_SAMPLE_RATE = 44_100;
const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;

const finiteNonNegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * The one semantic runtime clock. rAF publishes each frame; uploaded tracks
 * also resync from HTMLAudio timeupdate/play/pause events in AudioEngine.
 */
export class AudioTimeline {
  private context: AudioTimelineContext | null = null;
  private beatGrid = new BeatGrid([], DEFAULT_BPM);
  private bpm = DEFAULT_BPM;
  private sourceId: string | null = null;
  private durationSeconds = 0;
  private loop = false;
  private anchorPositionSeconds = 0;
  private anchorContextTimeSeconds = 0;
  private playbackRate = 1;
  private playing = false;
  private generation = 0;
  private frameId = 0;
  private reason: TimelineMutationReason = "initial";
  private queuedEvents: TimelineEvent[] = [];
  private lastFrame: TimelineFrame | null = null;
  private subscribers: Array<{ callback: TimelineSubscriber; order: number; sequence: number }> = [];
  private subscriberCallbacks = new Set<TimelineSubscriber>();
  private subscriberSequence = 0;
  private dispatching = false;
  private deferredSubscriberMutations: Array<() => void> = [];
  private disposed = false;

  bindContext(context: AudioTimelineContext) {
    if (this.context === context) return;
    const position = this.positionAt(this.readContextTime());
    this.context = context;
    this.anchorContextTimeSeconds = this.readContextTime();
    this.anchorPositionSeconds = position;
    this.mutate("context-change", position, position, true);
  }

  configureSource(config: TimelineSourceConfig = {}) {
    const from = this.positionAt(this.readContextTime());
    this.sourceId = config.id ?? null;
    this.durationSeconds = finiteNonNegative(config.durationSeconds ?? 0);
    this.loop = config.loop === true;
    const to = finiteNonNegative(config.positionSeconds ?? 0);
    this.reanchor(to);
    this.mutate("source-change", from, to, true);
  }

  play(positionSeconds?: number) {
    const now = this.readContextTime();
    const from = this.positionAt(now);
    const to = positionSeconds === undefined ? from : finiteNonNegative(positionSeconds);
    if (this.playing && to === from) return;
    this.anchorContextTimeSeconds = now;
    this.anchorPositionSeconds = to;
    this.playing = true;
    this.mutate("play", from, to, true);
  }

  pause() {
    if (!this.playing) return;
    const now = this.readContextTime();
    const position = this.positionAt(now);
    this.anchorContextTimeSeconds = now;
    this.anchorPositionSeconds = position;
    this.playing = false;
    this.mutate("pause", position, position, true);
  }

  stop() {
    const from = this.positionAt(this.readContextTime());
    this.playing = false;
    this.reanchor(0);
    this.mutate("stop", from, 0, true);
  }

  seek(positionSeconds: number, reason: "seek" | "loop-wrap" = "seek") {
    const from = this.positionAt(this.readContextTime());
    const to = finiteNonNegative(positionSeconds);
    this.reanchor(to);
    this.mutate(reason, from, to, true);
  }

  /**
   * Soft-lock position to a heard media actuator (HTMLAudio.currentTime).
   * Small clock error is absorbed without a generation bump so videos keep
   * decoding; a jump larger than a beat-16th is a discontinuity.
   */
  followPosition(positionSeconds: number) {
    if (!this.playing) return;
    const now = this.readContextTime();
    const from = this.positionAt(now);
    const to = finiteNonNegative(positionSeconds);
    this.reanchor(to, now);
    if (Math.abs(to - from) > 0.12) {
      const wrapped =
        this.loop &&
        this.durationSeconds > 0 &&
        from > this.durationSeconds - 0.5 &&
        to < 0.5;
      this.mutate(wrapped ? "loop-wrap" : "seek", from, to, true);
    }
  }

  setPlaybackRate(rate: number) {
    const safeRate = Number.isFinite(rate) ? Math.max(0.01, rate) : 1;
    if (safeRate === this.playbackRate) return;
    const position = this.positionAt(this.readContextTime());
    this.reanchor(position);
    this.playbackRate = safeRate;
    this.mutate("rate-change", position, position, false);
  }

  setBeatGrid(beats: readonly number[], bpm: number, fallbackBpm = bpm) {
    this.bpm = Number.isFinite(bpm) && bpm > 0 ? bpm : DEFAULT_BPM;
    const safeFallbackBpm = Number.isFinite(fallbackBpm) && fallbackBpm > 0
      ? fallbackBpm
      : this.bpm;
    this.beatGrid = new BeatGrid(beats, safeFallbackBpm);
    const position = this.positionAt(this.readContextTime());
    this.mutate("beat-grid-change", position, position, false);
  }

  publishFrame(): TimelineFrame {
    if (this.disposed) throw new Error("AudioTimeline is disposed");
    const contextTimeSeconds = this.readContextTime();
    let positionSeconds = this.positionAt(contextTimeSeconds);
    if (this.loop && this.durationSeconds > 0 && positionSeconds >= this.durationSeconds) {
      const wrapped = positionSeconds % this.durationSeconds;
      this.reanchor(wrapped, contextTimeSeconds);
      this.mutate("loop-wrap", positionSeconds, wrapped, true);
      positionSeconds = wrapped;
    }

    const beat = this.beatGrid.sample(positionSeconds);
    const sampleRate = this.context?.sampleRate || DEFAULT_SAMPLE_RATE;
    const fixedStepIndex = Math.floor(positionSeconds / DEFAULT_FIXED_STEP_SECONDS);
    const events = Object.freeze(this.queuedEvents.splice(0));
    const frame = Object.freeze({
      ...beat,
      frameId: ++this.frameId,
      audioFrameId: Math.round(contextTimeSeconds * sampleRate),
      contextTimeSeconds,
      positionSeconds,
      transportSeconds: positionSeconds,
      playbackRate: this.playbackRate,
      playing: this.playing,
      generation: this.generation,
      reason: this.reason,
      bpm: this.bpm,
      fixedStepSeconds: DEFAULT_FIXED_STEP_SECONDS,
      fixedStepIndex,
      fixedStepPhase: positionSeconds / DEFAULT_FIXED_STEP_SECONDS - fixedStepIndex,
      deterministicSeed: this.seedFor(this.generation, fixedStepIndex),
      events,
    }) satisfies TimelineFrame;

    this.lastFrame = frame;
    this.dispatching = true;
    try {
      for (const subscriber of this.subscribers) subscriber.callback(frame);
    } finally {
      this.dispatching = false;
      const deferred = this.deferredSubscriberMutations.splice(0);
      for (const mutation of deferred) mutation();
    }
    return frame;
  }

  getLastFrame() {
    return this.lastFrame;
  }

  getPositionSeconds() {
    return this.positionAt(this.readContextTime());
  }

  subscribe(callback: TimelineSubscriber, order = 0) {
    if (this.subscriberCallbacks.has(callback)) {
      throw new Error("AudioTimeline subscriber already registered");
    }
    this.subscriberCallbacks.add(callback);
    let active = true;
    const entry = { callback, order, sequence: this.subscriberSequence++ };
    const add = () => {
      this.subscribers.push(entry);
      this.subscribers.sort((a, b) => a.order - b.order || a.sequence - b.sequence);
    };
    this.deferOrRun(add);
    return () => {
      if (!active) return;
      active = false;
      this.subscriberCallbacks.delete(callback);
      this.deferOrRun(() => {
        this.subscribers = this.subscribers.filter((candidate) => candidate !== entry);
      });
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.subscribers = [];
    this.subscriberCallbacks.clear();
    this.deferredSubscriberMutations = [];
    this.queuedEvents = [];
    this.context = null;
    this.lastFrame = null;
  }

  private readContextTime() {
    return finiteNonNegative(this.context?.currentTime ?? 0);
  }

  private positionAt(contextTimeSeconds: number) {
    if (!this.playing) return this.anchorPositionSeconds;
    return finiteNonNegative(
      this.anchorPositionSeconds +
        (contextTimeSeconds - this.anchorContextTimeSeconds) * this.playbackRate,
    );
  }

  private reanchor(positionSeconds: number, contextTimeSeconds = this.readContextTime()) {
    this.anchorPositionSeconds = finiteNonNegative(positionSeconds);
    this.anchorContextTimeSeconds = contextTimeSeconds;
  }

  private mutate(
    reason: TimelineMutationReason,
    fromSeconds: number,
    toSeconds: number,
    discontinuous: boolean,
  ) {
    if (discontinuous) this.generation += 1;
    this.reason = reason;
    this.queuedEvents.push(Object.freeze({
      reason,
      generation: this.generation,
      fromSeconds,
      toSeconds,
    }));
  }

  private deferOrRun(mutation: () => void) {
    if (this.dispatching) this.deferredSubscriberMutations.push(mutation);
    else mutation();
  }

  private seedFor(generation: number, fixedStepIndex: number) {
    let value = (generation * 0x9e3779b1 + fixedStepIndex) >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  }
}

/** The sole application runtime timeline instance. */
export const audioTimeline = new AudioTimeline();
