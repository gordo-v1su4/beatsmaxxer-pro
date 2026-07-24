import type {
  MediaFallback,
  VideoDecoderConfigLike,
  VideoTrackMetadata,
} from "./types";

export type DirectPlaybackUnsupportedReason =
  | "insecure-context"
  | "webcodecs-unavailable"
  | "unsupported-container"
  | "unsupported-codec"
  | "unsupported-profile"
  | "unsupported-bit-depth"
  | "unsupported-chroma-subsampling"
  | "resolution-exceeds-1080p"
  | "frame-rate-exceeds-60"
  | "decoder-config-unsupported"
  | "decoder-probe-failed";

export type DirectPlaybackProbe =
  | {
      supported: true;
      reason: null;
      config: VideoDecoderConfigLike;
    }
  | {
      supported: false;
      reason: DirectPlaybackUnsupportedReason;
      config: VideoDecoderConfigLike;
    };

export interface VideoDecoderSupportProbe {
  isConfigSupported(
    config: VideoDecoderConfigLike,
  ): Promise<{ supported?: boolean }>;
}

export interface PlaybackCapabilityEnvironment {
  secureContext: boolean;
  videoDecoder: VideoDecoderSupportProbe | null;
}

function staticUnsupportedReason(
  metadata: VideoTrackMetadata,
): DirectPlaybackUnsupportedReason | null {
  if (metadata.container.toLowerCase() !== "mp4") {
    return "unsupported-container";
  }
  if (!/^(avc1|avc3)/i.test(metadata.codec)) return "unsupported-codec";
  if (!["baseline", "main", "high"].includes(metadata.profile.toLowerCase())) {
    return "unsupported-profile";
  }
  if (metadata.bitDepth !== 8) return "unsupported-bit-depth";
  if (metadata.chromaSubsampling !== "4:2:0") {
    return "unsupported-chroma-subsampling";
  }
  if (
    metadata.codedWidth <= 0 ||
    metadata.codedHeight <= 0 ||
    metadata.codedWidth > 1920 ||
    metadata.codedHeight > 1080
  ) {
    return "resolution-exceeds-1080p";
  }
  if (metadata.frameRate <= 0 || metadata.frameRate > 60) {
    return "frame-rate-exceeds-60";
  }
  return null;
}

export async function probeDirectPlayback(
  metadata: VideoTrackMetadata,
  config: VideoDecoderConfigLike,
  environment: PlaybackCapabilityEnvironment,
): Promise<DirectPlaybackProbe> {
  if (!environment.secureContext) {
    return { supported: false, reason: "insecure-context", config };
  }
  if (environment.videoDecoder === null) {
    return { supported: false, reason: "webcodecs-unavailable", config };
  }
  const unsupported = staticUnsupportedReason(metadata);
  if (unsupported) return { supported: false, reason: unsupported, config };

  try {
    const result =
      await environment.videoDecoder.isConfigSupported(config);
    return result.supported
      ? { supported: true, reason: null, config }
      : {
          supported: false,
          reason: "decoder-config-unsupported",
          config,
        };
  } catch {
    return {
      supported: false,
      reason: "decoder-probe-failed",
      config,
    };
  }
}

export interface RendererCapabilities {
  webgpuExternalTexture: boolean;
  webgl2VideoFrame: boolean;
  htmlVideo: boolean;
}

export function selectPlaybackFallback(
  direct: DirectPlaybackProbe,
  renderer: RendererCapabilities,
): MediaFallback {
  if (direct.supported && renderer.webgpuExternalTexture) {
    return { path: "webcodecs-webgpu", reason: null };
  }
  if (direct.supported && renderer.webgl2VideoFrame) {
    return {
      path: "webcodecs-webgl2",
      reason: renderer.webgpuExternalTexture
        ? "webgpu-sample-probe-failed"
        : "webgpu-unavailable",
    };
  }
  if (renderer.htmlVideo) {
    return {
      path: "html-video-webgl2",
      reason: direct.supported
        ? "decoded-renderer-unavailable"
        : direct.reason,
    };
  }
  return {
    path: "native-static",
    reason: direct.supported
      ? "live-renderer-unavailable"
      : direct.reason,
  };
}
