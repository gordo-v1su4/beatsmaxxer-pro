import { describe, expect, test } from "vitest";
import type {
  TransportEvent,
  TransportSample,
} from "$lib/transport";
import {
  LiveScheduleRuntime,
  LiveTimeSamplerSchedule,
  jumpSizeBeatsFromControl,
  timeSamplerParamsFromControls,
} from "$lib/timesampler/integration";

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
    fallbackReason: null,
    transportSecondsAtBeat: (beat) => beat * 0.5,
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

function triggerEvents(
  events: ReturnType<LiveScheduleRuntime["generatedTriggerEvents"]>,
): TransportEvent[] {
  return events.map((event, sequence) => ({
    ...event,
    sequence,
    transportSeconds: event.transportSeconds ?? 0
  }));
}

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

  test("swapping the clip clears state that described the old one", () => {
    // This is the regression the duplicated runtime hid. Two copies of this
    // file existed; only the one the app did NOT import reset on a source
    // change, and `accent` is the LUM/RGB channel the shader reads. A stale
    // accent survives into the new clip and decays against a playhead that has
    // moved elsewhere, so the channel appears to work or not work depending on
    // whether the clip change landed mid-accent.
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: CONTROLS,
      sourceDurationSeconds: 8,
      sourceKey: "clip-a",
    });
    runtime.advance(transport(0), []);
    expect(runtime.getFrame()).not.toBeNull();

    runtime.configureTimeSampler({
      controls: CONTROLS,
      sourceDurationSeconds: 8,
      sourceKey: "clip-b",
    });
    expect(runtime.getFrame()).toBeNull();
  });

  test("reconfiguring the SAME clip keeps the frame", () => {
    // The reset must key on the clip, not on any reconfigure: AppLoop pushes
    // this input every frame, so resetting unconditionally would clear the
    // sampler continuously and it would never advance at all.
    const runtime = new LiveScheduleRuntime<string>();
    const input = {
      controls: CONTROLS,
      sourceDurationSeconds: 8,
      sourceKey: "clip-a",
    };
    runtime.configureTimeSampler(input);
    runtime.advance(transport(0), []);
    const before = runtime.getFrame();

    runtime.configureTimeSampler({ ...input });
    expect(runtime.getFrame()).toBe(before);
  });

  test("preview and PGM read one centrally reduced frame", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: CONTROLS,
      sourceDurationSeconds: 8,
    });

    const advanced = runtime.advance(transport(0), []);
    const preview = runtime.getFrame();
    const pgm = runtime.getFrame();

    expect(preview).toBe(advanced);
    expect(pgm).toBe(advanced);
    expect(pgm?.timeSampler.jumpGeneration).toBe(0);
  });

  test("local consumer onset values cannot independently reduce shared state", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: CONTROLS,
      sourceDurationSeconds: 8,
      onsetSensitivity: 0.5,
    });
    runtime.advance(transport(0), []);
    runtime.generatedTriggerEvents(transport(0), 0);

    const current = transport(0.5);
    const generated = runtime.generatedTriggerEvents(current, 1.5);
    const frame = runtime.advance(current, triggerEvents(generated));

    expect(generated).toEqual([
      { type: "onset-trigger", transportSeconds: 0.25 },
    ]);
    expect(runtime.getFrame()).toBe(frame);
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

  test("central MIDI scanning emits one timestamped deterministic trigger", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: CONTROLS,
      sourceDurationSeconds: 8,
      midiNotes: [{ time: 0.6 }],
      midiDurationSeconds: 2,
    });

    runtime.generatedTriggerEvents(transport(0), 0);
    const current = transport(1.5, { transportSeconds: 0.75 });
    const events = runtime.generatedTriggerEvents(current, 0);
    runtime.advance(transport(0), []);
    const frame = runtime.advance(current, triggerEvents(events));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("midi-trigger");
    expect(events[0]?.transportSeconds).toBeCloseTo(0.6);
    expect(frame.timeSampler.jumpGeneration).toBe(1);
    expect(frame.timeSampler.jumpReason).toBeNull();

    const boundary = runtime.advance(transport(2), []);
    expect(boundary.timeSampler.jumpReason).toBe("forced");
    expect(boundary.timeSampler.activeSlice).toBe(2);
  });
});

describe("central deterministic PGM schedule", () => {
  const sources = ["a", "b", "c", "d"] as const;

  test("queued selection wins over auto-random in the shared advance", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configurePgm({
      active: "a",
      sources,
      queued: "c",
      autoRandom: true,
      intervalBeats: 1,
      feel: 0,
    });

    runtime.advance(transport(0), []);
    const boundary = runtime.advance(transport(1), []);

    expect(boundary.pgm.selected).toBe("c");
    expect(boundary.pgm.consumedQueued).toBe(true);
  });

  test("seeded auto switching replays identically under sparse sampling", () => {
    const run = () => {
      const runtime = new LiveScheduleRuntime<string>(0x12345678);
      runtime.configurePgm({
        active: "a",
        sources,
        queued: null,
        autoRandom: true,
        intervalBeats: 1,
        feel: 0,
      });
      runtime.advance(transport(0), []);
      return runtime.advance(transport(4), []).pgm;
    };

    expect(run()).toEqual(run());
  });

  test("next random source is knowable before the boundary without consuming it", () => {
    const runtime = new LiveScheduleRuntime<string>(0x12345678);
    runtime.configurePgm({
      active: "a",
      sources,
      queued: null,
      autoRandom: true,
      intervalBeats: 1,
      feel: 0,
    });

    runtime.advance(transport(0), []);
    const prepared = runtime.getPgmPreparation();
    const boundary = runtime.advance(transport(1), []);

    expect(prepared.boundaryBeat).toBe(1);
    expect(prepared.source).not.toBeNull();
    expect(boundary.pgm.selected).toBe(prepared.source);
  });

  test("discontinuity re-arms the next boundary without an immediate cut", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configurePgm({
      active: "a",
      sources,
      queued: "b",
      autoRandom: false,
      intervalBeats: 4,
      feel: 0,
    });
    runtime.advance(transport(0), []);
    const seek = runtime.advance(
      transport(7.5, { discontinuityGeneration: 1 }),
      [],
    );

    expect(seek.pgm.selected).toBeNull();
    expect(seek.pgm.nextBoundaryBeat).toBe(8);
  });

  test("1BT swing RAND fires on long-then-short pair boundaries", () => {
    const runtime = new LiveScheduleRuntime<string>(0xdeadbeef);
    runtime.configurePgm({
      active: "a",
      sources,
      queued: null,
      autoRandom: true,
      intervalBeats: 1,
      feel: 1,
    });
    runtime.advance(transport(0), []);

    const atLong = runtime.advance(transport(4 / 3), []);
    expect(atLong.pgm.selected).not.toBeNull();
    expect(atLong.pgm.selected).not.toBe("a");

    runtime.configurePgm({
      active: atLong.pgm.selected ?? "b",
      sources,
      queued: null,
      autoRandom: true,
      intervalBeats: 1,
      feel: 1,
    });
    const atPair = runtime.advance(transport(2), []);
    expect(atPair.pgm.selected).not.toBeNull();
  });
});
