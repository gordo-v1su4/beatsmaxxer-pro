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
}

declare const __APP_ESSENTIA_API_BASE_URL__: string;
declare const __APP_ESSENTIA_ANALYSIS_ENGINE__: string;

const DEFAULT_ESSENTIA_API_BASE_URL = "https://essentia.v1su4.dev";

export async function fetchEssentiaRhythmAnalysis(file: File): Promise<EssentiaRhythmAnalysis> {
  const formData = new FormData();
  formData.set("file", file, file.name);

  return requestHostedAnalysis(formData);
}

export async function fetchRhythmAnalysisFromUrl(analysisUrl: string): Promise<EssentiaRhythmAnalysis> {
  const response = await fetch(analysisUrl);
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status, response.statusText));
  }

  return normalizeRhythmAnalysis(payload);
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

async function requestHostedAnalysis(formData: FormData) {
  const response = await postHostedAnalysis("fast", formData);
  const payload = await readResponsePayload(response);

  if (response.ok) {
    return normalizeRhythmAnalysis(payload);
  }

  const shouldRetryWithRhythm =
    response.status === 404 ||
    response.status === 405 ||
    response.status === 422 ||
    response.status === 500;

  if (!shouldRetryWithRhythm) {
    throw new Error(extractErrorMessage(payload, response.status, response.statusText));
  }

  const fallbackResponse = await postHostedAnalysis("rhythm", formData);
  const fallbackPayload = await readResponsePayload(fallbackResponse);
  if (!fallbackResponse.ok) {
    throw new Error(
      extractErrorMessage(fallbackPayload, fallbackResponse.status, fallbackResponse.statusText)
    );
  }

  return normalizeRhythmAnalysis(fallbackPayload);
}

function postHostedAnalysis(endpointName: "fast" | "rhythm", formData: FormData) {
  const endpoint = import.meta.env.DEV
    ? new URL(`/__api/analyze/${endpointName}`, window.location.origin)
    : new URL(`${resolveEssentiaApiBaseUrl()}/analyze/${endpointName}`);
  const engine = resolveEssentiaAnalysisEngine();
  if (engine) endpoint.searchParams.set("engine", engine);

  return fetch(endpoint.toString(), {
    method: "POST",
    body: formData,
  });
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

function extractErrorMessage(payload: unknown, status: number, statusText: string) {
  if (typeof payload === "string" && payload.trim()) return payload;

  if (payload && typeof payload === "object") {
    const detail =
      getStringValue(payload, "detail") ??
      getStringValue(payload, "error") ??
      getStringValue(payload, "message");
    if (detail) return detail;
  }

  return statusText.trim() || `Essentia analysis failed with ${status}`;
}

export function normalizeRhythmAnalysis(payload: unknown): EssentiaRhythmAnalysis {
  if (!payload || typeof payload !== "object") {
    throw new Error("Essentia returned an invalid rhythm payload.");
  }

  const bpm = toFiniteNumber((payload as Record<string, unknown>).bpm);
  const confidence = toFiniteNumber((payload as Record<string, unknown>).confidence);
  const duration = toFiniteNumber((payload as Record<string, unknown>).duration);
  const beats = toNumberArray((payload as Record<string, unknown>).beats);
  const onsets = toNumberArray((payload as Record<string, unknown>).onsets);
  const rawEnergy = (payload as Record<string, unknown>).energy;
  const energyCurve =
    rawEnergy && typeof rawEnergy === "object"
      ? toNumberArray((rawEnergy as Record<string, unknown>).curve)
      : [];
  const structure = normalizeStructure((payload as Record<string, unknown>).structure);

  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("Essentia did not return a usable BPM.");
  }

  return {
    bpm,
    beats,
    confidence,
    duration,
    energy: { curve: energyCurve },
    onsets,
    structure,
  };
}

function toFiniteNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry));
}

function getStringValue(value: object, key: string) {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function normalizeStructure(value: unknown): EssentiaRhythmAnalysis["structure"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const boundaries = toNumberArray(record.boundaries);
  const sections = Array.isArray(record.sections)
    ? record.sections
        .map((section) => {
          if (!section || typeof section !== "object") return null;
          const entry = section as Record<string, unknown>;
          const start = toFiniteNumber(entry.start);
          const end = toFiniteNumber(entry.end);
          const duration = toFiniteNumber(entry.duration);
          const energy = toFiniteNumber(entry.energy);
          const label = getStringValue(entry, "label") ?? "section";

          if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

          return {
            start,
            end,
            label,
            duration: Number.isFinite(duration) ? duration : Math.max(0, end - start),
            energy: Number.isFinite(energy) ? energy : 0,
          };
        })
        .filter((section): section is NonNullable<typeof section> => section !== null)
    : [];

  if (sections.length === 0 && boundaries.length === 0) return undefined;

  return { sections, boundaries };
}
