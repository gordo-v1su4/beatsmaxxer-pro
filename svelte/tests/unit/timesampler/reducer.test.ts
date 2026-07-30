import { describe, expect, test } from "vitest";
import {
  createTimeSamplerState,
  reduceTimeSampler,
  type TimeSamplerMode,
  type TimeSamplerParams,
  type TimeSamplerTransportSample,
} from "$lib/runtime/timesampler";

const BASE_PARAMS: TimeSamplerParams = {
  sourceDurationSeconds: 16,
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
    transportSeconds: beatPosition * 0.5,
    audioOutputTimeSeconds: beatPosition * 0.5,
    performanceTimeSeconds: beatPosition * 0.5,
    playing: true,
    discontinuityGeneration: 0,
    beatPosition,
    beatPhase: beatPosition - Math.floor(beatPosition),
    beatIntervalSeconds: 0.5,
    presentationTimeSeconds: beatPosition * 0.5,
    ...overrides,
  };
}

function sequence(
  mode: TimeSamplerMode,
  boundaries: number,
  overrides: Partial<TimeSamplerParams> = {},
): number[] {
  const params = { ...BASE_PARAMS, ...overrides, mode };
  let reduction = createTimeSamplerState(sample(0), params);
  const slices = [reduction.output.activeSlice];

  for (let boundary = 1; boundary <= boundaries; boundary += 1) {
    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(boundary * params.jumpSizeBeats),
      [],
      params,
    );
    slices.push(reduction.output.activeSlice);
  }

  return slices;
}

describe("TimeSampler frozen vectors", () => {
  test.each([
    ["FWD", 4, [0, 1, 2, 3, 0]],
    ["REV", 4, [3, 2, 1, 0, 3]],
    ["PONG", 6, [0, 1, 2, 3, 2, 1, 0]],
    ["RND", 8, [0, 2, 0, 1, 2, 1, 0, 2, 3]],
  ] as const)("%s follows the approved sequence", (mode, boundaries, expected) => {
    expect(sequence(mode, boundaries)).toEqual(expected);
  });

  test("loop count is the number of boundary intervals on a slice", () => {
    expect(sequence("FWD", 5, { loopCount: 2 })).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
  });

  test("exact boundary is processed once", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    const before = reduceTimeSampler(
      initial.nextState,
      sample(1 - 1e-6),
      [],
      BASE_PARAMS,
    );
    const exact = reduceTimeSampler(
      before.nextState,
      sample(1),
      [],
      BASE_PARAMS,
    );
    const after = reduceTimeSampler(
      exact.nextState,
      sample(1 + 1e-6),
      [],
      BASE_PARAMS,
    );

    expect(before.output.activeSlice).toBe(0);
    expect(exact.output.activeSlice).toBe(1);
    expect(after.output.activeSlice).toBe(1);
    expect(after.output.jumpGeneration).toBe(exact.output.jumpGeneration);
  });
});

describe("TimeSampler schedule matrix", () => {
  const modes: TimeSamplerMode[] = ["FWD", "REV", "PONG", "RND"];
  const sliceCounts = [4, 8, 16, 32];
  const jumpSizes = [0.25, 0.5, 1, 2, 4];
  const loopCounts = [1, 2, 4, 8];
  const rates = [0.25, 1, 4];

  test("all approved parameter combinations stay deterministic and in bounds", () => {
    for (const mode of modes) {
      for (const sliceCount of sliceCounts) {
        for (const jumpSizeBeats of jumpSizes) {
          for (const loopCount of loopCounts) {
            for (const playbackRate of rates) {
              const params = {
                ...BASE_PARAMS,
                mode,
                sliceCount,
                jumpSizeBeats,
                loopCount,
                playbackRate,
              };
              const first = sequenceFromSamples(params);
              const replay = sequenceFromSamples(params);

              expect(replay).toEqual(first);
              for (const output of first) {
                expect(Number.isFinite(output.sourceTimestampSeconds)).toBe(true);
                expect(output.sourceTimestampSeconds).toBeGreaterThanOrEqual(0);
                expect(output.sourceTimestampSeconds).toBeLessThanOrEqual(
                  params.sourceDurationSeconds,
                );
                expect(output.activeSlice).toBeGreaterThanOrEqual(0);
                expect(output.activeSlice).toBeLessThan(output.effectiveSliceCount);
              }
            }
          }
        }
      }
    }
  });

  test("catching up boundaries is independent of render sampling rate", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    let dense = initial;
    for (const beat of [0.25, 0.75, 1, 1.5, 2, 2.5, 3]) {
      dense = reduceTimeSampler(dense.nextState, sample(beat), [], BASE_PARAMS);
    }
    const sparse = reduceTimeSampler(
      initial.nextState,
      sample(3),
      [],
      BASE_PARAMS,
    );

    expect(sparse.output).toMatchObject({
      activeSlice: dense.output.activeSlice,
      sourceTimestampSeconds: dense.output.sourceTimestampSeconds,
      jumpGeneration: dense.output.jumpGeneration,
    });
  });

  test("catch-up exposes only a boundary at the current sample", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    let dense = initial;
    for (const beat of [1, 2, 3]) {
      dense = reduceTimeSampler(dense.nextState, sample(beat), [], BASE_PARAMS);
    }
    const sparseExact = reduceTimeSampler(
      initial.nextState,
      sample(3),
      [],
      BASE_PARAMS,
    );

    expect(sparseExact.output).toEqual(dense.output);

    const denseAfter = reduceTimeSampler(
      dense.nextState,
      sample(3 + 1e-6),
      [],
      BASE_PARAMS,
    );
    const sparseAfter = reduceTimeSampler(
      initial.nextState,
      sample(3 + 1e-6),
      [],
      BASE_PARAMS,
    );

    expect(sparseAfter.output).toEqual(denseAfter.output);
    expect(sparseAfter.output.jumpReason).toBeNull();
    expect(sparseAfter.output.accent).toBeNull();
  });

  test("source progress uses audio-master elapsed time across tempo changes", () => {
    const initial = createTimeSamplerState(
      sample(0, { beatIntervalSeconds: 0.5 }),
      BASE_PARAMS,
    );
    const beforeTempoChange = reduceTimeSampler(
      initial.nextState,
      sample(0.5, {
        transportSeconds: 0.25,
        beatIntervalSeconds: 0.5,
      }),
      [],
      BASE_PARAMS,
    );
    const afterTempoChange = reduceTimeSampler(
      beforeTempoChange.nextState,
      sample(0.75, {
        transportSeconds: 0.5,
        beatIntervalSeconds: 1,
      }),
      [],
      BASE_PARAMS,
    );

    expect(beforeTempoChange.output.sourceTimestampSeconds).toBe(0.25);
    expect(afterTempoChange.output.sourceTimestampSeconds).toBe(0.5);
  });

  test("a source shorter than a requested slice has one effective slice", () => {
    const params = {
      ...BASE_PARAMS,
      sourceDurationSeconds: 0.1,
      sliceCount: 32,
      jumpSizeBeats: 1,
    };
    const initial = createTimeSamplerState(sample(0), params);
    const next = reduceTimeSampler(initial.nextState, sample(1), [], params);

    expect(next.output.effectiveSliceCount).toBe(1);
    expect(next.output.activeSlice).toBe(0);
  });
});

function sequenceFromSamples(params: TimeSamplerParams) {
  let reduction = createTimeSamplerState(sample(0), params);
  const outputs = [reduction.output];
  for (const beat of [
    params.jumpSizeBeats - 1e-6,
    params.jumpSizeBeats,
    params.jumpSizeBeats + 1e-6,
    params.jumpSizeBeats * 2,
    params.jumpSizeBeats * 5,
  ]) {
    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(beat),
      [],
      params,
    );
    outputs.push(reduction.output);
  }
  return outputs;
}

describe("TimeSampler parameter and discontinuity transitions", () => {
  test("rate and accent mode update immediately without a jump", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    const nextParams = {
      ...BASE_PARAMS,
      playbackRate: 2,
      accentMode: "RGB" as const,
    };
    const changed = reduceTimeSampler(
      initial.nextState,
      sample(0.5),
      [],
      nextParams,
    );

    expect(changed.output.targetPlaybackRate).toBe(2);
    expect(changed.output.sourceTimestampSeconds).toBe(
      initial.output.sourceTimestampSeconds + 0.25,
    );
    expect(changed.output.jumpGeneration).toBe(0);
    expect(changed.output.accent).toBeNull();
  });

  test("rate changes never alter slice topology or remap the source", () => {
    const params = {
      ...BASE_PARAMS,
      sourceDurationSeconds: 1,
      mode: "REV" as const,
      playbackRate: 1,
    };
    const initial = createTimeSamplerState(
      sample(0, { beatIntervalSeconds: 0.2 }),
      params,
    );
    const before = reduceTimeSampler(
      initial.nextState,
      sample(0.25, {
        transportSeconds: 0.05,
        beatIntervalSeconds: 0.2,
      }),
      [],
      params,
    );
    const changed = reduceTimeSampler(
      before.nextState,
      sample(0.25, {
        transportSeconds: 0.05,
        beatIntervalSeconds: 0.2,
      }),
      [],
      { ...params, playbackRate: 10 },
    );

    expect(before.output.effectiveSliceCount).toBe(4);
    expect(changed.output.effectiveSliceCount).toBe(4);
    expect(changed.output.sourceTimestampSeconds).toBe(
      before.output.sourceTimestampSeconds,
    );
    expect(changed.output.jumpGeneration).toBe(before.output.jumpGeneration);
    expect(changed.output.jumpReason).toBeNull();
    expect(changed.output.accent).toBeNull();
  });

  test("stopping preserves the source position frozen by the transport", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    const playing = reduceTimeSampler(
      initial.nextState,
      sample(0.5),
      [],
      BASE_PARAMS,
    );
    const stopped = reduceTimeSampler(
      playing.nextState,
      sample(0.5, { playing: false }),
      [],
      BASE_PARAMS,
    );

    expect(stopped.output.sourceTimestampSeconds).toBe(
      playing.output.sourceTimestampSeconds,
    );
  });

  test("mode, jump size, and loop count arm until the next boundary", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    const nextParams = {
      ...BASE_PARAMS,
      mode: "REV" as const,
      jumpSizeBeats: 2,
      loopCount: 2,
    };
    const armed = reduceTimeSampler(
      initial.nextState,
      sample(0.5),
      [],
      nextParams,
    );
    const applied = reduceTimeSampler(
      armed.nextState,
      sample(1),
      [],
      nextParams,
    );

    expect(armed.nextState.mode).toBe("FWD");
    expect(armed.output.sourceTimestampSeconds).toBeGreaterThan(0);
    expect(applied.nextState.mode).toBe("REV");
    expect(applied.nextState.jumpSizeBeats).toBe(2);
    expect(applied.nextState.loopCount).toBe(2);
  });

  test("slice count and duration remap immediately and only jump if time changes", () => {
    const initial = createTimeSamplerState(sample(0), BASE_PARAMS);
    const atSliceTwo = reduceTimeSampler(
      initial.nextState,
      sample(2),
      [],
      BASE_PARAMS,
    );
    const changed = reduceTimeSampler(
      atSliceTwo.nextState,
      sample(2.25),
      [],
      { ...BASE_PARAMS, sourceDurationSeconds: 8, sliceCount: 2 },
    );

    expect(changed.output.activeSlice).toBe(1);
    expect(changed.output.jumpReason).toBe("source-remap");
    expect(changed.output.jumpGeneration).toBe(
      atSliceTwo.output.jumpGeneration + 1,
    );
    expect(changed.output.accent).toBeNull();
  });

  test("discontinuity resets mode state, clears triggers and emits no accent", () => {
    let reduction = createTimeSamplerState(sample(0), BASE_PARAMS);
    reduction = reduceTimeSampler(
      reduction.nextState,
      sample(0.5),
      [{ type: "manual-trigger" }],
      BASE_PARAMS,
    );
    const reset = reduceTimeSampler(
      reduction.nextState,
      sample(0.1, {
        transportSeconds: 0.05,
        discontinuityGeneration: 1,
      }),
      [{ type: "manual-trigger" }],
      BASE_PARAMS,
    );

    expect(reset.output.activeSlice).toBe(0);
    expect(reset.output.jumpReason).toBe("discontinuity");
    expect(reset.output.accent).toBeNull();
    expect(reset.nextState.pendingTrigger).toBeNull();
    expect(reset.nextState.lastAcceptedOnsetTransportSeconds).toBeNull();
  });
});
