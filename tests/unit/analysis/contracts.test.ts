import { describe, expect, test } from "bun:test";
import aubioSuccess from "../../fixtures/analysis/aubio-success.json";
import {
  eventFromTime,
  eventTimeFromSample,
} from "../../../src/analysis/contracts";
import { normalizeLegacySyncAnalysis } from "../../../src/analysis/adapters/legacySync";
import { validateAnalysisResultV1 } from "../../../src/analysis/validate";

describe("analysis contract", () => {
  test("accepts a valid Aubio-primary result", () => {
    const result = normalizeLegacySyncAnalysis(aubioSuccess);

    expect(validateAnalysisResultV1(result)).toBe(result);
    expect(result.effective).toMatchObject({
      provider: "aubio",
      selection_reason: "primary_accepted",
      verified: true,
    });
    expect(result.attempts.aubio.status).toBe("succeeded");
  });

  test("derives canonical event time from the rounded sample index", () => {
    expect(eventFromTime(1.2346, 1000)).toEqual({
      sample_index: 1235,
      time_s: 1.235,
    });
    expect(eventTimeFromSample(1235, 1000)).toBe(1.235);
  });

  test("rejects non-monotonic effective timestamps", () => {
    const result = structuredClone(normalizeLegacySyncAnalysis(aubioSuccess));
    result.effective.rhythm.beats.reverse();

    expect(() => validateAnalysisResultV1(result)).toThrow("strictly ordered");
  });

  test("rejects inconsistent sample and time values", () => {
    const result = structuredClone(normalizeLegacySyncAnalysis(aubioSuccess));
    result.effective.onsets[0].time_s += 0.1;

    expect(() => validateAnalysisResultV1(result)).toThrow(
      "inconsistent sample and time values",
    );
  });
});
