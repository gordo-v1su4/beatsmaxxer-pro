import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisAttemptV1,
  type AnalysisEventV1,
  type AnalysisResultV1,
  type AubioFallbackReason,
  type EssentiaAttemptV1,
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

export const AUBIO_FALLBACK_REASONS: readonly AubioFallbackReason[] = [
  "invalid_bpm",
  "insufficient_beats",
  "low_confidence",
  "unusable_onsets",
];

export function getAubioFallbackReason(
  attempt: AnalysisAttemptV1,
  config: AubioAcceptanceConfig = DEFAULT_AUBIO_ACCEPTANCE_CONFIG,
): AubioFallbackReason | null {
  if (attempt.status === "failed") {
    return attempt.failure_code &&
      AUBIO_FALLBACK_REASONS.includes(attempt.failure_code as AubioFallbackReason)
      ? attempt.failure_code as AubioFallbackReason
      : null;
  }
  if (attempt.status !== "succeeded") return null;

  const rhythm = attempt.rhythm;
  if (
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
  try {
    return validateAnalysisResultV1(result).effective.provider !== "unknown";
  } catch {
    return false;
  }
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
  const aubioAttempt = validateAttempt(
    attempts.aubio,
    "attempts.aubio",
    sampleRate,
    duration,
  ) as unknown as AnalysisAttemptV1;
  let essentiaAttempt: EssentiaAttemptV1 | undefined;
  if (attempts.essentia !== undefined) {
    const essentia = validateAttempt(
      attempts.essentia,
      "attempts.essentia",
      sampleRate,
      duration,
    );
    essentiaAttempt = essentia as unknown as EssentiaAttemptV1;
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
    if (aubioAttempt.status !== "succeeded" || !aubioAttempt.rhythm || !aubioAttempt.onsets) {
      throw new Error("effective Aubio requires a succeeded Aubio attempt");
    }
    if (aubioAttempt.version === null || aubioAttempt.config === null) {
      throw new Error("effective Aubio requires complete attempt provenance");
    }
    const provenance = requireRecord(result.provenance, "provenance");
    const aubioProvenance = requireRecord(provenance.aubio, "provenance.aubio");
    if (
      aubioProvenance.version === null ||
      aubioProvenance.config === null ||
      aubioProvenance.version !== aubioAttempt.version ||
      !deepEqual(aubioProvenance.config, aubioAttempt.config)
    ) {
      throw new Error("effective Aubio requires complete provider provenance");
    }
    if (
      !deepEqual(effective.rhythm, aubioAttempt.rhythm) ||
      !deepEqual(effective.onsets, aubioAttempt.onsets)
    ) {
      throw new Error("effective Aubio must match the preserved Aubio attempt");
    }
    if (getAubioFallbackReason(aubioAttempt) !== null) {
      throw new Error("effective Aubio attempt does not satisfy the acceptance predicate");
    }
  } else if (provider === "essentia") {
    if (
      !AUBIO_FALLBACK_REASONS.includes(effective.selection_reason as AubioFallbackReason) ||
      effective.verified !== true
    ) {
      throw new Error("Verified Essentia results require an Aubio fallback reason.");
    }
    if (
      !essentiaAttempt ||
      essentiaAttempt.status !== "succeeded" ||
      !essentiaAttempt.rhythm ||
      !essentiaAttempt.onsets
    ) {
      throw new Error("effective Essentia requires a succeeded Essentia attempt");
    }
    if (essentiaAttempt.version === null || essentiaAttempt.config === null) {
      throw new Error("effective Essentia requires complete attempt provenance");
    }
    const provenance = requireRecord(result.provenance, "provenance");
    const essentiaProvenance = requireRecord(provenance.essentia, "provenance.essentia");
    if (
      essentiaProvenance.version === null ||
      essentiaProvenance.config === null ||
      essentiaProvenance.version !== essentiaAttempt.version ||
      !deepEqual(essentiaProvenance.config, essentiaAttempt.config)
    ) {
      throw new Error("effective Essentia requires complete provider provenance");
    }
    if (
      !deepEqual(effective.rhythm, essentiaAttempt.rhythm) ||
      !deepEqual(effective.onsets, essentiaAttempt.onsets)
    ) {
      throw new Error("effective Essentia must match the preserved Essentia attempt");
    }
    if (aubioAttempt.version === null || aubioAttempt.config === null) {
      throw new Error("effective Essentia requires preserved Aubio provenance");
    }
    const aubioProvenance = requireRecord(provenance.aubio, "provenance.aubio");
    if (
      aubioProvenance.version !== aubioAttempt.version ||
      !deepEqual(aubioProvenance.config, aubioAttempt.config)
    ) {
      throw new Error("effective Essentia requires preserved Aubio provenance");
    }
    const fallbackReason = getAubioFallbackReason(aubioAttempt);
    if (fallbackReason !== effective.selection_reason) {
      throw new Error("Essentia selection reason must match the Aubio fallback predicate");
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

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => deepEqual(entry, right[index]))
    );
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      deepEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}
