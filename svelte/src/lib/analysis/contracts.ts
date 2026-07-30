export const ANALYSIS_SCHEMA_VERSION = "1" as const;
export const LEGACY_SYNC_ANALYSIS_VERSION = "legacy-sync" as const;

export type AnalysisProvider = "aubio" | "essentia";
export type EffectiveAnalysisProvider = AnalysisProvider | "unknown";

export type AubioFallbackReason =
  | "invalid_bpm"
  | "insufficient_beats"
  | "low_confidence"
  | "unusable_onsets";

export type AnalysisAttemptStatus =
  | "succeeded"
  | "failed"
  | "not_attempted"
  | "unverified";

export interface AnalysisEventV1 {
  sample_index: number;
  time_s: number;
}

export interface RhythmV1 {
  bpm: number;
  confidence: number;
  beats: AnalysisEventV1[];
}

export interface AnalysisAttemptV1 {
  status: AnalysisAttemptStatus;
  version: string | null;
  config: Record<string, unknown> | null;
  rhythm?: RhythmV1;
  onsets?: AnalysisEventV1[];
  failure_code?: string;
}

export interface StructuralSegmentV1 {
  start_sample_index: number;
  end_sample_index: number;
  start_time_s: number;
  end_time_s: number;
}

export interface EssentiaAttemptV1 extends AnalysisAttemptV1 {
  structural_segments?: StructuralSegmentV1[];
}

export interface AnalysisProvenanceV1 {
  decoder: {
    name: string;
    version: string | null;
  };
  aubio: {
    version: string | null;
    config: Record<string, unknown> | null;
  };
  essentia?: {
    version: string | null;
    config: Record<string, unknown> | null;
  };
  container_image: string | null;
  configuration: Record<string, unknown>;
}

export interface CanonicalPcmV1 {
  sample_rate_hz: number;
  channels: number;
  duration_s: number;
  timebase: "samples";
}

export interface EffectiveAubioAnalysisV1 {
  provider: "aubio";
  selection_reason: "primary_accepted";
  verified: true;
  rhythm: RhythmV1;
  onsets: AnalysisEventV1[];
}

export interface EffectiveEssentiaAnalysisV1 {
  provider: "essentia";
  selection_reason: AubioFallbackReason;
  verified: true;
  rhythm: RhythmV1;
  onsets: AnalysisEventV1[];
}

export interface EffectiveUnknownAnalysisV1 {
  provider: "unknown";
  selection_reason: "legacy_unverified";
  verified: false;
  rhythm: RhythmV1;
  onsets: AnalysisEventV1[];
}

export type EffectiveAnalysisV1 =
  | EffectiveAubioAnalysisV1
  | EffectiveEssentiaAnalysisV1
  | EffectiveUnknownAnalysisV1;

export interface AnalysisResultV1 {
  schema_version: typeof ANALYSIS_SCHEMA_VERSION;
  analysis_version: string;
  input_sha256: string | null;
  canonical_pcm: CanonicalPcmV1;
  provenance: AnalysisProvenanceV1;
  attempts: {
    aubio: AnalysisAttemptV1;
    essentia?: EssentiaAttemptV1;
  };
  effective: EffectiveAnalysisV1;
  warnings: string[];
}

export function eventTimeFromSample(sampleIndex: number, sampleRateHz: number) {
  return sampleIndex / sampleRateHz;
}

export function eventFromTime(timeS: number, sampleRateHz: number): AnalysisEventV1 {
  const sampleIndex = Math.max(0, Math.round(timeS * sampleRateHz));
  return {
    sample_index: sampleIndex,
    time_s: eventTimeFromSample(sampleIndex, sampleRateHz),
  };
}
