/// <reference lib="webworker" />

import type {
  EncodedVideoSample,
  VideoDecoderConfigLike,
} from "../types";

export type DecodeWorkerRequest = {
  kind: "decode-samples";
  requestId: number;
  config: VideoDecoderConfigLike;
  samples: EncodedVideoSample[];
  clipId: string;
  generation: number;
};

export type DecodeWorkerResponse =
  | {
      kind: "frame";
      requestId: number;
      clipId: string;
      generation: number;
      timestampUs: number;
      durationUs: number;
      frame: VideoFrame;
    }
  | {
      kind: "done";
      requestId: number;
      decodedSampleIndexes: number[];
    }
  | { kind: "error"; requestId: number; message: string };

self.onmessage = async (event: MessageEvent<DecodeWorkerRequest>) => {
  const message = event.data;
  if (message.kind !== "decode-samples") return;

  try {
    if (typeof VideoDecoder === "undefined") {
      throw new Error("webcodecs-unavailable");
    }

    const decodedIndexes: number[] = [];
    const decoder = new VideoDecoder({
      output(frame) {
        self.postMessage(
          {
            kind: "frame",
            requestId: message.requestId,
            clipId: message.clipId,
            generation: message.generation,
            timestampUs: frame.timestamp,
            durationUs: frame.duration ?? 0,
            frame,
          } satisfies DecodeWorkerResponse,
          { transfer: [frame] },
        );
      },
      error(error) {
        throw error;
      },
    });
    decoder.configure(message.config as VideoDecoderConfig);

    for (const sample of message.samples) {
      decodedIndexes.push(sample.index);
      decoder.decode(
        new EncodedVideoChunk({
          type: sample.type,
          timestamp: sample.timestampUs,
          duration: sample.durationUs,
          data: sample.data,
        }),
      );
      await decoder.decodeQueueSize === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const check = () => {
              if (decoder.decodeQueueSize === 0) resolve();
              else queueMicrotask(check);
            };
            queueMicrotask(check);
          });
    }

    await decoder.flush();
    decoder.close();

    self.postMessage({
      kind: "done",
      requestId: message.requestId,
      decodedSampleIndexes: decodedIndexes,
    } satisfies DecodeWorkerResponse);
  } catch (error) {
    self.postMessage({
      kind: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    } satisfies DecodeWorkerResponse);
  }
};
