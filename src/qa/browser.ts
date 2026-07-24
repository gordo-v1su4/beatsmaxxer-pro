import { getQaTelemetrySnapshot } from "./telemetry";
import { createQaInstrumentedPlaybackCoordinator } from "../media/telemetry";
import type { DecodedFrameLike } from "../media/types";

export function installQaTelemetryBridge() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has("qa")) return;

  const mediaCoordinator =
    createQaInstrumentedPlaybackCoordinator<DecodedFrameLike>();
  Object.defineProperty(window, "__BEAT_SURFER_QA_TELEMETRY__", {
    configurable: true,
    value: {
      snapshot: getQaTelemetrySnapshot,
      mediaCoordinatorSnapshot: () => mediaCoordinator.snapshot(),
    },
  });

  const publishSnapshot = () => {
    document.documentElement.dataset.beatSurferQaTelemetry = JSON.stringify(
      getQaTelemetrySnapshot(),
    );
  };
  publishSnapshot();
  window.setInterval(publishSnapshot, 500);
}
