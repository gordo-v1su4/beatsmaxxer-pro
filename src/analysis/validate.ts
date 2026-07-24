import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisAttemptV1,
  type AnalysisEventV1,
  type AnalysisResultV1,
  type AubioFallbackReason,
  type RhythmV1,
  type StructuralSegmentV1,
} from "./contracts";

export interface AubioAcceptanceConfig {
  minimum_bpm: number;
  maximum_bpm: number;
  minimum_confidence: number;
  minimum_beats: number;
  minimum_onsets: number;
}

export const DEFAULT_AUBIO_ACCEPTANCE_CONFIG: AubioAcceptanceConfig = {
  minimum_bpm: 30,
  maximum_bpm: 300,
  minimum_confidence: 0,
  minimum_beats: 2,
  minimum_onsets: 1,
};

export function getAubioFallbackReason(
  attempt: AnalysisAttemptV1,
  config: AubioAcceptanceConfig = DEFAULT_AUBIO_ACCEPTANCE_CONFIG,
): AubioFallbackReason | null {
  const rhythm = attempt.rhythm;
  if (
    attempt.status !== "succeeded" ||
    !rhythm ||
    !Number.isFinite(rhythm.bpm) ||
    rhythm.bpm < config.minimum_bpm ||
    rhythm.bpm > config.maximum_bpm
  ) {
    return "invalid_bpm";
  }
  if (rhythm.beats.length < config.minimum_beats || !isStrictlyOrdered(rhythm.beats)) {
    return "insufficient_beats";
  }
  if (!Number.isFinite(rhythm.confidence) || rhythm.confidence < config.minimum_confidence) {
    return "low_confidence";
  }
  if (
    !attempt.onsets ||
    attempt.onsets.length < config.minimum_onsets ||
    !isStrictlyOrdered(attempt.onsets)
  ) {
    return "unusable_onsets";
  }
  return null;
}

export function isProductionProvenanceVerified(result: AnalysisResultV1) {
  return result.effective.provider !== "unknown";
}

export function validateAnalysisResultV1(value: unknown): AnalysisResultV1 {
  const result = requireRecord(value, "analysis result");
  if (result.schema_version !== ANALYSIS_SCHEMA_VERSION) {
    throw new Error(`Unsupported analysis schema version: ${String(result.schema_version)}`);
  }

  requireNonEmptyString(result.analysis_version, "analysis_version");
  if (result.input_sha256 !== null) {
    const hash = requireNonEmptyString(result.input_sha256, "input_sha256");
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("input_sha256 must be a SHA-256 hex digest.");
  }

  const pcm = requireRecord(result.canonical_pcm, "canonical_pcm");
  const sampleRate = requirePositiveInteger(pcm.sample_rate_hz, "canonical_pcm.sample_rate_hz");
  requirePositiveInteger(pcm.channels, "canonical_pcm.channels");
  const duration = requireFiniteNumber(pcm.duration_s, "canonical_pcm.duration_s");
  if (duration < 0) throw new Error("canonical_pcm.duration_s must not be negative.");
  if (pcm.timebase !== "samples") throw new Error("canonical_pcm.timebase must be samples.");

  validateProvenance(result.provenance);
  const attempts = requireRecord(result.attempts, "attempts");
  validateAttempt(attempts.aubio, "attempts.aubio", sampleRate, duration);
  if (attempts.essentia !== undefined) {
    const essentia = validateAttempt(
      attempts.essentia,
      "attempts.essentia",
      sampleRate,
      duration,
    );
    const rawSegments = essentia.structural_segments;
    if (rawSegments !== undefined) {
      if (!Array.isArray(rawSegments)) {
        throw new Error("attempts.essentia.structural_segments must be an array.");
      }
      rawSegments.forEach((segment, index) =>
        validateStructuralSegment(
          segment,
          `attempts.essentia.structural_segments[${index}]`,
          sampleRate,
          duration,
        ),
      );
    }
  }

  const effective = requireRecord(result.effective, "effective");
  const provider = effective.provider;
  if (provider !== "aubio" && provider !== "essentia" && provider !== "unknown") {
    throw new Error("effective.provider is invalid.");
  }
  validateRhythm(effective.rhythm, "effective.rhythm", sampleRate, duration);
  validateEvents(effective.onsets, "effective.onsets", sampleRate, duration);
  if (provider === "aubio") {
    if (effective.selection_reason !== "primary_accepted" || effective.verified !== true) {
      throw new Error("Verified Aubio results require primary_accepted selection.");
    }
  } else if (provider === "essentia") {
    const reasons = ["invalid_bpm", "insufficient_beats", "low_confidence", "unusable_onsets"];
    if (!reasons.includes(String(effective.selection_reason)) || effective.verified !== true) {
      throw new Error("Verified Essentia results require an Aubio fallback reason.");
    }
  } else if (
    effective.selection_reason !== "legacy_unverified" ||
    effective.verified !== false
  ) {
    throw new Error("Unknown results must be marked legacy_unverified.");
  }

  if (!Array.isArray(result.warnings) || !result.warnings.every((entry) => typeof entry === "string")) {
    throw new Error("warnings must be an array of strings.");
  }
  return value as AnalysisResultV1;
}

function validateProvenance(value: unknown) {
  const provenance = requireRecord(value, "provenance");
  const decoder = requireRecord(provenance.decoder, "provenance.decoder");
  requireNonEmptyString(decoder.name, "provenance.decoder.name");
  requireNullableString(decoder.version, "provenance.decoder.version");
  validateProviderProvenance(provenance.aubio, "provenance.aubio");
  if (provenance.essentia !== undefined) {
    validateProviderProvenance(provenance.essentia, "provenance.essentia");
  }
  requireNullableString(provenance.container_image, "provenance.container_image");
  requireRecord(provenance.configuration, "provenance.configuration");
}

function validateProviderProvenance(value: unknown, path: string) {
  const provider = requireRecord(value, path);
  requireNullableString(provider.version, `${path}.version`);
  if (provider.config !== null) requireRecord(provider.config, `${path}.config`);
}

function validateAttempt(
  value: unknown,
  path: string,
  sampleRate: number,
  duration: number,
) {
  const attempt = requireRecord(value, path);
  const statuses = ["succeeded", "failed", "not_attempted", "unverified"];
  if (!statuses.includes(String(attempt.status))) throw new Error(`${path}.status is invalid.`);
  requireNullableString(attempt.version, `${path}.version`);
  if (attempt.config !== null) requireRecord(attempt.config, `${path}.config`);
  if (attempt.rhythm !== undefined) {
    validateRhythm(attempt.rhythm, `${path}.rhythm`, sampleRate, duration);
  }
  if (attempt.onsets !== undefined) {
    validateEvents(attempt.onsets, `${path}.onsets`, sampleRate, duration);
  }
  if (attempt.failure_code !== undefined) {
    requireNonEmptyString(attempt.failure_code, `${path}.failure_code`);
  }
  return attempt;
}

function validateRhythm(value: unknown, path: string, sampleRate: number, duration: number) {
  const rhythm = requireRecord(value, path);
  const bpm = requireFiniteNumber(rhythm.bpm, `${path}.bpm`);
  if (bpm <= 0) throw new Error(`${path}.bpm must be positive.`);
  const confidence = requireFiniteNumber(rhythm.confidence, `${path}.confidence`);
  if (confidence < 0 || confidence > 1) {
    throw new Error(`${path}.confidence must be between 0 and 1.`);
  }
  validateEvents(rhythm.beats, `${path}.beats`, sampleRate, duration);
  return rhythm as unknown as RhythmV1;
}

function validateEvents(
  value: unknown,
  path: string,
  sampleRate: number,
  duration: number,
) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  let previousSample = -1;
  value.forEach((rawEvent, index) => {
    const event = requireRecord(rawEvent, `${path}[${index}]`);
    const sampleIndex = requireNonNegativeInteger(event.sample_index, `${path}[${index}].sample_index`);
    const time = requireFiniteNumber(event.time_s, `${path}[${index}].time_s`);
    if (sampleIndex <= previousSample) throw new Error(`${path} must be strictly ordered.`);
    if (time < 0 || time > duration + 1 / sampleRate) {
      throw new Error(`${path}[${index}].time_s is outside the decoded duration.`);
    }
    if (Math.abs(time - sampleIndex / sampleRate) > 0.5 / sampleRate + Number.EPSILON) {
      throw new Error(`${path}[${index}] has inconsistent sample and time values.`);
    }
    previousSample = sampleIndex;
  });
}

function validateStructuralSegment(
  value: unknown,
  path: string,
  sampleRate: number,
  duration: number,
) {
  const segment = requireRecord(value, path);
  if ("label" in segment) {
    throw new Error(`${path} must be unlabeled; semantic labels require a separate classifier.`);
  }
  const startSample = requireNonNegativeInteger(segment.start_sample_index, `${path}.start_sample_index`);
  const endSample = requireNonNegativeInteger(segment.end_sample_index, `${path}.end_sample_index`);
  if (endSample <= startSample) throw new Error(`${path} must have positive duration.`);
  validateEvents(
    [
      { sample_index: startSample, time_s: segment.start_time_s },
      { sample_index: endSample, time_s: segment.end_time_s },
    ],
    path,
    sampleRate,
    duration,
  );
  return segment as unknown as StructuralSegmentV1;
}

function isStrictlyOrdered(events: AnalysisEventV1[]) {
  return events.every((event, index) => index === 0 || event.sample_index > events[index - 1].sample_index);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireFiniteNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, path: string) {
  const number = requireFiniteNumber(value, path);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${path} must be a positive integer.`);
  return number;
}

function requireNonNegativeInteger(value: unknown, path: string) {
  const number = requireFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${path} must be a non-negative integer.`);
  }
  return number;
}

function requireNonEmptyString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string.`);
  return value;
}

function requireNullableString(value: unknown, path: string) {
  if (value !== null) requireNonEmptyString(value, path);
}
