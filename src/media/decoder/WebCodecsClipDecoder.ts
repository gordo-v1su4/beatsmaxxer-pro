import { decodeForwardSamples } from "../demux/mp4";
import type {
  ClipAsset,
  DecodedFrameLike,
  EncodedVideoSample,
  VideoDecoderConfigLike,
} from "../types";

export type ClipDecoderState =
  | "idle"
  | "configured"
  | "decoding"
  | "closed"
  | "error";

export interface DecodedFrameContext {
  clipId: string;
  generation: number;
}

export interface DecoderCallbacks<Frame extends DecodedFrameLike> {
  output(frame: Frame): void;
  error(error: Error): void;
}

export interface VideoDecoderAdapter {
  readonly decodeQueueSize: number;
  configure(config: VideoDecoderConfigLike): void;
  decode(sample: EncodedVideoSample): void;
  flush(): Promise<void>;
  waitForDequeue(): Promise<void>;
  reset(): void;
  close(): void;
}

export interface VideoDecoderFactory<Frame extends DecodedFrameLike> {
  create(callbacks: DecoderCallbacks<Frame>): VideoDecoderAdapter;
}

export interface DecodeForwardResult {
  generation: number;
  decodedSampleIndexes: readonly number[];
  cancelled: boolean;
}

export interface ClipDecoderOptions<Frame extends DecodedFrameLike> {
  factory: VideoDecoderFactory<Frame>;
  onFrame(frame: Frame, context: DecodedFrameContext): void;
  onError?: (error: Error) => void;
  onStateChange?: (
    state: ClipDecoderState,
    queueSize: number | null,
  ) => void;
  maxDecodeQueueSize?: number;
}

export class WebCodecsClipDecoder<Frame extends DecodedFrameLike> {
  readonly maxDecodeQueueSize: number;
  private readonly cancellationWaiters = new Set<() => void>();
  private active: VideoDecoderAdapter | null = null;
  private generation = 0;
  private errorGeneration: number | null = null;
  private state: ClipDecoderState = "idle";
  private closed = false;

  constructor(private readonly options: ClipDecoderOptions<Frame>) {
    this.maxDecodeQueueSize = options.maxDecodeQueueSize ?? 8;
    if (
      !Number.isInteger(this.maxDecodeQueueSize) ||
      this.maxDecodeQueueSize <= 0 ||
      this.maxDecodeQueueSize > 8
    ) {
      throw new Error("decode-queue-limit-exceeds-v1-budget");
    }
    this.reportState();
  }

  get currentGeneration() {
    return this.generation;
  }

  get decoderState() {
    return this.state;
  }

  get decodeQueueSize() {
    return this.active?.decodeQueueSize ?? 0;
  }

  async decodeForward(
    asset: ClipAsset,
    timestampUs: number,
  ): Promise<DecodeForwardResult> {
    if (this.closed) throw new Error("clip-decoder-closed");
    const generation = this.beginGeneration();
    const decodedSampleIndexes: number[] = [];
    let decoder: VideoDecoderAdapter | null = null;
    try {
      decoder = this.options.factory.create({
        output: (frame) => this.acceptOutput(frame, asset.id, generation),
        error: (error) => this.failActive(error, generation),
      });
      this.active = decoder;
      decoder.configure(asset.decoderConfig);
      this.state = "configured";
      this.reportState();

      const samples = decodeForwardSamples(asset, timestampUs);
      this.state = "decoding";
      this.reportState();

      for (const sample of samples) {
        while (decoder.decodeQueueSize >= this.maxDecodeQueueSize) {
          const outcome = await Promise.race([
            decoder.waitForDequeue().then(() => "dequeue" as const),
            this.waitForCancellation().then(() => "cancel" as const),
          ]);
          if (outcome === "cancel" || generation !== this.generation) {
            return {
              generation,
              decodedSampleIndexes,
              cancelled: true,
            };
          }
        }
        if (generation !== this.generation) {
          return {
            generation,
            decodedSampleIndexes,
            cancelled: true,
          };
        }
        decoder.decode(sample);
        decodedSampleIndexes.push(sample.index);
        this.reportState();
      }

      const outcome = await Promise.race([
        decoder.flush().then(() => "flushed" as const),
        this.waitForCancellation().then(() => "cancel" as const),
      ]);
      const cancelled =
        outcome === "cancel" || generation !== this.generation;
      this.finishDecode(cancelled);
      return { generation, decodedSampleIndexes, cancelled };
    } catch (error) {
      const failure =
        error instanceof Error ? error : new Error(String(error));
      if (generation === this.generation) {
        this.failActive(failure, generation);
      }
      throw failure;
    }
  }

  cancel() {
    if (this.closed) return;
    this.beginGeneration();
    this.state = "idle";
    this.reportState();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.generation += 1;
    this.resolveCancellationWaiters();
    this.disposeActive();
    this.state = "closed";
    this.reportState();
  }

  private beginGeneration() {
    this.generation += 1;
    this.errorGeneration = null;
    this.resolveCancellationWaiters();
    this.disposeActive();
    return this.generation;
  }

  private disposeActive() {
    if (this.active === null) return;
    const decoder = this.active;
    this.active = null;
    try {
      decoder.reset();
    } finally {
      decoder.close();
    }
  }

  private acceptOutput(
    frame: Frame,
    clipId: string,
    generation: number,
  ) {
    if (this.closed || generation !== this.generation) {
      frame.close();
      return;
    }
    try {
      this.options.onFrame(frame, { clipId, generation });
    } catch (error) {
      frame.close();
      this.failActive(
        error instanceof Error ? error : new Error(String(error)),
        generation,
      );
    }
  }

  private acceptError(error: Error, generation: number) {
    if (this.closed || generation !== this.generation) return;
    if (this.errorGeneration === generation) return;
    this.errorGeneration = generation;
    this.state = "error";
    this.reportState();
    this.options.onError?.(error);
  }

  private failActive(error: Error, generation: number) {
    this.acceptError(error, generation);
    if (generation === this.generation) this.disposeActive();
  }

  private finishDecode(cancelled: boolean) {
    if (cancelled || this.state === "error") return;
    this.state = "configured";
    this.reportState();
  }

  private waitForCancellation() {
    return new Promise<void>((resolve) => {
      this.cancellationWaiters.add(resolve);
    });
  }

  private resolveCancellationWaiters() {
    for (const resolve of this.cancellationWaiters) resolve();
    this.cancellationWaiters.clear();
  }

  private reportState() {
    this.options.onStateChange?.(
      this.state,
      this.active?.decodeQueueSize ?? null,
    );
  }
}

class BrowserVideoDecoderAdapter
  implements VideoDecoderAdapter
{
  private readonly dequeueWaiters: Array<() => void> = [];
  private readonly decoder: VideoDecoder;

  constructor(callbacks: DecoderCallbacks<VideoFrame>) {
    this.decoder = new VideoDecoder({
      output: callbacks.output,
      error: (error) =>
        callbacks.error(
          error instanceof Error ? error : new Error(String(error)),
        ),
    });
    this.decoder.addEventListener("dequeue", () => {
      this.dequeueWaiters.shift()?.();
    });
  }

  get decodeQueueSize() {
    return this.decoder.decodeQueueSize;
  }

  configure(config: VideoDecoderConfigLike) {
    this.decoder.configure(config as VideoDecoderConfig);
  }

  decode(sample: EncodedVideoSample) {
    this.decoder.decode(
      new EncodedVideoChunk({
        type: sample.type,
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: sample.data,
      }),
    );
  }

  flush() {
    return this.decoder.flush();
  }

  waitForDequeue() {
    if (this.decoder.decodeQueueSize === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.dequeueWaiters.push(resolve);
    });
  }

  reset() {
    if (this.decoder.state !== "closed") this.decoder.reset();
    this.resolveWaiters();
  }

  close() {
    if (this.decoder.state !== "closed") this.decoder.close();
    this.resolveWaiters();
  }

  private resolveWaiters() {
    for (const resolve of this.dequeueWaiters.splice(0)) resolve();
  }
}

export function createBrowserVideoDecoderFactory(): VideoDecoderFactory<VideoFrame> {
  return {
    create(callbacks) {
      if (typeof VideoDecoder === "undefined") {
        throw new Error("webcodecs-unavailable");
      }
      return new BrowserVideoDecoderAdapter(callbacks);
    },
  };
}
