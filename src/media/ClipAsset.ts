import type {
  ClipAsset,
  DemuxedVideoTrack,
  EncodedVideoSample,
  VideoDecoderConfigLike,
} from "./types";

function copySample(sample: EncodedVideoSample): EncodedVideoSample {
  return Object.freeze({
    ...sample,
    data: sample.data.slice(),
  });
}

function copyDecoderConfig(
  config: VideoDecoderConfigLike,
): VideoDecoderConfigLike {
  const description =
    config.description instanceof ArrayBuffer
      ? config.description.slice(0)
      : ArrayBuffer.isView(config.description)
        ? new Uint8Array(
            config.description.buffer,
            config.description.byteOffset,
            config.description.byteLength,
          ).slice()
        : undefined;
  return {
    ...config,
    ...(description ? { description } : {}),
  };
}

export function createClipAsset(
  id: string,
  track: DemuxedVideoTrack,
): ClipAsset {
  if (id.length === 0) throw new Error("clip-id-required");
  if (track.samples.length === 0) throw new Error("video-samples-required");

  const samples = track.samples.map(copySample);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.index !== index) throw new Error("sample-index-not-contiguous");
    if (
      !Number.isFinite(sample.timestampUs) ||
      sample.timestampUs < 0 ||
      !Number.isFinite(sample.durationUs) ||
      sample.durationUs <= 0
    ) {
      throw new Error("invalid-sample-timing");
    }
    if (
      index > 0 &&
      sample.timestampUs < samples[index - 1].timestampUs
    ) {
      throw new Error("sample-timestamps-not-monotonic");
    }
  }
  if (samples[0].type !== "key") throw new Error("first-sample-not-keyframe");

  const keyframeSampleIndexes = samples
    .filter((sample) => sample.type === "key")
    .map((sample) => sample.index);
  const first = samples[0];
  const last = samples[samples.length - 1];

  return Object.freeze({
    id,
    startTimestampUs: first.timestampUs,
    durationUs:
      last.timestampUs + last.durationUs - first.timestampUs,
    metadata: Object.freeze({ ...track.metadata }),
    decoderConfig: Object.freeze(copyDecoderConfig(track.decoderConfig)),
    samples: Object.freeze(samples),
    keyframeSampleIndexes: Object.freeze(keyframeSampleIndexes),
  });
}
