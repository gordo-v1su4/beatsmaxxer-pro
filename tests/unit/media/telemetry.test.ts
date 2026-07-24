import { beforeEach, describe, expect, test } from "bun:test";
import { FrameCache } from "../../../src/media/FrameCache";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import { QaMediaTelemetryBridge } from "../../../src/media/telemetry";
import {
  getQaTelemetrySnapshot,
  resetQaTelemetryForTests,
} from "../../../src/qa/telemetry";
import { FakeFrame } from "./fakes";

describe("media core QA telemetry bridge", () => {
  beforeEach(resetQaTelemetryForTests);

  test("feeds decoder, cache, coordinator, and resource metrics", () => {
    const bridge = new QaMediaTelemetryBridge();
    bridge.decoder("decoding", 3);
    const cache = new FrameCache<FakeFrame>(2, {
      onMetrics: bridge.cache,
    });
    cache.insert(
      { clipId: "direct", generation: 1, timestampUs: 0 },
      new FakeFrame(0),
    );
    expect(getQaTelemetrySnapshot()).toMatchObject({
      decoder: { state: "decoding", queueSize: 3 },
      cache: { occupancy: 1, capacity: 2 },
      resources: { decodedFrames: 1 },
    });

    const coordinator = new PlaybackCoordinator<FakeFrame>({
      initialPlayback: {
        path: "webcodecs-webgpu",
        reason: null,
      },
      onTelemetry: bridge.coordinator,
    });
    coordinator.activate("pgm", "a", 1, {
      decodeQueueSize: 2,
      close() {},
    });
    coordinator.insertFrame(
      "pgm",
      { clipId: "a", generation: 1, timestampUs: 0 },
      new FakeFrame(0),
    );
    bridge.resources({
      gpuTextures: 2,
      gpuBuffers: 1,
      objectUrls: 3,
      videoElements: 1,
    });

    expect(getQaTelemetrySnapshot()).toMatchObject({
      renderer: { backend: "webgpu" },
      decoder: { state: "decoding", queueSize: 2 },
      cache: { occupancy: 1, capacity: 32 },
      playback: {
        path: "webcodecs-webgpu",
        fallbackReason: null,
        activeLanes: 1,
      },
      resources: {
        decodedFrames: 1,
        activeDecoders: 1,
        gpuTextures: 2,
        gpuBuffers: 1,
        objectUrls: 3,
        videoElements: 1,
      },
    });

    coordinator.handleRendererLoss(false);
    expect(getQaTelemetrySnapshot()).toMatchObject({
      renderer: { backend: "html-video-webgl2" },
      playback: {
        path: "html-video-webgl2",
        fallbackReason: "renderer-device-lost",
        activeLanes: 0,
      },
      resources: { decodedFrames: 0, activeDecoders: 0 },
    });
    cache.dispose();
    coordinator.dispose();
  });
});
