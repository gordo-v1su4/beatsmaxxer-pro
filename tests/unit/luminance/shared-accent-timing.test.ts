import { describe, expect, test } from "bun:test";
import type { TransportSample } from "../../../src/audio/transport";
import {
  applyLuminanceAccent,
  luminanceAccentEnvelopeForMode,
  type Rgb,
} from "../../../src/render/luminanceAccent";
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

  test("one jump emits one accent and the following beat has no LUM flash", () => {
    const runtime = new LiveScheduleRuntime<string>();
    runtime.configureTimeSampler({
      controls: {
        mode: 0,
        size: 70,
        slices: 8,
        loops: 1,
        rate: 43,
        accent: 0,
      },
      sourceDurationSeconds: 8,
    });

    runtime.advance(transport(0, 20), []);
    const jump = runtime.advance(transport(2, 21), []);
    const nextBeat = runtime.advance(transport(3, 21.5), []);
    const source: Rgb = [0.2, 0.4, 0.6];

    expect(jump.timeSampler.jumpGeneration).toBe(1);
    expect(jump.timeSampler.accent?.generation).toBe(1);
    expect(nextBeat.timeSampler.jumpGeneration).toBe(1);
    expect(nextBeat.timeSampler.accent).toBeNull();
    expect(nextBeat.accent).toBe(jump.accent);
    expect(
      luminanceAccentEnvelopeForMode(
        nextBeat.accent?.mode ?? "OFF",
        (nextBeat.transport.presentationTimeSeconds -
          (nextBeat.accent?.presentationTimeSeconds ?? 0)) *
          1_000,
      ),
    ).toBe(0);
    expect(
      applyLuminanceAccent(
        source,
        luminanceAccentEnvelopeForMode(
          nextBeat.accent?.mode ?? "OFF",
          500,
        ),
      ),
    ).toEqual(source);
  });
});
