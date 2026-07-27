import type {
  DecoderCallbacks,
  VideoDecoderAdapter,
  VideoDecoderFactory,
} from "./decoder/WebCodecsClipDecoder";
import type {
  DecodedFrameLike,
  EncodedVideoSample,
  VideoDecoderConfigLike,
} from "./types";

class BrowserVideoDecoderAdapter<Frame extends DecodedFrameLike>
  implements VideoDecoderAdapter
{
  private readonly decoder: VideoDecoder;
  private pendingChunks = 0;

  constructor(
    callbacks: DecoderCallbacks<Frame>,
    private readonly createFrame: (frame: VideoFrame) => Frame,
  ) {
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.pendingChunks = Math.max(0, this.pendingChunks - 1);
        try {
          callbacks.output(this.createFrame(frame));
        } finally {
          frame.close();
        }
      },
      error: (error) => callbacks.error(error),
    });
  }

  get decodeQueueSize() {
    return this.pendingChunks;
  }

  configure(config: VideoDecoderConfigLike) {
    this.decoder.configure(config as VideoDecoderConfig);
  }

  decode(sample: EncodedVideoSample) {
    this.pendingChunks += 1;
    this.decoder.decode(
      new EncodedVideoChunk({
        type: sample.type,
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: sample.data,
      }),
    );
  }

  async flush() {
    await this.decoder.flush();
    this.pendingChunks = 0;
  }

  async waitForDequeue() {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }

  reset() {
    if (this.decoder.state !== "closed") {
      this.decoder.reset();
    }
    this.pendingChunks = 0;
  }

  close() {
    if (this.decoder.state !== "closed") {
      this.decoder.close();
    }
    this.pendingChunks = 0;
  }
}

export function createBrowserVideoDecoderFactory<
  Frame extends DecodedFrameLike,
>(createFrame: (frame: VideoFrame) => Frame): VideoDecoderFactory<Frame> {
  return {
    create(callbacks) {
      return new BrowserVideoDecoderAdapter(callbacks, createFrame);
    },
  };
}

export function createBrowserPlaybackEnvironment() {
  const videoDecoder =
    typeof VideoDecoder !== "undefined"
      ? {
          isConfigSupported(config: VideoDecoderConfigLike) {
            return VideoDecoder.isConfigSupported(
              config as VideoDecoderConfig,
            );
          },
        }
      : null;

  return {
    secureContext: globalThis.isSecureContext,
    videoDecoder,
    sampleFrameProbe: null as
      | ((config: VideoDecoderConfigLike) => Promise<boolean>)
      | null,
  };
}

export async function probeBrowserSampleFrame(
  config: VideoDecoderConfigLike,
) {
  if (typeof VideoDecoder === "undefined") return false;
  const support = await VideoDecoder.isConfigSupported(
    config as VideoDecoderConfig,
  );
  return !!support.supported;
}
