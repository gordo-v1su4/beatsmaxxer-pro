import { describe, expect, test } from "bun:test";
import { BeatGrid } from "../../../src/audio/transport/BeatGrid";

describe("BeatGrid", () => {
  test("interpolates before, between, and after hosted beats", () => {
    const grid = new BeatGrid([0.5, 1, 1.75, 2.25], 120);

    expect(grid.sample(0.25)).toMatchObject({
      beatPosition: -0.5,
      beatPhase: 0.5,
      beatIntervalSeconds: 0.5,
      source: "hosted-grid",
    });
    expect(grid.sample(1.375)).toMatchObject({
      beatPosition: 1.5,
      beatPhase: 0.5,
      beatIntervalSeconds: 0.75,
      source: "hosted-grid",
    });
    expect(grid.sample(2.75)).toMatchObject({
      beatPosition: 4,
      beatPhase: 0,
      beatIntervalSeconds: 0.5,
      source: "hosted-grid",
    });
  });

  test("uses the last valid interval for tail extrapolation", () => {
    const grid = new BeatGrid([0, 0.4, 1.1], 120);
    const sample = grid.sample(1.8);

    expect(sample.beatPosition).toBeCloseTo(3);
    expect(sample.beatIntervalSeconds).toBeCloseTo(0.7);
  });

  test("BPM bypass preserves the hosted grid", () => {
    const grid = new BeatGrid([0, 0.4, 1], 120);

    expect(grid.sample(0.5, true)).toMatchObject({
      beatPosition: 1,
      beatPhase: 0,
      beatIntervalSeconds: 0.5,
      source: "bpm-fallback",
      fallbackReason: "bpm-lock",
    });
    const hostedSample = grid.sample(0.5);
    expect(hostedSample).toMatchObject({
      beatIntervalSeconds: 0.6,
      source: "hosted-grid",
    });
    expect(hostedSample.beatPosition).toBeCloseTo(1 + 1 / 6);
    expect(grid.beats).toEqual([0, 0.4, 1]);
  });

  test.each([
    [[], "missing"],
    [[1], "insufficient-beats"],
    [[0, Number.NaN], "non-finite-beat"],
    [[-0.1, 0.5], "negative-beat"],
    [[0.5, 0.5], "non-increasing-beats"],
  ] as const)("falls back visibly for invalid grid %p", (beats, fallbackReason) => {
    const grid = new BeatGrid(beats, 120);

    expect(grid.status).toEqual({ usingHostedGrid: false, fallbackReason });
    expect(grid.sample(0.25)).toMatchObject({
      beatPosition: 0.5,
      beatPhase: 0.5,
      source: "bpm-fallback",
      fallbackReason,
    });
  });
});
