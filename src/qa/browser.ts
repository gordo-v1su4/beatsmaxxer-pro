import { getQaTelemetrySnapshot } from "./telemetry";

export function installQaTelemetryBridge() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has("qa")) return;

  Object.defineProperty(window, "__BEAT_SURFER_QA_TELEMETRY__", {
    configurable: true,
    value: {
      snapshot: getQaTelemetrySnapshot,
    },
  });
}
