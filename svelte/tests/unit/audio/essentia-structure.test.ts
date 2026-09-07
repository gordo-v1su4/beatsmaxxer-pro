import { describe, expect, it } from "vitest";
import { normalizeStructureAnalysis } from "$lib/audio/structureNormalize";

describe("normalizeStructureAnalysis", () => {
  it("parses top-level structure sections with labels", () => {
    const result = normalizeStructureAnalysis({
      sections: [
        { start: 0, end: 12, label: "intro", duration: 12, energy: 0.1 },
        { start: 12, end: 44, label: "verse", duration: 32, energy: 0.2 },
      ],
      boundaries: [0, 12, 44],
    });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.label).toBe("intro");
    expect(result.boundaries).toEqual([0, 12, 44]);
  });

  it("accepts nested structure payloads from /analyze/fast", () => {
    const result = normalizeStructureAnalysis({
      structure: {
        sections: [{ start: 0, end: 8, label: "chorus", duration: 8, energy: 0.5 }],
        boundaries: [0, 8],
      },
    });
    expect(result.sections[0]?.label).toBe("chorus");
  });

  it("rejects heuristic fallback payloads", () => {
    expect(() =>
      normalizeStructureAnalysis({
        source: "fallback",
        sections: [{ start: 0, end: 8, label: "intro", duration: 8, energy: 0.1 }],
        boundaries: [0, 8],
      }),
    ).toThrow(/fallback/i);
  });
});
