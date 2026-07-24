import { describe, expect, test } from "bun:test";
import aubioSuccess from "../../fixtures/analysis/aubio-success.json";
import essentiaFallback from "../../fixtures/analysis/essentia-fallback.json";
import legacyProviderless from "../../fixtures/analysis/legacy-providerless.json";
import {
  fetchLegacySyncAnalysis,
  LegacyAnalysisHttpError,
  normalizeLegacySyncResponse,
} from "../../../src/analysis/adapters/legacySync";

const endpointFor = (endpoint: "fast" | "rhythm") =>
  new URL(`https://analysis.invalid/analyze/${endpoint}`);

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("legacy synchronous analysis adapter", () => {
  test("uploads the file as multipart field file", async () => {
    let requestBody: FormData | undefined;
    const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = init?.body as FormData;
      return jsonResponse(aubioSuccess);
    }) as typeof globalThis.fetch;
    const file = new File(["audio"], "fixture.wav", { type: "audio/wav" });

    await fetchLegacySyncAnalysis(file, { endpointFor, fetch });

    expect(requestBody?.get("file")).toBeInstanceOf(File);
    expect((requestBody?.get("file") as File).name).toBe("fixture.wav");
  });

  test("does not attach credential headers or query parameters", async () => {
    let requestUrl = "";
    let requestHeaders: HeadersInit | undefined;
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestHeaders = init?.headers;
      return jsonResponse(aubioSuccess);
    }) as typeof globalThis.fetch;

    await fetchLegacySyncAnalysis(new File(["audio"], "fixture.wav"), {
      endpointFor,
      engineHint: "aubio",
      fetch,
    });

    expect(new URL(requestUrl).searchParams.toString()).toBe("engine=aubio");
    expect(requestHeaders).toBeUndefined();
  });

  test("does not treat the client engine hint as provider provenance", async () => {
    const fetch = (async () => jsonResponse(legacyProviderless)) as typeof globalThis.fetch;

    const result = await fetchLegacySyncAnalysis(new File(["audio"], "fixture.wav"), {
      endpointFor,
      engineHint: "aubio",
      fetch,
    });

    expect(result.effective).toMatchObject({
      provider: "unknown",
      selection_reason: "legacy_unverified",
      verified: false,
    });
  });

  test("uses the rhythm compatibility endpoint after a selected fast failure", async () => {
    const requestedPaths: string[] = [];
    const fetch = (async (input: RequestInfo | URL) => {
      requestedPaths.push(new URL(String(input)).pathname);
      return requestedPaths.length === 1
        ? jsonResponse({ detail: "unsupported fast analysis" }, { status: 422 })
        : jsonResponse(essentiaFallback);
    }) as typeof globalThis.fetch;

    const result = await fetchLegacySyncAnalysis(new File(["audio"], "fixture.wav"), {
      endpointFor,
      fetch,
    });

    expect(requestedPaths).toEqual(["/analyze/fast", "/analyze/rhythm"]);
    expect(result.effective.provider).toBe("essentia");
  });

  test("maps an oversized upload to the safe upload_too_large error", async () => {
    const response = jsonResponse(
      { detail: "Upload exceeds configured limit" },
      { status: 413, statusText: "Payload Too Large" },
    );

    try {
      await normalizeLegacySyncResponse(response);
      throw new Error("expected adapter error");
    } catch (error) {
      expect(error).toBeInstanceOf(LegacyAnalysisHttpError);
      expect(error).toMatchObject({
        status: 413,
        code: "upload_too_large",
        message: "Upload exceeds configured limit",
      });
    }
  });

  test("preserves a declared safe unsupported-media error code", async () => {
    const response = jsonResponse(
      {
        detail: "Unsupported audio container",
        error_code: "unsupported_media",
      },
      { status: 415, statusText: "Unsupported Media Type" },
    );

    await expect(normalizeLegacySyncResponse(response)).rejects.toMatchObject({
      status: 415,
      code: "unsupported_media",
      message: "Unsupported audio container",
    });
  });

  test("rejects malformed successful media responses", async () => {
    const response = jsonResponse({ bpm: "not-a-number", beats: [], onsets: [] });

    await expect(normalizeLegacySyncResponse(response)).rejects.toThrow(
      "did not return a usable BPM",
    );
  });
});
