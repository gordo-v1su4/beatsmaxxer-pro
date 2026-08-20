import { grooveSegment } from '$lib/runtime/groove';
import type { PgmFeel } from '$lib/stores/pgm';
import { beatAt } from '$lib/stores/triggerLane';
import { lastTriggerTime, noteFires } from '$lib/stores/midiTrigger';
import type { TimelineFrame } from '$lib/transport';

/** Mirror of `stutterLenBeats()` in moduleFx.wgsl.ts */
export function stutterLenBeats(timeParam: number): number {
  const p = timeParam / 100;
  if (p < 0.2) return 0.125;
  if (p < 0.4) return 0.25;
  if (p < 0.6) return 1 / 3;
  if (p < 0.8) return 0.5;
  return 1;
}

/** Shorter freeze window when a note or onset arms STUTTER (not the bar grid). */
export function stutterTriggerWindowBeats(timeParam: number, gateParam: number): number {
  const len = stutterLenBeats(timeParam);
  const gate = gateParam / 100;
  return Math.min(len, 0.0625 + gate * len * 0.35);
}

export function stutterFeelParam(feel: number | undefined): PgmFeel {
  const rounded = Math.round(feel ?? 0);
  if (rounded === 1) return 1;
  if (rounded === 2) return 2;
  return 0;
}

/** 0–1 progress through the current stutter division (grid or trigger window). */
export function stutterDivisionProgress(
  beatPosition: number,
  params: Record<string, number>,
  triggerAge: number
): number {
  const len = stutterLenBeats(params.time ?? 60);
  if (triggerAge >= 0) {
    const window = stutterTriggerWindowBeats(params.time ?? 60, params.gate ?? 70);
    return Math.min(1, triggerAge / Math.max(window, 0.0001));
  }
  const feel = stutterFeelParam(params.feel);
  const seg = grooveSegment(beatPosition, len, feel);
  return seg.progress;
}

/** True while the shader should show the feedback-held frame, not live video. */
export function stutterInFreezePhase(
  progress: number,
  params: Record<string, number>,
  playing: boolean
): boolean {
  if (!playing) return false;
  const gate = (params.gate ?? 70) / 100;
  const hold = (params.feedback ?? 50) / 100;
  const captureEnd = 0.08;
  const releaseAt = 0.06 + gate * 0.88 * Math.max(hold, 0.04);
  return progress > captureEnd && progress < releaseAt;
}

export function firingOnsetTimes(onsets: readonly number[], density: number): number[] {
  return onsets.filter((_, index) => noteFires(index, 100, density));
}

export function audioStutterTriggerAge(
  frame: Pick<TimelineFrame, 'beatPosition' | 'positionSeconds' | 'bpm' | 'playbackRate' | 'playing'>,
  onsets: readonly number[],
  grid: readonly number[],
  density: number
): number {
  if (!frame.playing || onsets.length === 0) return -1;
  const times = firingOnsetTimes(onsets, density);
  const triggerTime = lastTriggerTime(times, frame.positionSeconds);
  if (triggerTime === null) return -1;
  const bpm = frame.bpm / Math.max(0.01, frame.playbackRate);
  return Math.max(0, frame.beatPosition - beatAt(triggerTime, grid, bpm));
}

export interface LiveOnsetStutterState {
  originBeat: number;
  lastOnsetAmp: number;
  armed: boolean;
}

const STRIKE_THRESHOLD = 0.22;

/** Live bass-flux strike — between analysis passes and on unwritten hits. */
export function advanceLiveOnsetStutter(
  previous: LiveOnsetStutterState | null,
  onsetAmp: number,
  beatPosition: number,
  playing: boolean,
  windowBeats: number
): { age: number | null; state: LiveOnsetStutterState } {
  const prevAmp = previous?.lastOnsetAmp ?? 0;
  const base: LiveOnsetStutterState = {
    originBeat: previous?.originBeat ?? beatPosition,
    lastOnsetAmp: onsetAmp,
    armed: previous?.armed ?? false
  };

  if (!playing) {
    return { age: null, state: { ...base, armed: false } };
  }

  const rising = onsetAmp >= STRIKE_THRESHOLD && prevAmp < STRIKE_THRESHOLD;
  if (rising) {
    return {
      age: 0,
      state: { originBeat: beatPosition, lastOnsetAmp: onsetAmp, armed: true }
    };
  }

  if (!base.armed) return { age: null, state: base };

  const age = beatPosition - base.originBeat;
  if (!Number.isFinite(age) || age < 0 || age > windowBeats) {
    return { age: null, state: { ...base, armed: false } };
  }
  return { age, state: { ...base, armed: true } };
}

export function mergeStutterTriggerAge(
  midiAge: number | undefined,
  fireAge: number | undefined,
  analysisAge: number | undefined,
  liveAge: number | undefined
): number {
  if (midiAge != null && midiAge >= 0) return midiAge;
  if (fireAge != null && fireAge >= 0) return fireAge;
  let best = -1;
  for (const age of [analysisAge, liveAge]) {
    if (age == null || age < 0) continue;
    if (best < 0 || age < best) best = age;
  }
  return best;
}
