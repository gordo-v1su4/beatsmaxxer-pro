import { describe, expect, it } from "vitest";
import {
  createHostedAnalysisEndpoint,
  fetchEssentiaRhythmAnalysis,
  isHostedAnalysisEnabled,
} from "$lib/audio/essentia";

describe("hosted analysis client boundary", () => {
  it("uses only same-origin analysis endpoints", () => {
    expect(createHostedAnalysisEndpoint("fast", "https://app.example").toString()).toBe(
      "https://app.example/__api/analyze/fast",
    );
    expect(createHostedAnalysisEndpoint("rhythm", "https://app.example/path").origin).toBe(
      "https://app.example",
    );
  });

  it("is disabled without explicit compile-time enablement and performs no preparation or fetch", async () => {
    expect(isHostedAnalysisEnabled()).toBe(false);
    const file = new File([new Uint8Array([1])], "private.wav", { type: "audio/wav" });
    await expect(fetchEssentiaRhythmAnalysis(file)).rejects.toThrow("Hosted analysis is disabled");
  });
});
