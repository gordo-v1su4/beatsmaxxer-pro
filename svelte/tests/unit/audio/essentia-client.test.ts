import { describe, expect, it } from "vitest";
import {
  createHostedAnalysisEndpoint,
  createHostedStudioJobEndpoint,
  fetchEssentiaRhythmAnalysis,
  isHostedAnalysisEnabled,
} from "$lib/audio/essentia";

describe("hosted analysis client boundary", () => {
  it("uses only same-origin analysis endpoints", () => {
    expect(createHostedAnalysisEndpoint("rhythm", "https://app.example").toString()).toBe(
      "https://app.example/__api/analyze/rhythm",
    );
    expect(createHostedAnalysisEndpoint("studio/jobs", "https://app.example").toString()).toBe(
      "https://app.example/__api/analyze/studio/jobs",
    );
    expect(createHostedStudioJobEndpoint("job-1", "https://app.example").toString()).toBe(
      "https://app.example/__api/analyze/studio/jobs/job-1",
    );
  });

  it("is disabled without explicit compile-time enablement and performs no preparation or fetch", async () => {
    expect(isHostedAnalysisEnabled()).toBe(false);
    const file = new File([new Uint8Array([1])], "private.mp3", { type: "audio/mpeg" });
    await expect(fetchEssentiaRhythmAnalysis(file)).rejects.toThrow("Hosted analysis is disabled");
  });
});
