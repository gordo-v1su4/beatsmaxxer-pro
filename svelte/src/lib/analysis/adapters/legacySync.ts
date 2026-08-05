import {
  ANALYSIS_SCHEMA_VERSION,
  LEGACY_SYNC_ANALYSIS_VERSION,
  eventFromTime,
  type AnalysisAttemptV1,
  type AnalysisEventV1,
  type AnalysisProvider,
  type AnalysisResultV1,
  type AubioFallbackReason,
  type EssentiaAttemptV1,
  type RhythmV1,
  type StructuralSegmentV1,
} from "../contracts";
import { getAubioFallbackReason, validateAnalysisResultV1 } from "../validate";

const LEGACY_SAMPLE_RATE_HZ = 44_100;
const LEGACY_WARNING = "legacy-sync";
const PROVIDENCE_WARNING = "provider provenance is incomplete; result is unverified";

export interface LegacySyncAdapterOptions {
  endpointFor: (endpoint: "fast" | "rhythm") => URL;
  engineHint?: string;
  fetch?: typeof globalThis.fetch;
}

export class LegacyAnalysisHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "analysis_request_failed") {
    super(message);
    this.name = "LegacyAnalysisHttpError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchLegacySyncAnalysis(
  file: File,
  options: LegacySyncAdapterOptions,
): Promise<AnalysisResultV1> {
  const formData = new FormData();
  formData.set("file", file, file.name);
  return requestLegacySyncAnalysis(formData, options);
}

// Outermost rung of the timeout ladder: upstream 15s < function maxDuration 30s
// < client 40s. The client must lose last, otherwise it aborts a request the
// server would have answered with a specific, actionable error code. The upload
// itself (up to ~3.4 MB) counts against the function budget, so the gaps are
// sized for a slow connection rather than a warm one.
const ANALYSIS_FETCH_TIMEOUT_MS = 40_000;

async function fetchWithTimeout(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs = ANALYSIS_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestLegacySyncAnalysis(
  formData: FormData,
  options: LegacySyncAdapterOptions,
): Promise<AnalysisResultV1> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (options.engineHint?.trim().toLowerCase() === "essentia") {
    const rhythm = await postLegacyEndpoint(fetchImpl, options, "rhythm", formData);
    const rhythmPayload = await readResponsePayload(rhythm);
    if (!rhythm.ok) throw httpError(rhythmPayload, rhythm);
    return normalizeLegacySyncAnalysis(rhythmPayload);
  }

  const fast = await postLegacyEndpoint(fetchImpl, options, "fast", formData);
  const fastPayload = await readResponsePayload(fast);
  if (fast.ok) return normalizeLegacySyncAnalysis(fastPayload);

  if (![404, 405, 422, 500].includes(fast.status)) {
    throw httpError(fastPayload, fast);
  }

  const rhythm = await postLegacyEndpoint(fetchImpl, options, "rhythm", formData);
  const rhythmPayload = await readResponsePayload(rhythm);
  if (!rhythm.ok) throw httpError(rhythmPayload, rhythm);
  return normalizeLegacySyncAnalysis(rhythmPayload);
}

export async function normalizeLegacySyncResponse(response: Response) {
  const payload = await readResponsePayload(response);
  if (!response.ok) throw httpError(payload, response);
  return normalizeLegacySyncAnalysis(payload);
}

export function normalizeLegacySyncAnalysis(payload: unknown): AnalysisResultV1 {
  if (isVersionedPayload(payload)) return validateAnalysisResultV1(payload);
  const record = requireRecord(payload);
  const sampleRate = positiveInteger(record.sample_rate ?? record.sample_rate_hz) ?? LEGACY_SAMPLE_RATE_HZ;
  const beats = normalizeTimes(record.beats, sampleRate);
  const onsets = normalizeTimes(record.onsets, sampleRate);
  const bpm = finiteNumber(record.bpm);
  if (bpm === null || bpm <= 0) throw new Error("Analysis service did not return a usable BPM.");
  const confidence = clampConfidence(finiteNumber(record.confidence) ?? 0);
  const duration = Math.max(
    0,
    finiteNumber(record.duration ?? record.duration_s) ??
      Math.max(beats.at(-1)?.time_s ?? 0, onsets.at(-1)?.time_s ?? 0),
  );
  const rhythm: RhythmV1 = { bpm, confidence, beats };
  const reportedProvider = normalizeProvider(record.provider ?? record.analysis_provider);
  const providerVersion = stringValue(
    record.provider_version ?? record.engine_version ?? record.analysis_provider_version,
  );
  const providerConfig = objectValue(record.provider_config ?? record.engine_config);
  const hasVerifiedProvider = reportedProvider !== null && providerVersion !== null && providerConfig !== null;

  const preservedAubioAttempt = normalizePreservedAubioAttempt(record.aubio_attempt, sampleRate);
  const aubioAttempt = preservedAubioAttempt ?? createUnavailableAttempt();
  let essentiaAttempt: EssentiaAttemptV1 | undefined;
  if (hasVerifiedProvider && reportedProvider === "aubio") {
    Object.assign(aubioAttempt, {
      status: "succeeded",
      version: providerVersion,
      config: providerConfig,
      rhythm,
      onsets,
    } satisfies AnalysisAttemptV1);
  } else if (hasVerifiedProvider && reportedProvider === "essentia") {
    essentiaAttempt = {
      status: "succeeded",
      version: providerVersion,
      config: providerConfig,
      rhythm,
      onsets,
      structural_segments: normalizeStructuralSegments(record, sampleRate),
    };
  }

  const fallbackReason = normalizeFallbackReason(record.fallback_reason);
  const aubioRejectionReason = getAubioFallbackReason(aubioAttempt);
  const aubioAccepted =
    hasVerifiedProvider &&
    reportedProvider === "aubio" &&
    getAubioFallbackReason(aubioAttempt) === null;
  const essentiaAccepted =
    hasVerifiedProvider &&
    reportedProvider === "essentia" &&
    preservedAubioAttempt !== null &&
    fallbackReason !== null &&
    fallbackReason === aubioRejectionReason;
  const effective = aubioAccepted
    ? {
        provider: "aubio" as const,
        selection_reason: "primary_accepted" as const,
        verified: true as const,
        rhythm,
        onsets,
      }
    : essentiaAccepted
      ? {
          provider: "essentia" as const,
          selection_reason: fallbackReason,
          verified: true as const,
          rhythm,
          onsets,
        }
      : {
          provider: "unknown" as const,
          selection_reason: "legacy_unverified" as const,
          verified: false as const,
          rhythm,
          onsets,
        };

  return validateAnalysisResultV1({
    schema_version: ANALYSIS_SCHEMA_VERSION,
    analysis_version: stringValue(record.analysis_version) ?? LEGACY_SYNC_ANALYSIS_VERSION,
    input_sha256: sha256Value(record.input_sha256),
    canonical_pcm: {
      sample_rate_hz: sampleRate,
      channels: positiveInteger(record.channels) ?? 1,
      duration_s: duration,
      timebase: "samples",
    },
    provenance: {
      decoder: {
        name: stringValue(record.decoder_name) ?? "legacy-unknown",
        version: stringValue(record.decoder_version),
      },
      aubio: {
        version: aubioAttempt.version,
        config: aubioAttempt.config,
      },
      ...(hasVerifiedProvider && reportedProvider === "essentia"
        ? { essentia: { version: providerVersion, config: providerConfig } }
        : {}),
      container_image: stringValue(record.container_image),
      configuration: {},
    },
    attempts: {
      aubio: aubioAttempt,
      ...(essentiaAttempt ? { essentia: essentiaAttempt } : {}),
    },
    effective,
    warnings: [
      LEGACY_WARNING,
      ...(!hasVerifiedProvider || effective.provider === "unknown" ? [PROVIDENCE_WARNING] : []),
    ],
  });
}

function normalizePreservedAubioAttempt(
  value: unknown,
  sampleRate: number,
): AnalysisAttemptV1 | null {
  const record = objectValue(value);
  if (!record) return null;
  const status = normalizeAttemptStatus(record.status);
  const version = stringValue(record.version);
  const config = objectValue(record.config);
  if (!status || !version || !config) return null;

  const bpm = finiteNumber(record.bpm);
  const confidence = finiteNumber(record.confidence);
  const beats = normalizeTimes(record.beats, sampleRate);
  const onsets = normalizeTimes(record.onsets, sampleRate);
  const hasRhythm = bpm !== null && bpm > 0 && confidence !== null;
  return {
    status,
    version,
    config,
    ...(hasRhythm
      ? {
          rhythm: {
            bpm,
            confidence: clampConfidence(confidence),
            beats,
          },
          onsets,
        }
      : {}),
    ...(stringValue(record.failure_code)
      ? { failure_code: stringValue(record.failure_code)! }
      : {}),
  };
}

function normalizeAttemptStatus(value: unknown): AnalysisAttemptV1["status"] | null {
  return value === "succeeded" ||
    value === "failed" ||
    value === "not_attempted" ||
    value === "unverified"
    ? value
    : null;
}

function postLegacyEndpoint(
  fetchImpl: typeof globalThis.fetch,
  options: LegacySyncAdapterOptions,
  endpointName: "fast" | "rhythm",
  formData: FormData,
) {
  const endpoint = options.endpointFor(endpointName);
  return fetchWithTimeout(fetchImpl, endpoint.toString(), { method: "POST", body: formData });
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function httpError(payload: unknown, response: Response) {
  const record = objectValue(payload);
  const message =
    stringValue(record?.detail) ??
    stringValue(record?.error) ??
    stringValue(record?.message) ??
    (typeof payload === "string" ? stringValue(payload) : null) ??
    response.statusText.trim() ??
    `Analysis request failed with ${response.status}`;
  const code =
    stringValue(record?.error_code) ??
    stringValue(record?.code) ??
    (response.status === 413 ? "upload_too_large" : "analysis_request_failed");
  return new LegacyAnalysisHttpError(message || `Analysis request failed with ${response.status}`, response.status, code);
}

function createUnavailableAttempt(): AnalysisAttemptV1 {
  return {
    status: "unverified",
    version: null,
    config: null,
    failure_code: "provider_not_reported",
  };
}

function normalizeStructuralSegments(
  record: Record<string, unknown>,
  sampleRate: number,
): StructuralSegmentV1[] | undefined {
  const explicit = record.structural_segments;
  const structure = objectValue(record.structure);
  const boundaries = Array.isArray(explicit)
    ? explicit
    : Array.isArray(structure?.boundaries)
      ? structure.boundaries
      : null;
  if (!boundaries) return undefined;

  if (Array.isArray(explicit)) {
    const segments = explicit.flatMap((value) => {
      const segment = objectValue(value);
      if (!segment || "label" in segment) return [];
      const start = finiteNumber(segment.start_time_s ?? segment.start);
      const end = finiteNumber(segment.end_time_s ?? segment.end);
      return start !== null && end !== null && end > start
        ? [segmentFromTimes(start, end, sampleRate)]
        : [];
    });
    return segments.length > 0 ? segments : undefined;
  }

  const times = boundaries
    .map(finiteNumber)
    .filter((value): value is number => value !== null && value >= 0)
    .sort((a, b) => a - b);
  const segments = times.slice(0, -1).flatMap((start, index) => {
    const end = times[index + 1];
    return end > start ? [segmentFromTimes(start, end, sampleRate)] : [];
  });
  return segments.length > 0 ? segments : undefined;
}

function segmentFromTimes(start: number, end: number, sampleRate: number): StructuralSegmentV1 {
  const startEvent = eventFromTime(start, sampleRate);
  const endEvent = eventFromTime(end, sampleRate);
  return {
    start_sample_index: startEvent.sample_index,
    end_sample_index: endEvent.sample_index,
    start_time_s: startEvent.time_s,
    end_time_s: endEvent.time_s,
  };
}

function normalizeTimes(value: unknown, sampleRate: number): AnalysisEventV1[] {
  if (!Array.isArray(value)) return [];
  const bySample = new Map<number, AnalysisEventV1>();
  for (const entry of value) {
    const time = finiteNumber(entry);
    if (time === null || time < 0) continue;
    const event = eventFromTime(time, sampleRate);
    bySample.set(event.sample_index, event);
  }
  return [...bySample.values()].sort((a, b) => a.sample_index - b.sample_index);
}

function normalizeProvider(value: unknown): AnalysisProvider | null {
  if (typeof value !== "string") return null;
  const provider = value.trim().toLowerCase();
  return provider === "aubio" || provider === "essentia" ? provider : null;
}

function normalizeFallbackReason(value: unknown): AubioFallbackReason | null {
  const reasons: AubioFallbackReason[] = [
    "invalid_bpm",
    "insufficient_beats",
    "low_confidence",
    "unusable_onsets",
  ];
  return typeof value === "string" && reasons.includes(value as AubioFallbackReason)
    ? value as AubioFallbackReason
    : null;
}

function isVersionedPayload(value: unknown) {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).schema_version);
}

function requireRecord(value: unknown): Record<string, unknown> {
  const record = objectValue(value);
  if (!record) throw new Error("Analysis service returned an invalid rhythm payload.");
  return record;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sha256Value(value: unknown) {
  const hash = stringValue(value);
  return hash && /^[a-f0-9]{64}$/i.test(hash) ? hash : null;
}
