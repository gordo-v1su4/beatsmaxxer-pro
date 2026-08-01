const CYCLE_BEATS = [1, 2, 4, 8, 16, 24, 32] as const;

function cubicBezier(a: number, b: number, c: number, d: number, t: number) {
  const mt = 1 - t;
  return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
}

function toRate(v: number) {
  return 0.25 * Math.pow(2, v * 4);
}

/** Beat-synced playback rate from SPEEDRAMP bezier curve (matches React rack). */
export function computeSpeedRampRate(
  beat: number,
  params: Record<string, number>,
  bypassed = false
): number {
  if (bypassed) return 1;

  const lenP = (params.len ?? 36) / 100;
  const cycleBeats = CYCLE_BEATS[Math.min(6, Math.floor(lenP * 7))]!;
  const phase = (((beat % cycleBeats) + cycleBeats) % cycleBeats) / cycleBeats;

  const y0 = (params.bzY0 ?? 100) / 100;
  const y1 = (params.bzY1 ?? 0) / 100;
  const y2 = (params.bzY2 ?? 0) / 100;
  const y3 = (params.bzY3 ?? 100) / 100;
  const x1 = Math.max(0, Math.min(1, (params.bzX1 ?? 35) / 100));
  const x2 = Math.max(0, Math.min(1, (params.bzX2 ?? 65) / 100));

  let lo = 0;
  let hi = 1;
  let t = phase;
  for (let i = 0; i < 18; i++) {
    t = (lo + hi) / 2;
    if (cubicBezier(0, x1, x2, 1, t) < phase) lo = t;
    else hi = t;
  }

  const cv = Math.max(0, Math.min(1, cubicBezier(y0, y1, y2, y3, t)));
  const rMin = toRate(Math.min(params.spdMin ?? 25, params.spdMax ?? 75) / 100);
  const rMax = toRate(Math.max(params.spdMin ?? 25, params.spdMax ?? 75) / 100);
  const sw = cv * 2 - 1;
  const rate = sw >= 0 ? Math.pow(rMax, sw) : Math.pow(rMin, -sw);
  return Math.max(0.0625, Math.min(4, rate));
}

export interface SpeedRampTimelineSample {
  readonly generation: number;
  readonly positionSeconds: number;
  readonly beatPosition: number;
  readonly beatIntervalSeconds: number;
  readonly fixedStepSeconds: number;
  readonly fixedStepIndex: number;
  readonly fixedStepPhase: number;
}

export interface SpeedRampSourceState {
  readonly generation: number;
  readonly fixedStepIndex: number;
  readonly sourceAtFixedStepSeconds: number;
}

/** Deterministic fixed-step source mapping; HTML media time is only an actuator. */
export function advanceSpeedRampSource(
  previous: SpeedRampSourceState | null,
  frame: SpeedRampTimelineSample,
  params: Record<string, number>,
  bypassed = false
) {
  if (
    previous === null ||
    previous.generation !== frame.generation ||
    frame.fixedStepIndex < previous.fixedStepIndex
  ) {
    const state = {
      generation: frame.generation,
      fixedStepIndex: frame.fixedStepIndex,
      sourceAtFixedStepSeconds: frame.positionSeconds
    } satisfies SpeedRampSourceState;
    return {
      state,
      targetSeconds: frame.positionSeconds,
      rate: computeSpeedRampRate(frame.beatPosition, params, bypassed)
    };
  }

  const interval = Math.max(0.001, frame.beatIntervalSeconds);
  let sourceAtFixedStepSeconds = previous.sourceAtFixedStepSeconds;
  for (let step = previous.fixedStepIndex + 1; step <= frame.fixedStepIndex; step += 1) {
    const stepPosition = step * frame.fixedStepSeconds;
    const stepBeat = frame.beatPosition + (stepPosition - frame.positionSeconds) / interval;
    sourceAtFixedStepSeconds +=
      frame.fixedStepSeconds * computeSpeedRampRate(stepBeat, params, bypassed);
  }

  const rate = computeSpeedRampRate(frame.beatPosition, params, bypassed);
  const state = {
    generation: frame.generation,
    fixedStepIndex: frame.fixedStepIndex,
    sourceAtFixedStepSeconds
  } satisfies SpeedRampSourceState;
  return {
    state,
    targetSeconds: sourceAtFixedStepSeconds + frame.fixedStepPhase * frame.fixedStepSeconds * rate,
    rate
  };
}
