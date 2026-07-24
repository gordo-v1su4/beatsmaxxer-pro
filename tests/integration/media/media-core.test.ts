import { describe, expect, test } from "bun:test";
import { createClipAsset } from "../../../src/media/ClipAsset";
import {
  WebCodecsClipDecoder,
  type DecoderCallbacks,
  type VideoDecoderAdapter,
  type VideoDecoderFactory,
} from "../../../src/media/decoder/WebCodecsClipDecoder";
import { sampleAtTimestamp } from "../../../src/media/demux/mp4";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import type {
  EncodedVideoSample,
  VideoDecoderConfigLike,
} from "../../../src/media/types";
import { FakeFrame, mediaTrackFixture } from "../../unit/media/fakes";

class HeadlessAdapter implements VideoDecoderAdapter {
  private queue: EncodedVideoSample[] = [];
  closed = false;

  constructor(readonly callbacks: DecoderCallbacks<FakeFrame>) {}

  get decodeQueueSize() {
    return this.queue.length;
  }

  configure(_config: VideoDecoderConfigLike) {}

  decode(sample: EncodedVideoSample) {
    this.queue.push(sample);
  }

  async flush() {
    while (this.queue.length > 0) this.emitNext();
  }

  async waitForDequeue() {
    this.emitNext();
  }

  reset() {
    this.queue.length = 0;
  }

  close() {
    this.closed = true;
  }

  emitStale() {
    const frame = new FakeFrame(999_999);
    this.callbacks.output(frame);
    return frame;
  }

  private emitNext() {
    const sample = this.queue.shift();
    if (!sample) return;
    this.callbacks.output(
      new FakeFrame(sample.timestampUs, sample.durationUs),
    );
  }
}

class HeadlessFactory implements VideoDecoderFactory<FakeFrame> {
  readonly adapters: HeadlessAdapter[] = [];

  create(callbacks: DecoderCallbacks<FakeFrame>) {
    const adapter = new HeadlessAdapter(callbacks);
    this.adapters.push(adapter);
    return adapter;
  }
}

function longTrack(offsetUs: number) {
  const track = mediaTrackFixture();
  track.samples = Array.from({ length: 20 }, (_, index) => ({
    index,
    decodeTimestampUs: offsetUs + index * 40_000,
    timestampUs: offsetUs + index * 40_000,
    durationUs: 40_000,
    type: index === 0 ? ("key" as const) : ("delta" as const),
    data: new Uint8Array([index]),
  }));
  return track;
}

describe("headless media-core integration", () => {
  test("random seeks dispose stale output and retain only the selected generation", async () => {
    const asset = createClipAsset("random", longTrack(1_000_000));
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    const factory = new HeadlessFactory();
    const decoder = new WebCodecsClipDecoder({
      factory,
      onFrame(frame, context) {
        coordinator.insertFrame(
          "pgm",
          {
            clipId: context.clipId,
            generation: context.generation,
            timestampUs: frame.timestamp,
          },
          frame,
        );
      },
    });
    coordinator.activate("pgm", asset.id, 1, decoder);

    const targets = [
      1_725_000,
      1_085_000,
      1_445_000,
      1_205_000,
      1_605_000,
    ];
    for (const target of targets) {
      const generation = decoder.currentGeneration + 1;
      coordinator.setLaneGeneration("pgm", generation);
      const result = await decoder.decodeForward(asset, target);
      const lease = coordinator.leaseFrame(
        "pgm",
        target,
        `seek-${generation}`,
      );
      expect(result.cancelled).toBe(false);
      expect(lease?.frame.timestamp).toBe(
        sampleAtTimestamp(asset, target).timestampUs,
      );
      lease?.release();
      expect(coordinator.snapshot().retainedFrames).toBeLessThanOrEqual(
        12,
      );
    }

    const stale = factory.adapters[0].emitStale();
    expect(stale.closeCount).toBe(1);
    expect(coordinator.snapshot().slots.pgm?.generation).toBe(5);
    coordinator.dispose();
  });

  test("two sources decode independently within global and lane budgets", async () => {
    const pgmAsset = createClipAsset("pgm-a", longTrack(0));
    const overlapAsset = createClipAsset(
      "overlap-b",
      longTrack(2_000_000),
    );
    const coordinator = new PlaybackCoordinator<FakeFrame>();
    const createDecoder = (
      role: "pgm" | "overlap",
      factory: HeadlessFactory,
    ) =>
      new WebCodecsClipDecoder({
        factory,
        onFrame(frame, context) {
          coordinator.insertFrame(
            role,
            {
              clipId: context.clipId,
              generation: context.generation,
              timestampUs: frame.timestamp,
            },
            frame,
          );
        },
      });
    const pgmDecoder = createDecoder("pgm", new HeadlessFactory());
    const overlapDecoder = createDecoder(
      "overlap",
      new HeadlessFactory(),
    );
    coordinator.activate("pgm", pgmAsset.id, 1, pgmDecoder);
    coordinator.activate(
      "overlap",
      overlapAsset.id,
      1,
      overlapDecoder,
    );

    await Promise.all([
      pgmDecoder.decodeForward(pgmAsset, 750_000),
      overlapDecoder.decodeForward(overlapAsset, 2_750_000),
    ]);
    const crossfade = coordinator.leaseCrossfade(2_750_000);
    expect(crossfade).not.toBeNull();
    expect(crossfade?.pgm.frame).not.toBe(crossfade?.overlap.frame);
    expect(crossfade?.pgm.frame.timestamp).toBe(720_000);
    expect(crossfade?.overlap.frame.timestamp).toBe(2_720_000);
    expect(coordinator.snapshot().retainedFrames).toBeLessThanOrEqual(
      24,
    );
    crossfade?.pgm.release();
    crossfade?.overlap.release();
    coordinator.dispose();
  });
});
