import { describe, expect, test } from "bun:test";
import {
  probeDirectPlayback,
  selectPlaybackFallback,
  type DirectPlaybackUnsupportedReason,
} from "../../../src/media/capabilities";
import { mediaTrackFixture } from "./fakes";

describe("media capability probing", () => {
  test("accepts only capability-proven v1 MP4/H264 input", async () => {
    const track = mediaTrackFixture();
    let probedConfig: unknown = null;
    const result = await probeDirectPlayback(
      track.metadata,
      track.decoderConfig,
      {
        secureContext: true,
        videoDecoder: {
          async isConfigSupported(config) {
            probedConfig = config;
            return { supported: true };
          },
        },
      },
    );

    expect(result).toEqual({
      supported: true,
      reason: null,
      config: track.decoderConfig,
    });
    expect(probedConfig).toBe(track.decoderConfig);
  });

  test("reports each unsupported v1 boundary explicitly", async () => {
    const track = mediaTrackFixture();
    const cases: Array<
      [
        Partial<typeof track.metadata>,
        DirectPlaybackUnsupportedReason,
      ]
    > = [
      [{ container: "webm" }, "unsupported-container"],
      [{ codec: "vp09.00.10.08" }, "unsupported-codec"],
      [{ profile: "extended" }, "unsupported-profile"],
      [{ bitDepth: 10 }, "unsupported-bit-depth"],
      [{ chromaSubsampling: "4:2:2" }, "unsupported-chroma-subsampling"],
      [{ codedWidth: 1921 }, "resolution-exceeds-1080p"],
      [{ codedHeight: 1081 }, "resolution-exceeds-1080p"],
      [{ frameRate: 60.001 }, "frame-rate-exceeds-60"],
    ];

    for (const [override, reason] of cases) {
      expect(
        await probeDirectPlayback(
          { ...track.metadata, ...override },
          track.decoderConfig,
          {
            secureContext: true,
            videoDecoder: {
              async isConfigSupported() {
                throw new Error("static rejection must precede probe");
              },
            },
          },
        ),
      ).toMatchObject({ supported: false, reason });
    }
  });

  test("reports environment and exact decoder probe failures", async () => {
    const track = mediaTrackFixture();
    expect(
      await probeDirectPlayback(track.metadata, track.decoderConfig, {
        secureContext: false,
        videoDecoder: null,
      }),
    ).toMatchObject({ reason: "insecure-context" });
    expect(
      await probeDirectPlayback(track.metadata, track.decoderConfig, {
        secureContext: true,
        videoDecoder: null,
      }),
    ).toMatchObject({ reason: "webcodecs-unavailable" });
    expect(
      await probeDirectPlayback(track.metadata, track.decoderConfig, {
        secureContext: true,
        videoDecoder: {
          async isConfigSupported() {
            return { supported: false };
          },
        },
      }),
    ).toMatchObject({ reason: "decoder-config-unsupported" });
    expect(
      await probeDirectPlayback(track.metadata, track.decoderConfig, {
        secureContext: true,
        videoDecoder: {
          async isConfigSupported() {
            throw new Error("probe failed");
          },
        },
      }),
    ).toMatchObject({ reason: "decoder-probe-failed" });
  });

  test("selects the declared observable fallback ladder", () => {
    const supported = {
      supported: true as const,
      reason: null,
      config: mediaTrackFixture().decoderConfig,
    };
    expect(
      selectPlaybackFallback(supported, {
        webgpuExternalTexture: true,
        webgl2VideoFrame: true,
        htmlVideo: true,
      }),
    ).toEqual({ path: "webcodecs-webgpu", reason: null });
    expect(
      selectPlaybackFallback(supported, {
        webgpuExternalTexture: false,
        webgl2VideoFrame: true,
        htmlVideo: true,
      }),
    ).toEqual({
      path: "webcodecs-webgl2",
      reason: "webgpu-unavailable",
    });

    const unsupported = {
      supported: false as const,
      reason: "unsupported-codec" as const,
      config: mediaTrackFixture().decoderConfig,
    };
    expect(
      selectPlaybackFallback(unsupported, {
        webgpuExternalTexture: false,
        webgl2VideoFrame: false,
        htmlVideo: true,
      }),
    ).toEqual({
      path: "html-video-webgl2",
      reason: "unsupported-codec",
    });
    expect(
      selectPlaybackFallback(unsupported, {
        webgpuExternalTexture: false,
        webgl2VideoFrame: false,
        htmlVideo: false,
      }),
    ).toEqual({
      path: "native-static",
      reason: "unsupported-codec",
    });
  });
});
