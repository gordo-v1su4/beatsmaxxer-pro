import type { AnalysisResultV1 } from "$lib/analysis/contracts";
import {
  fetchLegacySyncAnalysis,
  normalizeLegacySyncAnalysis,
} from "$lib/analysis/adapters/legacySync";
import { prepareAnalysisUpload } from "$lib/audio/prepareAnalysisUpload";
import { isTauriRuntime } from "$lib/platform/runtime";
import { isDesktopEssentiaConfigured, tauriInvoke } from "$lib/platform/tauriInvoke";

export interface EssentiaRhythmAnalysis {
  bpm: number;
  beats: number[];
  confidence: number;
  duration: number;
  /** Chromatic index 0–11 (C…B) when detected; otherwise 0. */
  keyIndex: number;
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

export async function fetchEssentiaRhythmAnalysis(file: File): Promise<EssentiaRhythmAnalysis> {
  if (isTauriRuntime()) {
    const configured = await isDesktopEssentiaConfigured();
    if (!configured) {
      throw new Error(
        "Essentia is not configured for desktop. Set ESSENTIA_API_BASE_URL and ESSENTIA_API_KEY in .env, then restart bun run dev:desktop."
      );
    }
    const analysisFile = await prepareAnalysisUpload(file);
    return fetchEssentiaViaTauri(analysisFile);
  }
  if (!isHostedAnalysisEnabled()) {
    throw new Error("Hosted analysis is disabled. Local playback and realtime analysis remain available.");
  }
  const analysisFile = await prepareAnalysisUpload(file);
  const result = await fetchLegacySyncAnalysis(analysisFile, {
    endpointFor: createHostedAnalysisEndpoint,
    engineHint: "essentia",
  });
  return toRhythmAnalysis(result);
}

async function fetchEssentiaViaTauri(analysisFile: File): Promise<EssentiaRhythmAnalysis> {
  const bytes = new Uint8Array(await analysisFile.arrayBuffer());
  const payload = await tauriInvoke<string>("analyze_rhythm", {
    fileName: analysisFile.name,
    bytes,
  });
  return normalizeRhythmAnalysis(JSON.parse(payload));
}

export function isHostedAnalysisEnabled() {
  return typeof __APP_ESSENTIA_ANALYSIS_ENABLED__ === "boolean" && __APP_ESSENTIA_ANALYSIS_ENABLED__;
}

export function createHostedAnalysisEndpoint(
  endpointName: "fast" | "rhythm",
  origin = window.location.origin,
) {
  // Same-origin proxy in dev (Vite) and production (Vercel /api rewrite).
  // The upstream Essentia service requires X-API-Key, which must not ship to the browser.
  return new URL(`/__api/analyze/${endpointName}`, origin);
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
    keyIndex: extractKeyIndex(result),
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

const KEY_NAME_TO_INDEX: Record<string, number> = {
  c: 0,
  'c#': 1,
  db: 1,
  d: 2,
  'd#': 3,
  eb: 3,
  e: 4,
  f: 5,
  'f#': 6,
  gb: 6,
  g: 7,
  'g#': 8,
  ab: 8,
  a: 9,
  'a#': 10,
  bb: 10,
  b: 11,
};

function parseKeyLabel(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  if (normalized in KEY_NAME_TO_INDEX) return KEY_NAME_TO_INDEX[normalized];
  const match = normalized.match(/^([a-g](?:#|b)?)(?:maj|min|major|minor)?$/);
  if (match?.[1] && match[1] in KEY_NAME_TO_INDEX) return KEY_NAME_TO_INDEX[match[1]];
  return null;
}

function extractKeyIndex(result: AnalysisResultV1): number {
  const candidates: unknown[] = [
    (result as { key?: unknown }).key,
    (result as { tonic?: unknown }).tonic,
    result.attempts.essentia?.config?.key,
    result.attempts.essentia?.config?.tonic,
    result.provenance.configuration?.key,
    result.provenance.configuration?.tonic,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return ((Math.round(candidate) % 12) + 12) % 12;
    }
    const parsed = parseKeyLabel(candidate);
    if (parsed != null) return parsed;
  }

  return 0;
}
