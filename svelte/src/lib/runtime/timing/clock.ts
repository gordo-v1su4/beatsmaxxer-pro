import type { SpeedRampSourceState, SpeedRampTimelineSample } from '$lib/runtime/speedramp';
import { evaluateRamp, integratedRamp, type ClipTiming } from './envelope';
import { stutterBoundaries } from './triggers';

export const wrap = (value: number, length: number) => ((value % length) + length) % length;

/** Sample the output frame boundary, not the rAF callback's arrival time. */
export function timingOutputFrame<T extends SpeedRampTimelineSample>(frame: T, fps: number): T {
  const positionSeconds = Math.floor(frame.positionSeconds * fps + 1e-6) / fps;
  const steps = positionSeconds / frame.fixedStepSeconds;
  return { ...frame, positionSeconds,
    beatPosition: frame.beatPosition + (positionSeconds - frame.positionSeconds) / frame.beatIntervalSeconds,
    fixedStepIndex: Math.floor(steps), fixedStepPhase: steps - Math.floor(steps) };
}

/** Every slot advances regardless of which slot is on air. Cuts never re-anchor. */
export function advanceClipTiming(previous: SpeedRampSourceState | null, frame: SpeedRampTimelineSample,
  config: ClipTiming, duration: number, seed = 0) {
  const cycle = Math.max(0.125, config.ramp.cycleBeats);
  const phase = wrap(frame.beatPosition, cycle) / cycle;
  const rateAt = (beat: number) => config.effect === 'ramp' ? evaluateRamp(config.ramp, wrap(beat,cycle)/cycle) : 1;
  const interval = Math.max(0.001,frame.beatIntervalSeconds);
  const reset = !previous || previous.generation !== frame.generation || frame.fixedStepIndex < previous.fixedStepIndex;
  const fixedBeat = frame.beatPosition-frame.fixedStepPhase*frame.fixedStepSeconds/interval;
  const travel = (from:number,to:number) => config.effect==='ramp'
    ? (integratedRamp(config.ramp,to/cycle)-integratedRamp(config.ramp,from/cycle))*cycle*interval
    : (to-from)*interval;
  const partial = travel(fixedBeat,frame.beatPosition);
  let source = reset ? frame.positionSeconds-partial : previous.sourceAtFixedStepSeconds;
  if (!reset) source += travel(fixedBeat-(frame.fixedStepIndex-previous.fixedStepIndex)*frame.fixedStepSeconds/interval,fixedBeat);
  const rate = rateAt(frame.beatPosition);
  const state = { generation: frame.generation, fixedStepIndex: frame.fixedStepIndex, sourceAtFixedStepSeconds: source };
  let target = source+partial;
  let effectPhase = phase;
  if (config.effect === 'stutter') {
    const division = Math.max(0.125, config.stutter.division);
    const boundaries=stutterBoundaries(config.stutter);
    const cycleBeats = boundaries.at(-1)!;
    const beatInCycle = wrap(frame.beatPosition,cycleBeats);
    const cycleIndex = Math.floor(frame.beatPosition/cycleBeats);
    const anchor = frame.positionSeconds-beatInCycle*interval;
    const start=boundaries.slice(0,-1).findLast(b=>b<=beatInCycle+1e-9)??0;
    const repeated = (beatInCycle-start)*interval;
    effectPhase = beatInCycle/cycleBeats;
    if (config.stutter.mode === 'hold') target = anchor;
    else if (config.stutter.mode === 'jump') {
      // Seeded slices: revisiting a song position does not re-randomize the jump.
      // Avalanche the cycle index: a single LCG step leaves adjacent cycles in
      // the same slice for hundreds of cycles at ordinary slice counts.
      let hash = cycleIndex + seed + 1;
      hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
      hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
      const random = (hash ^ (hash >>> 15)) >>> 0;
      const slices = Math.max(1,config.stutter.slices);
      target = Math.floor(random/4294967296*slices)*duration/slices+repeated;
    } else target = anchor+repeated;
  }
  return { state, sourceTimelineSeconds: target, sourceSeconds: duration > 0 ? wrap(target,duration) : 0, phase: effectPhase, rate };
}
