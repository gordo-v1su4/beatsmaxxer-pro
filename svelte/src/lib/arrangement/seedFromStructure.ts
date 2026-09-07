import type { ArrangementSection } from '$lib/stores/arrangement';
import { DEFAULT_ARRANGEMENT } from '$lib/stores/arrangement';

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
  chorus: 'chorus1',
  bridge: 'bridge',
  outro: 'outro',
  solo: 'bridge',
  inst: 'bridge',
  break: 'bridge',
  section: 'verse1',
  full: 'verse1',
};

const LABEL_HUE: Record<string, string> = {
  intro: '#4fd6e8',
  verse: '#35e08a',
  chorus: '#ff6bb0',
  bridge: '#ffb454',
  outro: '#9d7bff',
  section: '#35e08a',
  full: '#35e08a',
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

function beatIndexAtOrBefore(beats: readonly number[], time: number): number {
  if (beats.length === 0) return 0;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (beats[mid]! <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function barIndexAtTime(beats: readonly number[], time: number): number {
  return Math.floor(beatIndexAtOrBefore(beats, time) / BEATS_PER_BAR);
}

function timeAtBar(beats: readonly number[], barIndex: number): number {
  const beatIndex = Math.min(Math.max(0, barIndex) * BEATS_PER_BAR, beats.length - 1);
  return beats[beatIndex] ?? 0;
}

/**
 * Snap Essentia section edges onto the analysed bar grid so the ARRANGE strip
 * shows whole measures (e.g. intro ending on bar 5, not 4.3 bars from seconds).
 */
export function alignStructureSectionsToBarGrid(
  sections: readonly EssentiaStructureSection[],
  beats: readonly number[],
): EssentiaStructureSection[] {
  if (sections.length === 0 || beats.length < BEATS_PER_BAR * 2) return [...sections];

  const songEnd = sections.at(-1)?.end ?? beats.at(-1) ?? 0;
  const interiorBoundaries = sections.slice(1).map((section) => {
    const bar = barIndexAtTime(beats, section.start);
    return timeAtBar(beats, bar);
  });

  // Typical pop intro: ~4–5 bars. Pin when Essentia called it intro and we are close.
  if (sections[0]?.label.trim().toLowerCase() === 'intro' && interiorBoundaries.length > 0) {
    const introEndBar = barIndexAtTime(beats, sections[0].end);
    if (introEndBar >= 3 && introEndBar <= 7) {
      interiorBoundaries[0] = timeAtBar(beats, 5);
    }
  }

  const boundaries = [0, ...interiorBoundaries, songEnd];
  for (let i = 1; i < boundaries.length; i++) {
    const minGap = (beats[1] ?? 0.5) * BEATS_PER_BAR * 0.5;
    if (boundaries[i] <= boundaries[i - 1]! + minGap) {
      boundaries[i] = boundaries[i - 1]! + minGap;
    }
    if (boundaries[i] > songEnd) boundaries[i] = songEnd;
  }

  return sections.map((section, index) => {
    const start = boundaries[index] ?? 0;
    const end = boundaries[index + 1] ?? songEnd;
    return {
      ...section,
      start,
      end,
      duration: Math.max(0, end - start),
    };
  });
}

function templateForLabel(
  label: string,
  labelCounts: Map<string, number>,
): ArrangementSection {
  const key = label.trim().toLowerCase();
  const templateId = LABEL_TEMPLATE[key] ?? 'verse1';
  const template =
    DEFAULT_ARRANGEMENT.find((section) => section.id === templateId) ?? DEFAULT_ARRANGEMENT[1]!;

  const count = (labelCounts.get(key) ?? 0) + 1;
  labelCounts.set(key, count);

  return {
    ...template,
    bank: {
      top: [...template.bank.top],
      bottom: [...template.bank.bottom],
    },
    pattern: Array.from({ length: template.pattern.length }, () => null),
    hue: LABEL_HUE[key] ?? template.hue,
  };
}

function formatSectionName(label: string, index: number): string {
  const base = label.trim().toUpperCase();
  if (base === 'SECTION' || base === 'FULL') return `SECTION ${index}`;
  if (base === 'VERSE' || base === 'CHORUS') return `${base} ${index}`;
  return base;
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

  const aligned = alignStructureSectionsToBarGrid(sections, beats);
  const labelSeen = new Map<string, number>();
  return aligned.map((section, index) => {
    const key = section.label.trim().toLowerCase();
    const template = templateForLabel(section.label, labelSeen);
    const labelIndex = labelSeen.get(key) ?? 1;
    const bars = sectionSpanToBars(section.start, section.end, beats, bpm);
    const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';

    return {
      ...template,
      id: `${slug}-${index}`,
      name: formatSectionName(section.label, labelIndex),
      bars,
      timeStartS: section.start,
      timeEndS: section.end,
    };
  });
}
