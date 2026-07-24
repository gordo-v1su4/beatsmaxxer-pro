import type {
  DecodedFrameLike,
  DemuxedVideoTrack,
} from "../../../src/media/types";

export class FakeFrame implements DecodedFrameLike {
  closeCount = 0;
  readonly clones: FakeFrame[] = [];

  constructor(
    public readonly timestamp: number,
    public readonly duration = 33_333,
    public readonly label = `frame-${timestamp}`,
  ) {}

  close() {
    this.closeCount += 1;
  }

  clone() {
    const clone = new FakeFrame(
      this.timestamp,
      this.duration,
      `${this.label}-clone-${this.clones.length}`,
    );
    this.clones.push(clone);
    return clone;
  }
}

export function mediaTrackFixture(): DemuxedVideoTrack {
  const timestamps = [1_000_000, 1_040_000, 1_090_000, 1_150_000, 1_183_000];
  const durations = [40_000, 50_000, 60_000, 33_000, 42_000];
  return {
    metadata: {
      container: "mp4",
      codec: "avc1.640028",
      profile: "high",
      bitDepth: 8,
      chromaSubsampling: "4:2:0",
      codedWidth: 1920,
      codedHeight: 1080,
      frameRate: 60,
    },
    decoderConfig: {
      codec: "avc1.640028",
      codedWidth: 1920,
      codedHeight: 1080,
      description: new Uint8Array([1, 100, 0, 40]),
    },
    samples: timestamps.map((timestampUs, index) => ({
      index,
      timestampUs,
      durationUs: durations[index],
      type: index === 0 || index === 3 ? "key" : "delta",
      data: new Uint8Array([index]),
    })),
  };
}
