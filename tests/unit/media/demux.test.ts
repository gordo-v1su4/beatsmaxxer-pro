import { describe, expect, test } from "bun:test";
import {
  MP4_DEMUXER_POLICY,
  Mp4DemuxBoundary,
  decodeForwardSamples,
  precedingKeyframeSample,
  sampleAtTimestamp,
} from "../../../src/media/demux/mp4";
import { mediaTrackFixture } from "./fakes";

describe("MP4 demux and keyframe boundary", () => {
  test("keeps the conditional demuxer behind an injected boundary", async () => {
    expect(MP4_DEMUXER_POLICY).toEqual({
      candidate: "mediabunny",
      version: "1.51.0",
      approval: "conditional-spike-only",
      dependencyBundled: false,
    });
    await expect(
      new Mp4DemuxBoundary().demux("clip", new ArrayBuffer(0)),
    ).rejects.toThrow("mp4-demuxer-not-approved");
  });

  test("builds an immutable non-zero-start sample and keyframe index", async () => {
    const sourceTrack = mediaTrackFixture();
    const boundary = new Mp4DemuxBoundary({
      id: "test-adapter",
      async demux() {
        return sourceTrack;
      },
    });
    const asset = await boundary.demux("clip-a", new ArrayBuffer(4));

    expect(asset.startTimestampUs).toBe(1_000_000);
    expect(asset.durationUs).toBe(225_000);
    expect(asset.keyframeSampleIndexes).toEqual([0, 3]);
    expect(asset.samples).not.toBe(sourceTrack.samples);
    sourceTrack.samples[0].data[0] = 99;
    expect(asset.samples[0].data[0]).toBe(0);
    expect(Object.isFrozen(asset)).toBe(true);
  });

  test("finds preceding keyframes and decodes forward through variable durations", async () => {
    const boundary = new Mp4DemuxBoundary({
      id: "test-adapter",
      async demux() {
        return mediaTrackFixture();
      },
    });
    const asset = await boundary.demux("clip-a", new ArrayBuffer(4));

    expect(precedingKeyframeSample(asset, 1_149_999).index).toBe(0);
    expect(precedingKeyframeSample(asset, 1_150_000).index).toBe(3);
    expect(sampleAtTimestamp(asset, 1_085_000).index).toBe(1);
    expect(sampleAtTimestamp(asset, 1_149_999).index).toBe(2);
    expect(
      decodeForwardSamples(asset, 1_149_999).map((sample) => sample.index),
    ).toEqual([0, 1, 2]);
    expect(
      decodeForwardSamples(asset, 1_190_000).map((sample) => sample.index),
    ).toEqual([3, 4]);
  });

  test("rejects malformed indexes and honors cancellation", async () => {
    const malformed = mediaTrackFixture();
    malformed.samples[2] = { ...malformed.samples[2], index: 7 };
    await expect(
      new Mp4DemuxBoundary({
        id: "bad",
        async demux() {
          return malformed;
        },
      }).demux("bad", new ArrayBuffer(0)),
    ).rejects.toThrow("sample-index-not-contiguous");

    const controller = new AbortController();
    controller.abort();
    await expect(
      new Mp4DemuxBoundary({
        id: "cancelled",
        async demux() {
          return mediaTrackFixture();
        },
      }).demux("cancelled", new ArrayBuffer(0), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
