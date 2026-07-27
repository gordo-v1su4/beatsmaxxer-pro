import { getQaTelemetrySnapshot } from "./telemetry";
import { createQaInstrumentedPlaybackCoordinator } from "../media/telemetry";
import type { DecodedFrameLike } from "../media/types";
import { probeBrowserRendererCapabilities } from "../render/browserFactory";
import { mediaOwnerRegistry } from "../media/MediaOwnerRegistry";

declare const __APP_QA_MEDIA_AUTOLOAD__: boolean;

export function installQaTelemetryBridge() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has("qa") && !__APP_QA_MEDIA_AUTOLOAD__) return;

  const mediaCoordinator =
    createQaInstrumentedPlaybackCoordinator<DecodedFrameLike>();
  Object.defineProperty(window, "__BEAT_SURFER_QA_TELEMETRY__", {
    configurable: true,
    value: {
      snapshot: getQaTelemetrySnapshot,
      mediaCoordinatorSnapshot: () => mediaCoordinator.snapshot(),
      videoDecodeStats: () => mediaOwnerRegistry.decodeStats(),
    },
  });

  const publishSnapshot = () => {
    document.documentElement.dataset.beatSurferQaTelemetry = JSON.stringify(
      getQaTelemetrySnapshot(),
    );
  };
  publishSnapshot();
  window.setInterval(publishSnapshot, 500);

  if (params.get("qa") === "renderer-probe") {
    void publishRendererProbe();
  }
}

async function publishRendererProbe() {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 2;
  sampleCanvas.height = 2;
  const context = sampleCanvas.getContext("2d");
  if (!context || typeof VideoFrame === "undefined") {
    document.documentElement.dataset.beatSurferRendererProbe =
      JSON.stringify({ videoFrame: false });
    return;
  }
  context.fillStyle = "#808080";
  context.fillRect(0, 0, 2, 2);
  const createCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    return canvas;
  };
  const capabilities = await probeBrowserRendererCapabilities({
    createSampleFrame: async () =>
      new VideoFrame(sampleCanvas, { timestamp: 0 }),
    request: {
      width: 2,
      height: 2,
      effect: "timesampler",
      accentMode: "OFF",
      accentEnvelope: 0,
      rgbOffset: 0,
      mix: 1,
    },
    canvases: {
      webgpu: createCanvas(),
      webgl: createCanvas(),
      htmlVideo: createCanvas(),
    },
  });
  document.documentElement.dataset.beatSurferRendererProbe =
    JSON.stringify({ videoFrame: true, capabilities });
}
