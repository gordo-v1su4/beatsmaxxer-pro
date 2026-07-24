import "vite/client";

interface ImportMetaEnv {
  readonly VITE_ESSENTIA_API_BASE_URL?: string;
  readonly VITE_ESSENTIA_API_URL?: string;
  readonly VITE_ESSENTIA_ANALYSIS_ENGINE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly __BEAT_SURFER_QA_TELEMETRY__?: {
    snapshot: () => import("./qa/telemetry").QaTelemetrySnapshot;
  };
}

declare const __APP_ESSENTIA_API_BASE_URL__: string;
declare const __APP_ESSENTIA_ANALYSIS_ENGINE__: string;
