import type { AnalysisResultV1 } from "../analysis/contracts";
import {
  fetchLegacySyncAnalysis,
  normalizeLegacySyncAnalysis,
  normalizeLegacySyncResponse,
} from "../analysis/adapters/legacySync";

export interface EssentiaRhythmAnalysis {
  bpm: number;
  beats: number[];
  confidence: number;
  duration: number;
  energy: {
    curve: number[];
  };
  onsets: number[];
  structure?: {
    sections: Array<{
      start: number;
      end: number;
      label: string;
      duration: number;
      energy: number;
    }>;
    boundaries: number[];
  };
  analysisResult: AnalysisResultV1;
  provider: AnalysisResultV1["effective"]["provider"];
  verified: boolean;
}

declare const __APP_ESSENTIA_API_BASE_URL__: string;
declare const __APP_ESSENTIA_ANALYSIS_ENGINE__: string;

const DEFAULT_ESSENTIA_API_BASE_URL = "https://essentia.v1su4.dev";

export async function fetchEssentiaRhythmAnalysis(file: File): Promise<EssentiaRhythmAnalysis> {
  const result = await fetchLegacySyncAnalysis(file, {
    endpointFor: createHostedAnalysisEndpoint,
    engineHint: resolveEssentiaAnalysisEngine(),
  });
  return toRhythmAnalysis(result);
}

export async function fetchRhythmAnalysisFromUrl(analysisUrl: string): Promise<EssentiaRhythmAnalysis> {
  return toRhythmAnalysis(await normalizeLegacySyncResponse(await fetch(analysisUrl)));
}

function resolveEssentiaApiBaseUrl() {
  const configured =
    __APP_ESSENTIA_API_BASE_URL__ ||
    import.meta.env.VITE_ESSENTIA_API_BASE_URL ||
    import.meta.env.VITE_ESSENTIA_API_URL ||
    DEFAULT_ESSENTIA_API_BASE_URL;

  return configured.trim().replace(/\/+$/, "");
}

function resolveEssentiaAnalysisEngine() {
  return (
    import.meta.env.VITE_ESSENTIA_ANALYSIS_ENGINE ||
    __APP_ESSENTIA_ANALYSIS_ENGINE__ ||
    "aubio"
  ).trim();
}

function createHostedAnalysisEndpoint(endpointName: "fast" | "rhythm") {
  return import.meta.env.DEV
    ? new URL(`/__api/analyze/${endpointName}`, window.location.origin)
    : new URL(`${resolveEssentiaApiBaseUrl()}/analyze/${endpointName}`);
}

export function normalizeRhythmAnalysis(payload: unknown): EssentiaRhythmAnalysis {
  return toRhythmAnalysis(normalizeLegacySyncAnalysis(payload));
}

function toRhythmAnalysis(result: AnalysisResultV1): EssentiaRhythmAnalysis {
  const { rhythm, onsets } = result.effective;
  const structuralSegments = result.attempts.essentia?.structural_segments;
  return {
    bpm: rhythm.bpm,
    beats: rhythm.beats.map((event) => event.time_s),
    confidence: rhythm.confidence,
    duration: result.canonical_pcm.duration_s,
    energy: { curve: [] },
    onsets: onsets.map((event) => event.time_s),
    structure: structuralSegments && structuralSegments.length > 0
      ? {
          sections: structuralSegments.map((segment) => ({
            start: segment.start_time_s,
            end: segment.end_time_s,
            label: "section",
            duration: segment.end_time_s - segment.start_time_s,
            energy: 0,
          })),
          boundaries: [
            structuralSegments[0].start_time_s,
            ...structuralSegments.map((segment) => segment.end_time_s),
          ],
        }
      : undefined,
    analysisResult: result,
    provider: result.effective.provider,
    verified: result.effective.verified,
  };
}
