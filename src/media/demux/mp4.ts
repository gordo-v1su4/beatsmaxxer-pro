import { createClipAsset } from "../ClipAsset";
import type {
  ClipAsset,
  DemuxedVideoTrack,
  EncodedVideoSample,
} from "../types";

export const MP4_DEMUXER_POLICY = Object.freeze({
  candidate: "mediabunny",
  version: "1.51.0",
  approval: "conditional-spike-only",
  dependencyBundled: false,
});

export interface Mp4DemuxAdapter {
  readonly id: string;
  demux(
    source: ArrayBuffer,
    signal?: AbortSignal,
  ): Promise<DemuxedVideoTrack>;
}

export class Mp4DemuxBoundary {
  constructor(private readonly adapter: Mp4DemuxAdapter | null = null) {}

  async demux(
    id: string,
    source: ArrayBuffer,
    signal?: AbortSignal,
  ): Promise<ClipAsset> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.adapter === null) throw new Error("mp4-demuxer-not-approved");
    const track = await this.adapter.demux(source, signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return createClipAsset(id, track);
  }
}

export function precedingKeyframeSample(
  asset: ClipAsset,
  timestampUs: number,
): EncodedVideoSample {
  let low = 0;
  let high = asset.keyframeSampleIndexes.length - 1;
  let selected = asset.keyframeSampleIndexes[0];

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sampleIndex = asset.keyframeSampleIndexes[middle];
    const sample = asset.samples[sampleIndex];
    if (sample.timestampUs <= timestampUs) {
      selected = sampleIndex;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return asset.samples[selected];
}

export function sampleAtTimestamp(
  asset: ClipAsset,
  timestampUs: number,
): EncodedVideoSample {
  const clamped = Math.max(
    asset.startTimestampUs,
    Math.min(
      timestampUs,
      asset.startTimestampUs + asset.durationUs - 1,
    ),
  );
  let selected = asset.samples[0];
  for (const sample of asset.samples) {
    if (sample.timestampUs > clamped) break;
    selected = sample;
    if (clamped < sample.timestampUs + sample.durationUs) break;
  }
  return selected;
}

export function decodeForwardSamples(
  asset: ClipAsset,
  timestampUs: number,
): readonly EncodedVideoSample[] {
  const first = precedingKeyframeSample(asset, timestampUs);
  const target = sampleAtTimestamp(asset, timestampUs);
  return asset.samples.slice(first.index, target.index + 1);
}
