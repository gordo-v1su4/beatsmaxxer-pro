import { describe, expect, test } from "vitest";
import { TransportClock } from "$lib/transport";
import {
  createTimeSamplerState,
  reduceTimeSampler,
  type TimeSamplerParams,
  type TimeSamplerTransportSample,
} from "$lib/runtime/timesampler";

const PARAMS: TimeSamplerParams = {
  sourceDurationSeconds: 8,
  sliceCount: 4,
  mode: "FWD",
  jumpSizeBeats: 1,
  loopCount: 1,
  playbackRate: 1,
  accentMode: "LUM",
  randomSeed: 0x12345678,
};

function sample(
  beatPosition: number,
  overrides: Partial<TimeSamplerTransportSample> = {},
): TimeSamplerTransportSample {
  return {
    transportSeconds: beatPosition,
    audioOutputTimeSeconds: beatPosition,
    performanceTimeSeconds: beatPosition,
    playing: true,
    discontinuityGeneration: 0,
    beatPosition,
    beatPhase: beatPosition - Math.floor(beatPosition),
    beatIntervalSeconds: 1,
    presentationTimeSeconds: beatPosition,
    ...overrides,
  };
}

describe("TimeSampler event priority", () => {
  test("simultaneous queued params and triggers apply params then consume manual once", () => {
    const initial = createTimeSamplerState(sample(0), PARAMS);
    const nextParams = {
      ...PARAMS,
      mode: "REV" as const,
      jumpSizeBeats: 2,
      loopCount: 2,
    };
    const result = reduceTimeSampler(
      initial.nextState,
      sample(1),
      [
        { type: "onset-trigger" },
        { type: "midi-trigger" },
        { type: "manual-trigger" },
      ],
      nextParams,
    );

    expect(result.nextState.mode).toBe("REV");
    expect(result.output.activeSlice).toBe(2);
    expect(result.output.jumpGeneration).toBe(1);
    expect(result.output.jumpReason).toBe("forced");
    expect(result.output.accent?.generation).toBe(1);
    expect(result.nextState.pendingTrigger).toBeNull();
  });

  test("forced-jump RNG is independent of RND-mode RNG", () => {
    let reduction = createTimeSamplerState(sample(0), {
      ...PARAMS,
      mode: "RND",
    });
    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(1),
      [{ type: "manual-trigger" }],
      { ...PARAMS, mode: "RND" },
    );
    expect(reduction.output.activeSlice).toBe(2);
    expect(reduction.nextState.rndState).toBe(0x12345678);

    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(2),
      [],
      { ...PARAMS, mode: "RND" },
    );
    expect(reduction.output.activeSlice).toBe(3);

    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(3),
      [{ type: "manual-trigger" }],
      { ...PARAMS, mode: "RND" },
    );
    expect(reduction.output.activeSlice).toBe(0);
  });

  test("successive forced jumps follow their own frozen vector", () => {
    let reduction = createTimeSamplerState(sample(0), PARAMS);
    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(1),
      [{ type: "manual-trigger" }],
      PARAMS,
    );
    expect(reduction.output.activeSlice).toBe(2);

    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(2),
      [{ type: "manual-trigger" }],
      PARAMS,
    );
    expect(reduction.output.activeSlice).toBe(0);
  });

  test("discontinuity resets both deterministic RNG streams", () => {
    let reduction = createTimeSamplerState(sample(0), {
      ...PARAMS,
      mode: "RND",
    });
    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(1),
      [],
      { ...PARAMS, mode: "RND" },
    );
    expect(reduction.nextState.rndState).not.toBe(PARAMS.randomSeed);

    const reset = reduceTimeSampler(
      reduction.nextState,
      sample(0, { discontinuityGeneration: 1 }),
      [],
      { ...PARAMS, mode: "RND" },
    );
    expect(reset.nextState.rndState).toBe(PARAMS.randomSeed);
    expect(reset.nextState.forcedJumpState).toBe(PARAMS.randomSeed);
  });

  test("manual and MIDI coalesce without consuming RNG before a boundary", () => {
    const initial = createTimeSamplerState(sample(0), PARAMS);
    const midi = reduceTimeSampler(
      initial.nextState,
      sample(0.25),
      [{ type: "midi-trigger" }],
      PARAMS,
    );
    const manual = reduceTimeSampler(
      midi.nextState,
      sample(0.5),
      [{ type: "manual-trigger" }, { type: "midi-trigger" }],
      PARAMS,
    );

    expect(midi.nextState.forcedJumpState).toBe(0x12345678);
    expect(manual.nextState.forcedJumpState).toBe(0x12345678);
    expect(manual.nextState.pendingTrigger).toBe("manual-trigger");

    const consumed = reduceTimeSampler(
      manual.nextState,
      sample(1),
      [],
      PARAMS,
    );
    expect(consumed.output.activeSlice).toBe(2);
    expect(consumed.nextState.forcedJumpState).not.toBe(0x12345678);
  });

  test("a delayed timestamped trigger is consumed at its actual next boundary", () => {
    const params = { ...PARAMS, mode: "REV" as const };
    const initial = createTimeSamplerState(sample(0), params);
    let dense = reduceTimeSampler(
      initial.nextState,
      sample(1),
      [],
      params,
    );
    dense = reduceTimeSampler(
      dense.nextState,
      sample(2),
      [{ type: "manual-trigger", transportSeconds: 1.2 }],
      params,
    );
    dense = reduceTimeSampler(dense.nextState, sample(3), [], params);
    dense = reduceTimeSampler(dense.nextState, sample(3.1), [], params);

    const sparse = reduceTimeSampler(
      initial.nextState,
      sample(3.1),
      [{ type: "manual-trigger", transportSeconds: 1.2 }],
      params,
    );

    expect(sparse.output).toEqual(dense.output);
    expect(sparse.nextState.forcedJumpState).toBe(
      dense.nextState.forcedJumpState,
    );
    expect(sparse.nextState.pendingTrigger).toBeNull();
    expect(sparse.output.jumpReason).toBeNull();
    expect(sparse.output.accent).toBeNull();
  });

  test("variable-tempo sparse catch-up uses exact historical boundary times", () => {
    const params = { ...PARAMS, mode: "REV" as const };
    const makeClock = () =>
      new TransportClock({
        beats: [0, 0.4, 1.1, 1.5, 2.4],
        bpm: 120,
      });
    const read = (clock: TransportClock, transportSeconds: number) =>
      clock.sample({
        transportSeconds,
        audioOutputTimeSeconds: transportSeconds,
        performanceTimeSeconds: transportSeconds,
        presentationTimeSeconds: transportSeconds,
        playing: true,
      });

    const denseClock = makeClock();
    let dense = createTimeSamplerState(read(denseClock, 0), params);
    dense = reduceTimeSampler(
      dense.nextState,
      read(denseClock, 0.4),
      [],
      params,
    );
    dense = reduceTimeSampler(
      dense.nextState,
      read(denseClock, 1.1),
      [{ type: "manual-trigger", transportSeconds: 0.8 }],
      params,
    );
    dense = reduceTimeSampler(
      dense.nextState,
      read(denseClock, 1.5),
      [],
      params,
    );
    dense = reduceTimeSampler(
      dense.nextState,
      read(denseClock, 1.6),
      [],
      params,
    );

    const sparseClock = makeClock();
    const sparseInitial = createTimeSamplerState(
      read(sparseClock, 0),
      params,
    );
    const sparse = reduceTimeSampler(
      sparseInitial.nextState,
      read(sparseClock, 1.6),
      [{ type: "manual-trigger", transportSeconds: 0.8 }],
      params,
    );

    expect(sparse.output).toEqual(dense.output);
    expect(sparse.nextState.activeSlice).toBe(dense.nextState.activeSlice);
    expect(sparse.nextState.forcedJumpState).toBe(
      dense.nextState.forcedJumpState,
    );
  });

  test("onset cooldown starts at acceptance and includes exactly 250 ms", () => {
    const initial = createTimeSamplerState(sample(0), PARAMS);
    const accepted = reduceTimeSampler(
      initial.nextState,
      sample(0.1, { transportSeconds: 1 }),
      [{ type: "onset-trigger", transportSeconds: 1 }],
      PARAMS,
    );
    const rejected = reduceTimeSampler(
      accepted.nextState,
      sample(0.2, { transportSeconds: 1.249 }),
      [{ type: "onset-trigger", transportSeconds: 1.249 }],
      PARAMS,
    );
    const acceptedAtEdge = reduceTimeSampler(
      rejected.nextState,
      sample(0.3, { transportSeconds: 1.25 }),
      [{ type: "onset-trigger", transportSeconds: 1.25 }],
      PARAMS,
    );

    expect(accepted.nextState.lastAcceptedOnsetTransportSeconds).toBe(1);
    expect(rejected.nextState.lastAcceptedOnsetTransportSeconds).toBe(1);
    expect(acceptedAtEdge.nextState.lastAcceptedOnsetTransportSeconds).toBe(
      1.25,
    );
  });

  test("discontinuity outranks parameter and manual events", () => {
    const initial = createTimeSamplerState(sample(0), PARAMS);
    const result = reduceTimeSampler(
      initial.nextState,
      sample(0, { discontinuityGeneration: 1 }),
      [{ type: "manual-trigger" }],
      { ...PARAMS, sourceDurationSeconds: 4, sliceCount: 2 },
    );

    expect(result.output.activeSlice).toBe(0);
    expect(result.output.effectiveSliceCount).toBe(2);
    expect(result.output.jumpReason).toBe("discontinuity");
    expect(result.output.accent).toBeNull();
    expect(result.nextState.pendingTrigger).toBeNull();
  });
});
