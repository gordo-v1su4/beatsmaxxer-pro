import { describe, expect, test } from "bun:test";
import legacyProviderless from "../../fixtures/analysis/legacy-providerless.json";
import { normalizeLegacySyncAnalysis } from "../../../src/analysis/adapters/legacySync";
import {
  isProductionProvenanceVerified,
  validateAnalysisResultV1,
} from "../../../src/analysis/validate";

describe("legacy analysis provenance", () => {
  test("marks provider-less responses unknown and unverified", () => {
    const result = normalizeLegacySyncAnalysis(legacyProviderless);

    expect(result.effective).toMatchObject({
      provider: "unknown",
      selection_reason: "legacy_unverified",
      verified: false,
    });
    expect(result.effective.provider).not.toBe("aubio");
    expect(isProductionProvenanceVerified(result)).toBe(false);
  });

  test("normalizes unordered duplicate timestamps into monotonic sample events", () => {
    const result = normalizeLegacySyncAnalysis(legacyProviderless);

    expect(result.effective.rhythm.beats).toEqual([
      { sample_index: 500, time_s: 0.5 },
      { sample_index: 1000, time_s: 1 },
      { sample_index: 2000, time_s: 2 },
    ]);
    expect(validateAnalysisResultV1(result)).toBe(result);
  });

  test("records explicit legacy-sync provenance warnings", () => {
    const result = normalizeLegacySyncAnalysis(legacyProviderless);

    expect(result.analysis_version).toBe("legacy-sync");
    expect(result.warnings).toContain("legacy-sync");
    expect(result.warnings).toContain(
      "provider provenance is incomplete; result is unverified",
    );
  });

  test("does not verify self-reported Aubio results that fail the acceptance predicate", () => {
    const result = normalizeLegacySyncAnalysis({
      provider: "aubio",
      provider_version: "0.4.9",
      provider_config: { method: "default" },
      bpm: 400,
      confidence: 1,
      duration: 1,
      sample_rate: 1000,
      beats: [0.5],
      onsets: [],
    });

    expect(result.effective).toMatchObject({
      provider: "unknown",
      selection_reason: "legacy_unverified",
      verified: false,
    });
  });
});
