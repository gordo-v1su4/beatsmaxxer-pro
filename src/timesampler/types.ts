export type TimeSamplerMode = "FWD" | "REV" | "PONG" | "RND";

export type TimeSamplerAccentMode = "OFF" | "LUM" | "RGB";

export type TimeSamplerTriggerKind =
  | "manual-trigger"
  | "midi-trigger"
  | "onset-trigger";

export interface TimeSamplerTransportSample {
  transportSeconds: number;
  audioOutputTimeSeconds: number;
  performanceTimeSeconds: number;
  playing: boolean;
  discontinuityGeneration: number;
  beatPosition: number;
  beatPhase: number;
  beatIntervalSeconds: number;
  presentationTimeSeconds: number;
}

export interface TimeSamplerTriggerEvent {
  type: TimeSamplerTriggerKind;
  transportSeconds?: number;
}

export interface TimeSamplerParams {
  sourceDurationSeconds: number;
  sliceCount: number;
  mode: TimeSamplerMode;
  jumpSizeBeats: number;
  loopCount: number;
  playbackRate: number;
  accentMode: TimeSamplerAccentMode;
  randomSeed: number;
  forcedJumpSeed?: number;
}

export interface TimeSamplerQueuedParams {
  mode: TimeSamplerMode;
  jumpSizeBeats: number;
  loopCount: number;
}

export interface TimeSamplerAccentEvent {
  generation: number;
  mode: TimeSamplerAccentMode;
  transportSeconds: number;
  presentationTimeSeconds: number;
}

export type TimeSamplerJumpReason =
  | "initial"
  | "scheduled"
  | "forced"
  | "discontinuity"
  | "source-remap"
  | null;

export interface TimeSamplerOutput {
  activeSlice: number;
  effectiveSliceCount: number;
  sourceTimestampSeconds: number;
  targetPlaybackRate: number;
  jumpGeneration: number;
  jumpReason: TimeSamplerJumpReason;
  accent: TimeSamplerAccentEvent | null;
}

export interface TimeSamplerState {
  activeSlice: number;
  pongDirection: 1 | -1;
  loopIteration: number;
  jumpGeneration: number;
  discontinuityGeneration: number;
  nextBoundaryBeat: number;
  sliceStartedBeat: number;
  sourceAnchorTransportSeconds: number;
  sourceAnchorOffsetSeconds: number;
  beatIntervalSeconds: number;
  rndSeed: number;
  rndState: number;
  forcedJumpSeed: number;
  forcedJumpState: number;
  pendingTrigger: TimeSamplerTriggerKind | null;
  lastAcceptedOnsetTransportSeconds: number | null;
  sourceDurationSeconds: number;
  sliceCount: number;
  mode: TimeSamplerMode;
  jumpSizeBeats: number;
  loopCount: number;
  playbackRate: number;
  accentMode: TimeSamplerAccentMode;
  queuedParams: TimeSamplerQueuedParams | null;
  lastTransportSeconds: number;
  lastBeatPosition: number;
}

export interface TimeSamplerReduction {
  nextState: TimeSamplerState;
  output: TimeSamplerOutput;
}
