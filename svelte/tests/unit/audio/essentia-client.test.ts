import { afterEach, describe, expect, it, vi } from "vitest";
import { planAudioUpload } from "$lib/audio/hostedAnalysisDecision";
import {
  createHostedAnalysisEndpoint,
  createHostedStudioJobEndpoint,
  fetchEssentiaRhythmAnalysis,
  isHostedAnalysisEnabled,
} from "$lib/audio/essentia";

describe("hosted analysis client boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers desktop analysis independently of the web proxy build flag", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(planAudioUpload("analyze", isHostedAnalysisEnabled())).toEqual({
      action: "load", hostedAnalysis: true,
    });
  });

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
