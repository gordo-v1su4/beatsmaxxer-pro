import {
  ANALYSIS_SCHEMA_VERSION,
  eventFromTime,
  type AnalysisResultV1,
} from "$lib/analysis/contracts";
import type { EssentiaRhythmAnalysis } from "$lib/audio/essentia";
import { prepareStudioUpload } from "$lib/audio/prepareStudioUpload";
import {
  normalizeStructureAnalysis,
  type EssentiaStructureAnalysis,
} from "$lib/audio/structureNormalize";

const STUDIO_SAMPLE_RATE_HZ = 44_100;
const STUDIO_POLL_INTERVAL_MS = 3_000;
const STUDIO_POLL_TIMEOUT_MS = 30 * 60_000;
const STUDIO_SUBMIT_TIMEOUT_MS = 120_000;
const STUDIO_POLL_REQUEST_TIMEOUT_MS = 60_000;

export interface StudioAudioV1 {
  schema_version: "studio-audio-v1";
  duration: number;
  bpm: number;
  beats: number[];
  confidence: number;
  onsets: number[];
  energy: {
    curve: number[];
    sample_rate_hz: number;
    start_time_s: number;
  };
  structure: EssentiaStructureAnalysis & {
    provenance?: { status: string; method: string; device: string };
  };
}

interface StudioJobEnvelope {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  result?: StudioAudioV1;
  error?: { code: string; message: string };
}

function studioJobsUrl(origin = window.location.origin) {
  return new URL("/__api/analyze/studio/jobs", origin);
}

function studioJobPollUrl(jobId: string, origin = window.location.origin) {
  return new URL(`/__api/analyze/studio/jobs/${encodeURIComponent(jobId)}`, origin);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseJob(payload: unknown): StudioJobEnvelope {
  if (!payload || typeof payload !== "object") {
    throw new Error("Hosted analysis returned an invalid job response.");
  }
  const record = payload as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const status = record.status;
  if (
    !id ||
    (status !== "queued" &&
      status !== "running" &&
      status !== "completed" &&
      status !== "failed")
  ) {
    throw new Error("Hosted analysis returned an invalid job response.");
  }
  return payload as StudioJobEnvelope;
}

function jobErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (record.error && typeof record.error === "object") {
      const error = record.error as Record<string, unknown>;
      const code = typeof error.code === "string" ? error.code : "analysis_failed";
      const message = typeof error.message === "string" ? error.message : "Analysis failed.";
      return `${code}: ${message}`;
    }
  }
  return `Hosted analysis failed with HTTP ${status}.`;
}

export async function fetchEssentiaStudioAnalysis(file: File): Promise<EssentiaRhythmAnalysis> {
  const uploadFile = prepareStudioUpload(file);
  const idempotencyKey = crypto.randomUUID();
  const formData = new FormData();
  formData.set("file", uploadFile, uploadFile.name);

  const submitResponse = await fetch(studioJobsUrl().toString(), {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: formData,
    cache: "no-store",
    signal: AbortSignal.timeout(STUDIO_SUBMIT_TIMEOUT_MS),
  });
  const submitPayload = await readJson(submitResponse);
  if (!submitResponse.ok) {
    throw new Error(jobErrorMessage(submitPayload, submitResponse.status));
  }

  const job = parseJob(submitPayload);
  const result = await pollStudioJob(job.id, (stage) => {
    if (import.meta.env.DEV) {
      console.info("[Studio] stage:", stage);
    }
  });
  return studioToRhythmAnalysis(result);
}

async function pollStudioJob(
  jobId: string,
  onStage: (stage: string) => void,
): Promise<StudioAudioV1> {
  const deadline = Date.now() + STUDIO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(studioJobPollUrl(jobId).toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(STUDIO_POLL_REQUEST_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(jobErrorMessage(payload, response.status));
    }
    const job = parseJob(payload);
    if (job.id !== jobId) throw new Error("Hosted analysis returned an unexpected job id.");
    onStage(job.stage);
    if (job.status === "failed") {
      const code = job.error?.code ?? "analysis_failed";
      const message = job.error?.message ?? "Analysis failed.";
      throw new Error(`${code}: ${message}`);
    }
    if (job.status === "completed") {
      if (job.result?.schema_version !== "studio-audio-v1") {
        throw new Error("Unsupported hosted analysis result contract.");
      }
      return job.result;
    }
    await new Promise((resolve) => setTimeout(resolve, STUDIO_POLL_INTERVAL_MS));
  }
  throw new Error(`Analysis is still running (job ${jobId}). Try again shortly.`);
}

function studioToRhythmAnalysis(studio: StudioAudioV1): EssentiaRhythmAnalysis {
  const structure = normalizeStructureAnalysis(studio.structure);
  const analysisResult = buildStudioAnalysisResult(studio);
  return {
    bpm: studio.bpm,
    beats: studio.beats,
    confidence: studio.confidence,
    duration: studio.duration,
    keyIndex: 0,
    energy: { curve: studio.energy.curve },
    onsets: studio.onsets,
    structure,
    analysisResult,
    provider: "essentia",
    verified: true,
  };
}

function buildStudioAnalysisResult(studio: StudioAudioV1): AnalysisResultV1 {
  const beats = studio.beats.map((time) => eventFromTime(time, STUDIO_SAMPLE_RATE_HZ));
  const onsets = studio.onsets.map((time) => eventFromTime(time, STUDIO_SAMPLE_RATE_HZ));
  const rhythm = {
    bpm: studio.bpm,
    confidence: studio.confidence,
    beats,
  };
  return {
    schema_version: ANALYSIS_SCHEMA_VERSION,
    analysis_version: studio.schema_version,
    input_sha256: null,
    canonical_pcm: {
      sample_rate_hz: STUDIO_SAMPLE_RATE_HZ,
      channels: 1,
      duration_s: studio.duration,
      timebase: "samples",
    },
    provenance: {
      decoder: { name: "browser-file", version: null },
      aubio: { version: null, config: null },
      essentia: { version: studio.schema_version, config: { endpoint: "studio" } },
      container_image: null,
      configuration: { endpoint: "studio" },
    },
    attempts: {
      aubio: { status: "not_attempted", version: null, config: null },
      essentia: {
        status: "succeeded",
        version: studio.schema_version,
        config: { endpoint: "studio" },
        rhythm,
        onsets,
      },
    },
    effective: {
      provider: "essentia",
      selection_reason: "low_confidence",
      verified: true,
      rhythm,
      onsets,
    },
    warnings: [],
  };
}
