import {
  BlobSource,
  EncodedPacketSink,
  Input,
  MP4,
  type EncodedPacket,
} from "mediabunny";
import type {
  DemuxedVideoTrack,
  EncodedVideoSample,
  VideoDecoderConfigLike,
  VideoTrackMetadata,
} from "../types";
import type { Mp4DemuxAdapter } from "./mp4";

const PROFILE_BY_IDC: Readonly<Record<string, VideoTrackMetadata["profile"]>> =
  {
    "42": "baseline",
    "4d": "main",
    "64": "high",
  };

function profileFromCodec(codec: string) {
  const match = /^avc1\.([0-9a-f]{2})/i.exec(codec);
  const idc = match?.[1]?.toLowerCase() ?? "";
  return PROFILE_BY_IDC[idc] ?? "high";
}

function copyDescription(
  description: VideoDecoderConfig["description"] | undefined,
) {
  if (!description) return undefined;
  if (description instanceof ArrayBuffer) {
    return description.slice(0);
  }
  if (ArrayBuffer.isView(description)) {
    return new Uint8Array(
      description.buffer,
      description.byteOffset,
      description.byteLength,
    ).slice();
  }
  return undefined;
}

function toSample(
  packet: EncodedPacket,
  index: number,
  decodeTimestampUs: number,
): EncodedVideoSample {
  return {
    index,
    decodeTimestampUs,
    timestampUs: packet.microsecondTimestamp,
    durationUs: Math.max(1, packet.microsecondDuration),
    type: packet.type,
    data: packet.data.slice(),
  };
}

function buildDecodeTimestamps(
  packets: EncodedPacket[],
  averageDurationUs: number,
) {
  const timestamps: number[] = [];
  for (let index = 0; index < packets.length; index += 1) {
    if (index === 0) {
      timestamps.push(packets[0].microsecondTimestamp);
      continue;
    }
    const packet = packets[index];
    const previousDecode = timestamps[index - 1];
    const delta = Math.max(
      1,
      packet.microsecondTimestamp - packets[index - 1].microsecondTimestamp,
    );
    timestamps.push(
      previousDecode + Math.min(delta, averageDurationUs * 2),
    );
  }
  return timestamps;
}

export class MediabunnyMp4Adapter implements Mp4DemuxAdapter {
  readonly id = "mediabunny-1.51.0";

  async demux(source: ArrayBuffer, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const input = new Input({
      formats: [MP4],
      source: new BlobSource(new Blob([source])),
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("mp4-video-track-missing");

    const decoderConfig = await videoTrack.getDecoderConfig();
    if (!decoderConfig) throw new Error("mp4-decoder-config-unavailable");

    const codedWidth = await videoTrack.getCodedWidth();
    const codedHeight = await videoTrack.getCodedHeight();
    const durationSeconds = await input.computeDuration();
    const sink = new EncodedPacketSink(videoTrack);

    const packets: EncodedPacket[] = [];
    for await (const packet of sink.packets()) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      packets.push(packet);
    }

    if (packets.length === 0) throw new Error("video-samples-required");

    packets.sort((left, right) => {
      if (left.sequenceNumber >= 0 && right.sequenceNumber >= 0) {
        return left.sequenceNumber - right.sequenceNumber;
      }
      return left.microsecondTimestamp - right.microsecondTimestamp;
    });

    const averageDurationUs =
      packets.reduce(
        (total, packet) => total + Math.max(1, packet.microsecondDuration),
        0,
      ) / packets.length;

    const dtsByIndex = buildDecodeTimestamps(
      packets,
      averageDurationUs,
    );

    const samples = packets.map((packet, index) =>
      toSample(packet, index, dtsByIndex[index]),
    );
    const frameRate =
      averageDurationUs > 0
        ? Math.min(60, 1_000_000 / averageDurationUs)
        : 30;

    const config: VideoDecoderConfigLike = {
      codec: decoderConfig.codec,
      codedWidth: decoderConfig.codedWidth ?? codedWidth,
      codedHeight: decoderConfig.codedHeight ?? codedHeight,
      description: copyDescription(decoderConfig.description),
    };

    const metadata: VideoTrackMetadata = {
      container: "mp4",
      codec: decoderConfig.codec,
      profile: profileFromCodec(decoderConfig.codec),
      bitDepth: 8,
      chromaSubsampling: "4:2:0",
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight,
      frameRate,
      decodeOrder: "dts-proven",
    };

    void durationSeconds;
    return {
      metadata,
      decoderConfig: config,
      samples,
    } satisfies DemuxedVideoTrack;
  }
}
