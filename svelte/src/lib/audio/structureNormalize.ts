export interface EssentiaStructureSection {
  start: number;
  end: number;
  label: string;
  duration: number;
  energy: number;
}

export interface EssentiaStructureAnalysis {
  sections: EssentiaStructureSection[];
  boundaries: number[];
  source?: string;
  analyzedDurationS?: number;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeStructureAnalysis(payload: unknown): EssentiaStructureAnalysis {
  if (!payload || typeof payload !== "object") {
    throw new Error("Structure analysis returned an invalid payload.");
  }
  const record = payload as Record<string, unknown>;
  const nested = record.structure && typeof record.structure === "object"
    ? record.structure as Record<string, unknown>
    : record;
  const rawSections = Array.isArray(nested.sections) ? nested.sections : [];
  const sections: EssentiaStructureSection[] = rawSections.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const section = entry as Record<string, unknown>;
    const start = finiteNumber(section.start);
    const end = finiteNumber(section.end);
    if (start === null || end === null || end <= start) return [];
    if (end - start < 0.05) return [];
    const duration = finiteNumber(section.duration) ?? end - start;
    const energy = finiteNumber(section.energy) ?? 0;
    const label = typeof section.label === "string" ? section.label : "section";
    return [{ start, end, label, duration, energy }];
  });
  if (sections.length === 0) {
    throw new Error("Structure analysis did not return any sections.");
  }
  const boundaries = Array.isArray(nested.boundaries)
    ? nested.boundaries
        .map((value) => finiteNumber(value))
        .filter((value): value is number => value !== null)
    : [sections[0]!.start, ...sections.map((section) => section.end)];
  const source = typeof nested.source === "string" ? nested.source : undefined;
  if (source === "fallback") {
    throw new Error("Structure analysis returned heuristic fallback sections.");
  }
  const analyzedDurationS =
    finiteNumber(nested.analyzed_duration_s) ??
    finiteNumber(nested.analyzedDurationS) ??
    (sections.length > 0 ? sections.at(-1)!.end : null);
  return {
    sections,
    boundaries,
    source,
    analyzedDurationS: analyzedDurationS ?? undefined,
  };
}
