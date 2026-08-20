import type { TimelineFrame, TimelineMutationReason } from '$lib/transport/AudioTimeline';
import type { TimeSamplerJumpReason, TimeSamplerMode } from '$lib/timesampler/types';

export type ClockReasonLabel = 'PLAY' | 'STOP' | 'SEEK' | 'LOOP' | 'RATE' | 'GRID' | 'SRC' | 'BOOT';

export interface ClockHud {
  playing: boolean;
  bpm: number;
  bpmLocked: boolean;
  bar: number;
  beatInBar: number;
  positionSeconds: number;
  positionLabel: string;
  generation: number;
  reason: TimelineMutationReason;
  reasonLabel: ClockReasonLabel;
}

export interface SamplerHud {
  mode: TimeSamplerMode;
  slice: number;
  sliceCount: number;
  sourceSeconds: number;
  sourceLabel: string;
  jumpGeneration: number;
  jumpReason: TimeSamplerJumpReason;
  jumpLabel: string;
  loopIteration: number;
  loopCount: number;
}

export interface TimingHud {
  clock: ClockHud;
  sampler: SamplerHud | null;
}

const CLOCK_REASON: Record<TimelineMutationReason, ClockReasonLabel> = {
  initial: 'BOOT',
  'context-change': 'SRC',
  'source-change': 'SRC',
  play: 'PLAY',
  pause: 'STOP',
  stop: 'STOP',
  seek: 'SEEK',
  'loop-wrap': 'LOOP',
  'rate-change': 'RATE',
  'beat-grid-change': 'GRID'
};

const JUMP_LABEL: Record<Exclude<TimeSamplerJumpReason, null>, string> = {
  initial: 'INIT',
  scheduled: 'SCHED',
  forced: 'FIRE',
  discontinuity: 'DISC',
  'source-remap': 'REMAP'
};

export function formatTransportSeconds(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`;
}

export function clockReasonLabel(reason: TimelineMutationReason): ClockReasonLabel {
  return CLOCK_REASON[reason] ?? 'BOOT';
}

export function samplerJumpLabel(reason: TimeSamplerJumpReason): string {
  return reason ? JUMP_LABEL[reason] : '—';
}

export function buildClockHud(
  frame: Pick<TimelineFrame, 'playing' | 'bpm' | 'beatPosition' | 'positionSeconds' | 'generation' | 'reason'>,
  bpmLocked: boolean
): ClockHud {
  const beat = Number.isFinite(frame.beatPosition) ? Math.max(0, frame.beatPosition) : 0;
  return {
    playing: frame.playing,
    bpm: frame.bpm,
    bpmLocked,
    bar: Math.floor(beat / 4) + 1,
    beatInBar: (Math.floor(beat) % 4) + 1,
    positionSeconds: frame.positionSeconds,
    positionLabel: formatTransportSeconds(frame.positionSeconds),
    generation: frame.generation,
    reason: frame.reason,
    reasonLabel: clockReasonLabel(frame.reason)
  };
}

export function buildSamplerHud(input: {
  mode: TimeSamplerMode;
  activeSlice: number;
  effectiveSliceCount: number;
  sourceTimestampSeconds: number;
  jumpGeneration: number;
  jumpReason: TimeSamplerJumpReason;
  loopIteration: number;
  loopCount: number;
}): SamplerHud {
  const count = Math.max(1, Math.round(input.effectiveSliceCount));
  const slice = Math.min(count, Math.max(1, Math.round(input.activeSlice) + 1));
  return {
    mode: input.mode,
    slice,
    sliceCount: count,
    sourceSeconds: input.sourceTimestampSeconds,
    sourceLabel: `${input.sourceTimestampSeconds.toFixed(2)}s`,
    jumpGeneration: input.jumpGeneration,
    jumpReason: input.jumpReason,
    jumpLabel: samplerJumpLabel(input.jumpReason),
    loopIteration: Math.max(1, Math.round(input.loopIteration)),
    loopCount: Math.max(1, Math.round(input.loopCount))
  };
}

export function buildTimingHud(input: {
  frame: Pick<TimelineFrame, 'playing' | 'bpm' | 'beatPosition' | 'positionSeconds' | 'generation' | 'reason'>;
  bpmLocked: boolean;
  sampler: Parameters<typeof buildSamplerHud>[0] | null;
}): TimingHud {
  return {
    clock: buildClockHud(input.frame, input.bpmLocked),
    sampler: input.sampler ? buildSamplerHud(input.sampler) : null
  };
}
