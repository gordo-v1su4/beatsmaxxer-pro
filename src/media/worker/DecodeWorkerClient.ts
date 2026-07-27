import { decodeForwardSamples } from "../demux/mp4";
import type { ClipAsset } from "../types";
import type {
  DecodeWorkerRequest,
  DecodeWorkerResponse,
} from "./decode-worker";

export interface DecodedWorkerFrame {
  clipId: string;
  generation: number;
  timestampUs: number;
  durationUs: number;
  frame: VideoFrame;
}

export class DecodeWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      onFrame?(frame: DecodedWorkerFrame): void;
    }
  >();

  constructor(private readonly workerUrl: string | URL) {}

  start() {
    if (this.worker) return;
    this.worker = new Worker(this.workerUrl, { type: "module" });
    this.worker.onmessage = (event: MessageEvent<DecodeWorkerResponse>) => {
      const message = event.data;
      if (message.kind === "frame") {
        const pending = this.pending.get(message.requestId);
        pending?.onFrame?.({
          clipId: message.clipId,
          generation: message.generation,
          timestampUs: message.timestampUs,
          durationUs: message.durationUs,
          frame: message.frame,
        });
        return;
      }
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      if (message.kind === "error") {
        pending.reject(new Error(message.message));
        return;
      }
      pending.resolve(message);
    };
    this.worker.onerror = (error) => {
      for (const [, pending] of this.pending) {
        pending.reject(
          error.error instanceof Error
            ? error.error
            : new Error(error.message),
        );
      }
      this.pending.clear();
    };
  }

  async decodeForward(
    asset: ClipAsset,
    options: {
      timestampUs: number;
      clipId: string;
      generation: number;
      onFrame(frame: DecodedWorkerFrame): void;
      signal?: AbortSignal;
    },
  ) {
    this.start();
    if (!this.worker) throw new Error("decode-worker-unavailable");
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const samples = decodeForwardSamples(asset, options.timestampUs);
    const requestId = this.nextRequestId++;
    const done = new Promise<Extract<DecodeWorkerResponse, { kind: "done" }>>(
      (resolve, reject) => {
        this.pending.set(requestId, {
          resolve: resolve as (value: unknown) => void,
          reject,
          onFrame: options.onFrame,
        });
      },
    );

    const request: DecodeWorkerRequest = {
      kind: "decode-samples",
      requestId,
      config: asset.decoderConfig,
      samples: [...samples],
      clipId: options.clipId,
      generation: options.generation,
    };
    this.worker.postMessage(request);

    options.signal?.addEventListener(
      "abort",
      () => {
        this.pending.delete(requestId);
      },
      { once: true },
    );

    return done;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

export function createDecodeWorkerClient() {
  if (typeof Worker === "undefined") return null;
  return new DecodeWorkerClient(
    new URL("./decode-worker.ts", import.meta.url),
  );
}
