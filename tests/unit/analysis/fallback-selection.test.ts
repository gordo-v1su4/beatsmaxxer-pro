import { describe, expect, test } from "bun:test";
import essentiaFallback from "../../fixtures/analysis/essentia-fallback.json";
import type { AnalysisAttemptV1 } from "../../../src/analysis/contracts";
import { normalizeLegacySyncAnalysis } from "../../../src/analysis/adapters/legacySync";
import {
  DEFAULT_AUBIO_ACCEPTANCE_CONFIG,
  getAubioFallbackReason,
  validateAnalysisResultV1,
} from "../../../src/analysis/validate";

describe("analysis fallback selection", () => {
  test("selects Essentia with the reported Aubio fallback reason", () => {
    const result = normalizeLegacySyncAnalysis(essentiaFallback);

    expect(result.effective).toMatchObject({
      provider: "essentia",
      selection_reason: "low_confidence",
      verified: true,
    });
    expect(result.attempts.aubio).toMatchObject({
      status: "unverified",
      failure_code: "provider_not_reported",
    });
    expect(result.attempts.essentia?.status).toBe("succeeded");
    expect(validateAnalysisResultV1(result)).toBe(result);
  });

  test("normalizes SBic boundaries to unlabeled structural segments", () => {
    const result = normalizeLegacySyncAnalysis(essentiaFallback);

    expect(result.attempts.essentia?.structural_segments).toEqual([
      {
        start_sample_index: 0,
        end_sample_index: 1500,
        start_time_s: 0,
        end_time_s: 1.5,
      },
      {
        start_sample_index: 1500,
        end_sample_index: 4000,
        start_time_s: 1.5,
        end_time_s: 4,
      },
    ]);
  });

  test("reports low confidence only after BPM and beat checks pass", () => {
    const attempt: AnalysisAttemptV1 = {
      status: "succeeded",
      version: "0.4.9",
      config: {},
      rhythm: {
        bpm: 120,
        confidence: 0.4,
        beats: [
          { sample_index: 500, time_s: 0.5 },
          { sample_index: 1000, time_s: 1 },
        ],
      },
      onsets: [{ sample_index: 250, time_s: 0.25 }],
    };

    expect(
      getAubioFallbackReason(attempt, {
        ...DEFAULT_AUBIO_ACCEPTANCE_CONFIG,
        minimum_confidence: 0.5,
      }),
    ).toBe("low_confidence");
  });
});
