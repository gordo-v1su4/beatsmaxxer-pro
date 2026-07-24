import { beforeEach, describe, expect, test } from "bun:test";
import {
  getQaTelemetrySnapshot,
  recordRenderedFrame,
  registerWebGlRenderer,
  resetQaTelemetryForTests,
  updateMediaTelemetry,
  updateSharedVideoResources,
} from "../../../src/qa/telemetry";

describe("QA telemetry", () => {
  beforeEach(resetQaTelemetryForTests);

  test("tracks renderer resources and idempotent cleanup", () => {
    const release = registerWebGlRenderer(2);
    expect(getQaTelemetrySnapshot().resources).toMatchObject({
      renderers: 1,
      renderTargets: 2,
    });

    release();
    release();
    expect(getQaTelemetrySnapshot()).toMatchObject({
      renderer: { backend: "none", active: 0 },
      resources: { renderers: 0, renderTargets: 0 },
    });
  });

  test("records bounded frame interval statistics", () => {
    recordRenderedFrame(100);
    recordRenderedFrame(116);
    recordRenderedFrame(150);

    expect(getQaTelemetrySnapshot().frames).toEqual({
      rendered: 3,
      lastIntervalMs: 34,
      averageIntervalMs: 25,
      maxIntervalMs: 34,
    });
  });

  test("reports unavailable decoder and cache without invented values", () => {
    updateSharedVideoResources(2, 3);
    expect(getQaTelemetrySnapshot()).toMatchObject({
      decoder: { state: "unavailable", queueSize: null },
      cache: { occupancy: null, capacity: null },
      resources: { sharedVideos: 2, sharedVideoRefs: 3 },
    });
  });

  test("records observable media lane and resource state", () => {
    updateMediaTelemetry({
      decoder: { state: "decoding", queueSize: 4 },
      cache: { occupancy: 18, capacity: 32 },
      playback: {
        path: "webcodecs-webgl2",
        fallbackReason: "webgpu-unavailable",
        activeLanes: 3,
      },
      resources: { decodedFrames: 18, activeDecoders: 3 },
    });

    expect(getQaTelemetrySnapshot()).toMatchObject({
      decoder: { state: "decoding", queueSize: 4 },
      cache: { occupancy: 18, capacity: 32 },
      playback: {
        path: "webcodecs-webgl2",
        fallbackReason: "webgpu-unavailable",
        activeLanes: 3,
      },
      resources: { decodedFrames: 18, activeDecoders: 3 },
    });
  });
});
