import { describe, expect, test } from "bun:test";
import { createClipAsset } from "../../../src/media/ClipAsset";
import {
  WebCodecsClipDecoder,
  type DecoderCallbacks,
  type VideoDecoderAdapter,
  type VideoDecoderFactory,
} from "../../../src/media/decoder/WebCodecsClipDecoder";
import type {
  EncodedVideoSample,
  VideoDecoderConfigLike,
} from "../../../src/media/types";
import { FakeFrame, mediaTrackFixture } from "./fakes";

class FakeDecoderAdapter implements VideoDecoderAdapter {
  readonly decoded: EncodedVideoSample[] = [];
  readonly emitted: FakeFrame[] = [];
  configured: VideoDecoderConfigLike | null = null;
  resetCount = 0;
  closeCount = 0;
  maxObservedQueue = 0;
  private queue: EncodedVideoSample[] = [];

  constructor(
    readonly callbacks: DecoderCallbacks<FakeFrame>,
    private readonly holdFlush = false,
    private readonly queueInflation = 1,
  ) {}

  get decodeQueueSize() {
    return this.queue.length;
  }

  configure(config: VideoDecoderConfigLike) {
    this.configured = config;
  }

  decode(sample: EncodedVideoSample) {
    this.decoded.push(sample);
    for (let index = 0; index < this.queueInflation; index += 1) {
      this.queue.push(sample);
    }
    this.maxObservedQueue = Math.max(
      this.maxObservedQueue,
      this.decodeQueueSize,
    );
  }

  async flush() {
    if (this.holdFlush) await new Promise<void>(() => undefined);
    while (this.queue.length > 0) this.emitNext();
  }

  async waitForDequeue() {
    this.emitNext();
  }

  reset() {
    this.resetCount += 1;
    this.queue.length = 0;
  }

  close() {
    this.closeCount += 1;
  }

  emitStale(timestamp = 123) {
    const frame = new FakeFrame(timestamp);
    this.emitted.push(frame);
    this.callbacks.output(frame);
    return frame;
  }

  private emitNext() {
    const sample = this.queue.shift();
    if (!sample) return;
    const frame = new FakeFrame(
      sample.timestampUs,
      sample.durationUs,
    );
    this.emitted.push(frame);
    this.callbacks.output(frame);
  }
}

class FakeDecoderFactory implements VideoDecoderFactory<FakeFrame> {
  readonly adapters: FakeDecoderAdapter[] = [];

  constructor(private readonly holdFirstFlush = false) {}

  create(callbacks: DecoderCallbacks<FakeFrame>) {
    const adapter = new FakeDecoderAdapter(
      callbacks,
      this.holdFirstFlush && this.adapters.length === 0,
    );
    this.adapters.push(adapter);
    return adapter;
  }
}

class FailingConfigureAdapter extends FakeDecoderAdapter {
  configure() {
    throw new Error("configure failed");
  }
}

describe("generation-aware WebCodecs clip decoder", () => {
  test("seeks from the preceding keyframe and bounds the decode queue", async () => {
    const asset = createClipAsset("clip-a", mediaTrackFixture());
    const factory = new FakeDecoderFactory();
    const outputs: Array<{ frame: FakeFrame; generation: number }> = [];
    const decoder = new WebCodecsClipDecoder({
      factory,
      maxDecodeQueueSize: 2,
      onFrame(frame, context) {
        outputs.push({ frame, generation: context.generation });
      },
    });

    const result = await decoder.decodeForward(asset, 1_149_999);

    expect(result).toEqual({
      generation: 1,
      decodedSampleIndexes: [0, 1, 2],
      cancelled: false,
    });
    expect(factory.adapters[0].configured).toBe(asset.decoderConfig);
    expect(factory.adapters[0].maxObservedQueue).toBeLessThanOrEqual(2);
    expect(outputs.map(({ frame }) => frame.timestamp)).toEqual([
      1_000_000,
      1_040_000,
      1_090_000,
    ]);
    expect(outputs.every(({ generation }) => generation === 1)).toBe(true);
    decoder.close();
  });

  test("rapid seek cancels the old generation and closes stale outputs", async () => {
    const asset = createClipAsset("clip-a", mediaTrackFixture());
    const factory = new FakeDecoderFactory(true);
    const accepted: FakeFrame[] = [];
    const decoder = new WebCodecsClipDecoder({
      factory,
      maxDecodeQueueSize: 8,
      onFrame(frame) {
        accepted.push(frame);
      },
    });

    const first = decoder.decodeForward(asset, 1_040_000);
    await Promise.resolve();
    const second = decoder.decodeForward(asset, 1_190_000);
    const stale = factory.adapters[0].emitStale();

    expect((await first).cancelled).toBe(true);
    expect((await second).cancelled).toBe(false);
    expect(stale.closeCount).toBe(1);
    expect(accepted.includes(stale)).toBe(false);
    expect(factory.adapters[0].resetCount).toBe(1);
    expect(factory.adapters[0].closeCount).toBe(1);
    decoder.close();
  });

  test("receiver failures close the frame and enter an observable error state", async () => {
    const asset = createClipAsset("clip-a", mediaTrackFixture());
    const factory = new FakeDecoderFactory();
    const errors: Error[] = [];
    const decoder = new WebCodecsClipDecoder({
      factory,
      onFrame() {
        throw new Error("cache rejected");
      },
      onError(error) {
        errors.push(error);
      },
    });

    await decoder.decodeForward(asset, 1_000_000);
    expect(factory.adapters[0].emitted[0].closeCount).toBe(1);
    expect(errors[0]?.message).toBe("cache rejected");
    expect(decoder.decoderState).toBe("error");
    expect(factory.adapters[0].resetCount).toBe(1);
    expect(factory.adapters[0].closeCount).toBe(1);
    decoder.close();
    decoder.close();
    expect(factory.adapters[0].closeCount).toBe(1);
  });

  test("decoder failures reset and close the active resource", async () => {
    const asset = createClipAsset("clip-a", mediaTrackFixture());
    let adapter: FailingConfigureAdapter | null = null;
    const errors: Error[] = [];
    const decoder = new WebCodecsClipDecoder({
      factory: {
        create(callbacks) {
          adapter = new FailingConfigureAdapter(callbacks);
          return adapter;
        },
      },
      onFrame() {},
      onError(error) {
        errors.push(error);
      },
    });

    await expect(
      decoder.decodeForward(asset, 1_000_000),
    ).rejects.toThrow("configure failed");
    expect(errors.map((error) => error.message)).toEqual([
      "configure failed",
    ]);
    expect(adapter?.resetCount).toBe(1);
    expect(adapter?.closeCount).toBe(1);
    expect(decoder.decoderState).toBe("error");
  });

  test("closes a decoder that reports a queue above eight", async () => {
    const asset = createClipAsset("clip-a", mediaTrackFixture());
    let adapter: FakeDecoderAdapter | null = null;
    const decoder = new WebCodecsClipDecoder({
      factory: {
        create(callbacks) {
          adapter = new FakeDecoderAdapter(callbacks, false, 9);
          return adapter;
        },
      },
      onFrame() {},
      maxDecodeQueueSize: 8,
    });

    await expect(
      decoder.decodeForward(asset, 1_000_000),
    ).rejects.toThrow("decode-queue-budget-exceeded");
    expect(adapter?.maxObservedQueue).toBe(9);
    expect(adapter?.resetCount).toBe(1);
    expect(adapter?.closeCount).toBe(1);
  });

  test("rejects queue limits above the frozen v1 maximum", () => {
    expect(
      () =>
        new WebCodecsClipDecoder({
          factory: new FakeDecoderFactory(),
          maxDecodeQueueSize: 9,
          onFrame() {},
        }),
    ).toThrow("decode-queue-limit-exceeds-v1-budget");
  });
});
