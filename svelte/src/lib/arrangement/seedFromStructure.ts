import type { ArrangementSection } from '$lib/stores/arrangement';
import { DEFAULT_ARRANGEMENT } from '$lib/stores/arrangement';
import {
  formatSectionName,
  hueForSectionKind,
  inferSectionKind,
  renumberSectionLabels,
} from '$lib/arrangement/sectionKinds';

export interface EssentiaStructureSection {
  start: number;
  end: number;
  label: string;
  duration: number;
  energy: number;
}

const BEATS_PER_BAR = 4;

const LABEL_TEMPLATE: Record<string, string> = {
  intro: 'intro',
  verse: 'verse1',
  'pre-chorus': 'verse1',
  prechorus: 'verse1',
  chorus: 'chorus1',
  hook: 'chorus1',
  bridge: 'bridge',
  outro: 'outro',
  solo: 'bridge',
  inst: 'bridge',
  break: 'bridge',
  breakdown: 'bridge',
  section: 'verse1',
  full: 'verse1',
};

function medianBeatInterval(beats: readonly number[]): number | null {
  if (beats.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const delta = beats[i]! - beats[i - 1]!;
    if (delta > 0) intervals.push(delta);
  }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)] ?? null;
}

/** Convert a wall-clock section span into whole bars using the analysed beat grid. */
export function sectionSpanToBars(
  start: number,
  end: number,
  beats: readonly number[],
  bpm: number,
): number {
  const duration = Math.max(0, end - start);
  if (duration <= 0) return 1;

  const beatInterval = medianBeatInterval(beats) ?? (bpm > 0 ? 60 / bpm : 0.5);
  const beatsInSection = duration / beatInterval;
  return Math.max(1, Math.round(beatsInSection / BEATS_PER_BAR));
}

function templateForLabel(label: string): ArrangementSection {
  const key = label.trim().toLowerCase();
  const templateId = LABEL_TEMPLATE[key] ?? 'verse1';
  const template =
    DEFAULT_ARRANGEMENT.find((section) => section.id === templateId) ?? DEFAULT_ARRANGEMENT[1]!;

  return {
    ...template,
    bank: {
      top: [...template.bank.top],
      bottom: [...template.bank.bottom],
    },
    pattern: Array.from({ length: template.pattern.length }, () => null),
  };
}

/**
 * Map Essentia structure sections onto arrangement strips (bar lengths + label styling).
 * Banks are cloned from the default template for each label type; cut patterns start empty.
 */
export function arrangementFromStructureSections(
  sections: readonly EssentiaStructureSection[],
  beats: readonly number[],
  bpm: number,
): ArrangementSection[] {
  if (sections.length === 0) return [];

  // Analysis timestamps are song-relative facts. Bar counts describe the strip;
  // they must not move the intro, verses, or other detected boundaries.
  const seeded = sections.map((section, index) => {
    const kind = inferSectionKind(section.label);
    const template = templateForLabel(section.label);
    const bars = sectionSpanToBars(section.start, section.end, beats, bpm);
    const slug = kind.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';

    return {
      ...template,
      id: `${slug}-${index}`,
      kind,
      name: formatSectionName(kind, 1),
      hue: hueForSectionKind(kind),
      bars,
      timeStartS: section.start,
      timeEndS: section.end,
    };
  });

  return renumberSectionLabels(seeded);
}
