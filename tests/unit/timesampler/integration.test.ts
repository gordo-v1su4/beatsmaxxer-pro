import { describe, expect, test } from "bun:test";
import type { TransportSample } from "../../../src/audio/transport";
import {
  DeterministicPgmSchedule,
  LiveTimeSamplerSchedule,
  jumpSizeBeatsFromControl,
  timeSamplerParamsFromControls,
} from "../../../src/timesampler/integration";

function transport(
  beatPosition: number,
  overrides: Partial<TransportSample> = {},
): TransportSample {
  return {
    transportSeconds: beatPosition * 0.5,
    audioOutputTimeSeconds: beatPosition * 0.5,
    performanceTimeSeconds: beatPosition * 0.5,
    presentationTimeSeconds: beatPosition * 0.5,
    playing: true,
    discontinuityGeneration: 0,
    beatPosition,
    beatPhase: beatPosition - Math.floor(beatPosition),
    beatIntervalSeconds: 0.5,
    beatIndex: Math.floor(beatPosition),
    source: "bpm-fallback",
    ...overrides,
  };
}

const CONTROLS = {
  mode: 0,
  size: 50,
  slices: 4,
  loops: 1,
  rate: 43,
  accent: 0,
};

describe("live TimeSampler integration", () => {
  test("maps production controls to the frozen reducer contract", () => {
    expect(
      [10, 30, 50, 70, 90].map(jumpSizeBeatsFromControl),
    ).toEqual([0.25, 0.5, 1, 2, 4]);
    expect(timeSamplerParamsFromControls(CONTROLS, 8)).toMatchObject({
      sourceDurationSeconds: 8,
      sliceCount: 4,
      mode: "FWD",
      jumpSizeBeats: 1,
      loopCount: 1,
      accentMode: "LUM",
      randomSeed: 0x12345678,
    });
  });

  test("multiple consumers share an identical sample without double reduction", () => {
    const schedule = new LiveTimeSamplerSchedule();
    const input = {
      controls: CONTROLS,
      sourceDurationSeconds: 8,
    };

    const preview = schedule.sample(transport(0), [], input);
    const pgm = schedule.sample(transport(0), [], input);

    expect(pgm).toEqual(preview);
    expect(pgm.jumpGeneration).toBe(0);
  });

  test("an initial transport trigger is not dropped during schedule creation", () => {
    const schedule = new LiveTimeSamplerSchedule();
    schedule.sample(
      transport(0),
      [{ type: "midi-trigger", transportSeconds: 0 }],
      {
        controls: CONTROLS,
        sourceDurationSeconds: 8,
      },
    );
    const output = schedule.sample(transport(1), [], {
      controls: CONTROLS,
      sourceDurationSeconds: 8,
    });

    expect(output.jumpReason).toBe("forced");
    expect(output.jumpGeneration).toBe(1);
  });

  test("stopped presentation frames never advance source time", () => {
    const schedule = new LiveTimeSamplerSchedule();
    const input = {
      controls: CONTROLS,
      sourceDurationSeconds: 8,
    };
    const stopped = transport(0.5, {
      transportSeconds: 0.25,
      playing: false,
      discontinuityGeneration: 1,
    });
    const first = schedule.sample(stopped, [], input);
    const laterPresentation = schedule.sample(
      {
        ...stopped,
        presentationTimeSeconds: 10,
        performanceTimeSeconds: 10,
      },
      [],
      input,
    );

    expect(laterPresentation.sourceTimestampSeconds).toBe(
      first.sourceTimestampSeconds,
    );
    expect(laterPresentation.jumpGeneration).toBe(first.jumpGeneration);
  });

  test("MIDI scanning is shared and consumes one deterministic forced jump", () => {
    const schedule = new LiveTimeSamplerSchedule();
    const input = {
      controls: CONTROLS,
      sourceDurationSeconds: 8,
      midiNotes: [{ time: 0.6 }],
      midiDurationSeconds: 2,
    };
    schedule.sample(transport(0), [], input);
    schedule.sample(
      transport(1.5, { transportSeconds: 0.75 }),
      [],
      input,
    );
    const boundary = schedule.sample(
      transport(2, { transportSeconds: 1 }),
      [],
      input,
    );

    expect(boundary.jumpReason).toBe("forced");
    expect(boundary.activeSlice).toBe(2);
    expect(boundary.jumpGeneration).toBe(2);
  });
});

describe("deterministic PGM schedule", () => {
  const sources = ["a", "b", "c", "d"] as const;

  test("queued selection wins over auto-random at the same boundary", () => {
    const schedule = new DeterministicPgmSchedule<string>();
    schedule.sample(transport(0), {
      active: "a",
      sources,
      queued: "c",
      autoRandom: true,
      intervalBeats: 1,
      feel: 0,
    });
    const boundary = schedule.sample(transport(1), {
      active: "a",
      sources,
      queued: "c",
      autoRandom: true,
      intervalBeats: 1,
      feel: 0,
    });

    expect(boundary.selected).toBe("c");
    expect(boundary.consumedQueued).toBe(true);
  });

  test("seeded auto switching replays identically under sparse sampling", () => {
    const run = () => {
      const schedule = new DeterministicPgmSchedule<string>(0x12345678);
      schedule.sample(transport(0), {
        active: "a",
        sources,
        queued: null,
        autoRandom: true,
        intervalBeats: 1,
        feel: 0,
      });
      return schedule.sample(transport(4), {
        active: "a",
        sources,
        queued: null,
        autoRandom: true,
        intervalBeats: 1,
        feel: 0,
      });
    };

    expect(run()).toEqual(run());
  });

  test("discontinuity re-arms the next boundary without an immediate cut", () => {
    const schedule = new DeterministicPgmSchedule<string>();
    schedule.sample(transport(0), {
      active: "a",
      sources,
      queued: "b",
      autoRandom: false,
      intervalBeats: 4,
      feel: 0,
    });
    const seek = schedule.sample(
      transport(7.5, { discontinuityGeneration: 1 }),
      {
        active: "a",
        sources,
        queued: "b",
        autoRandom: false,
        intervalBeats: 4,
        feel: 0,
      },
    );

    expect(seek.selected).toBeNull();
    expect(seek.nextBoundaryBeat).toBe(8);
  });
});
