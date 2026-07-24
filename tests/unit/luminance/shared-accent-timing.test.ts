import { describe, expect, test } from "bun:test";
import type { TransportSample } from "../../../src/audio/transport";
import { LiveScheduleRuntime } from "../../../src/timesampler/integration";

function transport(
  beatPosition: number,
  presentationTimeSeconds: number,
): TransportSample {
  return {
    transportSeconds: beatPosition * 0.5,
    audioOutputTimeSeconds: beatPosition * 0.5,
    performanceTimeSeconds: presentationTimeSeconds,
    presentationTimeSeconds,
    playing: true,
    discontinuityGeneration: 0,
    beatPosition,
    beatPhase: beatPosition - Math.floor(beatPosition),
    beatIntervalSeconds: 0.5,
    beatIndex: Math.floor(beatPosition),
    source: "bpm-fallback",
    fallbackReason: null,
    transportSecondsAtBeat: (beat) => beat * 0.5,
  };
}

describe("G004 shared TimeSampler accent timing", () => {
  test("preview and PGM observe the same persistent LUM origin", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: {
        mode: 0,
        size: 50,
        slices: 8,
        loops: 1,
        rate: 43,
        accent: 0,
      },
      sourceDurationSeconds: 8,
    });

    runtime.advance(transport(0, 10), []);
    const boundary = runtime.advance(transport(1.1, 10.55), []);
    const later = runtime.advance(transport(1.2, 10.6), []);

    expect(boundary.accent).toEqual({
      generation: 1,
      mode: "LUM",
      presentationTimeSeconds: 10.55,
    });
    expect(later.accent).toBe(boundary.accent);
    expect(runtime.getFrame()?.accent).toBe(boundary.accent);
  });

  test("a transport discontinuity clears the active accent", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: { accent: 0 },
      sourceDurationSeconds: 8,
    });
    runtime.advance(transport(0, 1), []);
    expect(runtime.advance(transport(1, 1.5), []).accent).not.toBeNull();

    const reset = {
      ...transport(0, 1.6),
      discontinuityGeneration: 1,
    };
    expect(runtime.advance(reset, []).accent).toBeNull();
  });
});
