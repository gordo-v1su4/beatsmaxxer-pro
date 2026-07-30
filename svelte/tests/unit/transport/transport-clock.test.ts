import { describe, expect, test } from "vitest";
import {
  TransportClock,
  orderTransportEvents,
  type TransportEvent,
} from "$lib/transport";

function reading(transportSeconds: number, presentationTimeMs = transportSeconds * 1_000) {
  return {
    transportSeconds,
    audioOutputTimeSeconds: transportSeconds + 10,
    performanceTimeSeconds: presentationTimeMs / 1_000 + 0.02,
    presentationTimeSeconds: presentationTimeMs / 1_000,
    playing: true,
  };
}

describe("TransportClock", () => {
  test("samples transport and beat position only from the audio-master reading", () => {
    const clock = new TransportClock({ beats: [0, 0.5, 1], bpm: 90 });

    const first = clock.sample(reading(0.25, 5_000));
    const second = clock.sample(reading(0.25, 8_000));

    expect(first).toMatchObject({
      transportSeconds: 0.25,
      beatPosition: 0.5,
      beatPhase: 0.5,
      beatIntervalSeconds: 0.5,
      audioOutputTimeSeconds: 10.25,
      performanceTimeSeconds: 5.02,
      presentationTimeSeconds: 5,
    });
    expect(second.transportSeconds).toBe(first.transportSeconds);
    expect(second.beatPosition).toBe(first.beatPosition);
    expect(second.transportSecondsAtBeat(1)).toBe(0.5);
  });

  test("keeps presentation timestamps monotonic without advancing transport", () => {
    const clock = new TransportClock({ bpm: 120 });
    const first = clock.sample(reading(1, 200));
    const second = clock.sample(reading(1, 100));

    expect(first.presentationTimeSeconds).toBe(0.2);
    expect(second.presentationTimeSeconds).toBe(0.2);
    expect(second.transportSeconds).toBe(1);
  });

  test("increments generation for play, pause, seek, loop wrap, and source change", () => {
    const clock = new TransportClock({ bpm: 120 });

    clock.setPlaying(true, 0);
    clock.sample(reading(2));
    clock.setPlaying(false, 2);
    clock.seek(5);
    clock.seek(0.25, "loop-wrap");
    clock.sourceChanged(0);

    expect(clock.discontinuityGeneration).toBe(5);
    expect(clock.drainEvents().map((event) => {
      return event.type === "transport-discontinuity" ? event.reason : event.type;
    })).toEqual(["play", "pause", "seek", "loop-wrap", "source-change"]);
    expect(clock.sample({ ...reading(0), playing: false }).discontinuityGeneration).toBe(5);
  });

  test("does not emit duplicate playback discontinuities", () => {
    const clock = new TransportClock();

    expect(clock.setPlaying(false)).toBeNull();
    expect(clock.setPlaying(true)?.generation).toBe(1);
    expect(clock.setPlaying(true)).toBeNull();
    expect(clock.drainEvents()).toHaveLength(1);
  });

  test("detects an audio-master loop wrap without RAF-derived time", () => {
    const clock = new TransportClock({ bpm: 120 });

    clock.sample(reading(3));
    const wrapped = clock.sample(reading(0.1, 3_100));

    expect(wrapped.transportSeconds).toBe(0.1);
    expect(wrapped.discontinuityGeneration).toBe(2);
    expect(clock.drainEvents().map((event) => {
      return event.type === "transport-discontinuity" ? event.reason : event.type;
    })).toEqual(["play", "loop-wrap"]);
  });

  test("orders simultaneous events by the frozen reducer priority", () => {
    const events: TransportEvent[] = [
      { type: "scheduled-boundary", boundaryIndex: 4, sequence: 0, transportSeconds: 2 },
      { type: "onset-trigger", sequence: 1, transportSeconds: 2 },
      { type: "midi-trigger", sequence: 2, transportSeconds: 2 },
      { type: "manual-trigger", sequence: 3, transportSeconds: 2 },
      {
        type: "scheduled-parameter-change",
        parameter: "mode",
        value: "REV",
        sequence: 4,
        transportSeconds: 2,
      },
      { type: "source-map-change", sliceCount: 8, sequence: 5, transportSeconds: 2 },
      {
        type: "transport-discontinuity",
        reason: "seek",
        generation: 1,
        fromSeconds: 1,
        toSeconds: 2,
        sequence: 6,
        transportSeconds: 2,
      },
    ];

    expect(orderTransportEvents(events).map((event) => event.type)).toEqual([
      "transport-discontinuity",
      "source-map-change",
      "scheduled-parameter-change",
      "manual-trigger",
      "midi-trigger",
      "onset-trigger",
      "scheduled-boundary",
    ]);
  });

  test("drains queued parameter events once in stable priority order", () => {
    const clock = new TransportClock({ beats: [0, 0.5], bpm: 120 });

    clock.queueEvent({ type: "onset-trigger", transportSeconds: 1 });
    clock.queueScheduledParameter("loop-count", 2, 1);
    clock.setBeatGrid([0, 0.4, 0.9], 128, 1);
    clock.queueSourceMapChange({ durationSeconds: 4, sliceCount: 8 }, 1);

    expect(clock.drainEvents().map((event) => event.type)).toEqual([
      "source-map-change",
      "scheduled-parameter-change",
      "immediate-parameter-change",
      "onset-trigger",
    ]);
    expect(clock.drainEvents()).toEqual([]);
    expect(clock.beatGridStatus).toEqual({ usingHostedGrid: true, fallbackReason: null });
  });
});
