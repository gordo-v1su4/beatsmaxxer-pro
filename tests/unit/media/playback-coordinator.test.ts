import { describe, expect, test } from "bun:test";
import {
  MAX_DECODE_QUEUE_SIZE,
  MAX_FRAMES_PER_LANE,
  MAX_GLOBAL_FRAMES,
  PLAYBACK_LANE_ROLES,
  PlaybackCoordinator,
  type LaneDecoderResource,
  type PlaybackLaneRole,
} from "../../../src/media/PlaybackCoordinator";
import { FakeFrame } from "./fakes";

class FakeLaneDecoder implements LaneDecoderResource {
  closeCount = 0;

  constructor(public decodeQueueSize = 0) {}

  close() {
    this.closeCount += 1;
  }
}

function insertFrames(
  coordinator: PlaybackCoordinator<FakeFrame>,
  role: PlaybackLaneRole,
  clipId: string,
  generation: number,
  count: number,
) {
  const frames: FakeFrame[] = [];
  for (let index = 0; index < count; index += 1) {
    const frame = new FakeFrame(index * 33_333);
    frames.push(frame);
    coordinator.insertFrame(
      role,
      {
        clipId,
        generation,
        timestampUs: frame.timestamp,
      },
      frame,
    );
  }
  return frames;
}

describe("three-lane playback coordinator", () => {
  test("has exactly three nullable slots and rejects a fourth", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    expect(PLAYBACK_LANE_ROLES).toEqual([
      "pgm",
      "prewarm",
      "overlap",
    ]);
    expect(coordinator.snapshot().slots).toEqual({
      pgm: null,
      prewarm: null,
      overlap: null,
    });

    coordinator.activate("pgm", "a", 1, new FakeLaneDecoder());
    coordinator.activate("prewarm", "b", 2, new FakeLaneDecoder());
    coordinator.activate("overlap", "c", 3, new FakeLaneDecoder());
    expect(
      Object.values(coordinator.snapshot().slots).filter(Boolean),
    ).toHaveLength(3);
    expect(() =>
      coordinator.activate(
        "aux" as PlaybackLaneRole,
        "d",
        4,
        new FakeLaneDecoder(),
      ),
    ).toThrow("fourth-playback-lane-prohibited");
    coordinator.dispose();
  });

  test("rejects aliased decoder and frame owners across lanes", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    const decoder = new FakeLaneDecoder();
    coordinator.activate("pgm", "a", 1, decoder);
    expect(() =>
      coordinator.activate("prewarm", "b", 1, decoder),
    ).toThrow("decoder-owner-alias");

    coordinator.activate(
      "prewarm",
      "b",
      1,
      new FakeLaneDecoder(),
    );
    const frame = new FakeFrame(0);
    coordinator.insertFrame(
      "pgm",
      { clipId: "a", generation: 1, timestampUs: 0 },
      frame,
    );
    expect(() =>
      coordinator.insertFrame(
        "prewarm",
        { clipId: "b", generation: 1, timestampUs: 0 },
        frame,
      ),
    ).toThrow("frame-owner-alias");

    coordinator.dispose();
    expect(decoder.closeCount).toBe(1);
    expect(frame.closeCount).toBe(1);
  });

  test("isolates source, generation, and frame ownership across all slots", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    coordinator.activate("pgm", "a", 1, new FakeLaneDecoder());
    coordinator.activate("prewarm", "b", 2, new FakeLaneDecoder());
    coordinator.activate("overlap", "c", 3, new FakeLaneDecoder());
    const pgm = insertFrames(coordinator, "pgm", "a", 1, 1)[0];
    const prewarm = insertFrames(
      coordinator,
      "prewarm",
      "b",
      2,
      1,
    )[0];
    const overlap = insertFrames(
      coordinator,
      "overlap",
      "c",
      3,
      1,
    )[0];

    expect(coordinator.leaseFrame("pgm", 0, "pgm")?.frame).toBe(pgm);
    expect(
      coordinator.leaseFrame("prewarm", 0, "prewarm")?.frame,
    ).toBe(prewarm);
    expect(
      coordinator.leaseFrame("overlap", 0, "overlap")?.frame,
    ).toBe(overlap);
    const crossfade = coordinator.leaseCrossfade(0);
    expect(crossfade?.pgm.frame).toBe(pgm);
    expect(crossfade?.overlap.frame).toBe(overlap);
    crossfade?.pgm.release();
    crossfade?.overlap.release();
    coordinator.dispose();
  });

  test("enforces per-slot, global-frame, queue, and batch budgets", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    coordinator.activate("pgm", "a", 1, new FakeLaneDecoder(8));
    coordinator.activate("prewarm", "b", 1, new FakeLaneDecoder());
    coordinator.activate("overlap", "c", 1, new FakeLaneDecoder());
    insertFrames(coordinator, "pgm", "a", 1, 12);
    insertFrames(coordinator, "prewarm", "b", 1, 12);
    insertFrames(coordinator, "overlap", "c", 1, 12);
    const snapshot = coordinator.snapshot();

    expect(MAX_FRAMES_PER_LANE).toBe(12);
    expect(MAX_GLOBAL_FRAMES).toBe(32);
    expect(MAX_DECODE_QUEUE_SIZE).toBe(8);
    expect(snapshot.retainedFrames).toBeLessThanOrEqual(32);
    expect(
      Object.values(snapshot.slots).every(
        (slot) => slot === null || slot.retainedFrames <= 12,
      ),
    ).toBe(true);
    expect(() =>
      coordinator.activate(
        "pgm",
        "bad",
        2,
        new FakeLaneDecoder(9),
      ),
    ).toThrow("decode-queue-budget-exceeded");

    const pgmDecoder = coordinator.getLane("pgm")?.decoder;
    expect(pgmDecoder).toBeInstanceOf(FakeLaneDecoder);
    (pgmDecoder as FakeLaneDecoder).decodeQueueSize = 9;
    expect(coordinator.observeDecoderQueue("pgm")).toBe(false);
    expect((pgmDecoder as FakeLaneDecoder).closeCount).toBe(1);
    expect(coordinator.snapshot().fallback).toEqual({
      path: "html-video-webgl2",
      reason: "decode-queue-budget-exceeded",
    });

    coordinator.activate("pgm", "a2", 2, new FakeLaneDecoder());
    const end = coordinator.beginDecodeBatch("pgm");
    expect(() => coordinator.beginDecodeBatch("pgm")).toThrow(
      "decode-batch-already-active",
    );
    end();
    end();
    expect(() => coordinator.beginDecodeBatch("pgm")).not.toThrow();
    coordinator.dispose();
  });

  test("degrades in the frozen pressure order", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    const prewarmDecoder = new FakeLaneDecoder();
    const overlapDecoder = new FakeLaneDecoder();
    coordinator.activate("pgm", "a", 1, new FakeLaneDecoder());
    coordinator.activate("prewarm", "b", 1, prewarmDecoder);
    coordinator.activate("overlap", "c", 1, overlapDecoder);
    const prewarmFrame = insertFrames(
      coordinator,
      "prewarm",
      "b",
      1,
      1,
    )[0];
    const inactiveFrame = new FakeFrame(0);
    coordinator.retainInactiveFrame(
      { clipId: "inactive", generation: 1, timestampUs: 0 },
      inactiveFrame,
    );

    expect([
      coordinator.degradeForPressure(),
      coordinator.degradeForPressure(),
      coordinator.degradeForPressure(),
      coordinator.degradeForPressure(),
      coordinator.degradeForPressure(),
    ]).toEqual([
      "inactive-cache-evicted",
      "prewarm-frames-dropped",
      "prewarm-decoder-closed",
      "overlap-disabled",
      "html-fallback-selected",
    ]);
    expect(inactiveFrame.closeCount).toBe(1);
    expect(prewarmFrame.closeCount).toBe(1);
    expect(prewarmDecoder.closeCount).toBe(1);
    expect(overlapDecoder.closeCount).toBe(1);
    expect(coordinator.snapshot()).toMatchObject({
      overlapEnabled: false,
      fallback: {
        path: "html-video-webgl2",
        reason: "decoded-frame-pressure",
      },
    });
    coordinator.dispose();
  });

  test("rejects active and inactive frame aliases across pressure disposal", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    coordinator.activate("pgm", "active", 1, new FakeLaneDecoder());
    const activeFrame = insertFrames(
      coordinator,
      "pgm",
      "active",
      1,
      1,
    )[0];
    const activeLease = coordinator.leaseFrame(
      "pgm",
      0,
      "renderer",
    );

    expect(() =>
      coordinator.retainInactiveFrame(
        { clipId: "inactive", generation: 1, timestampUs: 0 },
        activeFrame,
      ),
    ).toThrow("frame-owner-alias");

    const inactiveFrame = new FakeFrame(0);
    coordinator.retainInactiveFrame(
      { clipId: "inactive", generation: 1, timestampUs: 0 },
      inactiveFrame,
    );
    expect(coordinator.snapshot().retainedFrames).toBe(2);

    expect(coordinator.degradeForPressure()).toBe(
      "inactive-cache-evicted",
    );
    expect(inactiveFrame.closeCount).toBe(1);
    expect(activeFrame.closeCount).toBe(0);
    expect(activeLease?.valid).toBe(true);
    expect(coordinator.snapshot().retainedFrames).toBe(1);

    coordinator.dispose();
    expect(activeLease?.valid).toBe(false);
    expect(activeFrame.closeCount).toBe(1);
    expect(inactiveFrame.closeCount).toBe(1);
    expect(coordinator.snapshot()).toMatchObject({
      activeLeases: 0,
      retainedFrames: 0,
    });
  });

  test("preserves transport across renderer recovery or fallback", () => {
    const snapshots: unknown[] = [];
    const coordinator = new PlaybackCoordinator<FakeFrame>({
      onTelemetry(snapshot) {
        snapshots.push(snapshot);
      },
    });
    coordinator.updateTransport({
      presentationTimeSeconds: 12.5,
      playing: true,
      discontinuityGeneration: 7,
    });
    const pgmDecoder = new FakeLaneDecoder();
    const overlapDecoder = new FakeLaneDecoder();
    coordinator.activate("pgm", "a", 1, pgmDecoder);
    coordinator.activate("overlap", "b", 1, overlapDecoder);
    const pgmFrame = insertFrames(
      coordinator,
      "pgm",
      "a",
      1,
      1,
    )[0];
    const overlapFrame = insertFrames(
      coordinator,
      "overlap",
      "b",
      1,
      1,
    )[0];
    const leases = coordinator.leaseCrossfade(0);
    expect(leases).not.toBeNull();
    coordinator.handleRendererLoss(true);
    expect(coordinator.snapshot()).toMatchObject({
      rendererResourceGeneration: 1,
      transport: {
        presentationTimeSeconds: 12.5,
        playing: true,
        discontinuityGeneration: 7,
      },
    });
    coordinator.handleRendererLoss(false);
    expect(coordinator.snapshot()).toMatchObject({
      slots: { pgm: null, prewarm: null, overlap: null },
      fallback: {
        path: "html-video-webgl2",
        reason: "renderer-device-lost",
      },
      transport: { presentationTimeSeconds: 12.5 },
    });
    expect(pgmDecoder.closeCount).toBe(1);
    expect(overlapDecoder.closeCount).toBe(1);
    expect(pgmFrame.closeCount).toBe(1);
    expect(overlapFrame.closeCount).toBe(1);
    expect(leases?.pgm.valid).toBe(false);
    expect(leases?.overlap.valid).toBe(false);
    expect(snapshots.length).toBeGreaterThan(0);
    coordinator.dispose();
  });

  test("disposes decoder and frame resources idempotently", () => {
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    const decoder = new FakeLaneDecoder();
    coordinator.activate("pgm", "a", 1, decoder);
    const frame = insertFrames(coordinator, "pgm", "a", 1, 1)[0];

    coordinator.dispose();
    coordinator.dispose();
    expect(decoder.closeCount).toBe(1);
    expect(frame.closeCount).toBe(1);
    expect(coordinator.snapshot().slots).toEqual({
      pgm: null,
      prewarm: null,
      overlap: null,
    });
  });
});
