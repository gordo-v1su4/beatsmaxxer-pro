import type { ArrangementSection } from '$lib/stores/arrangement';

/** Canonical song-part labels the operator can assign on the ARRANGE strip. */
export type SectionKind =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'hook'
  | 'bridge'
  | 'solo'
  | 'breakdown'
  | 'outro'
  | 'section';

export const SECTION_KIND_OPTIONS: ReadonlyArray<{ value: SectionKind; label: string }> = [
  { value: 'intro', label: 'Intro' },
  { value: 'verse', label: 'Verse' },
  { value: 'pre-chorus', label: 'Pre-chorus' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'hook', label: 'Hook' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'solo', label: 'Solo' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'outro', label: 'Outro' },
  { value: 'section', label: 'Section' },
];

export const SECTION_KIND_HUE: Record<SectionKind, string> = {
  intro: '#4fd6e8',
  verse: '#35e08a',
  'pre-chorus': '#5ce0c0',
  chorus: '#ff6bb0',
  hook: '#ff9f43',
  bridge: '#ffb454',
  solo: '#c084fc',
  breakdown: '#94a3b8',
  outro: '#9d7bff',
  section: '#7d9196',
};

const KIND_ALIASES: Record<string, SectionKind> = {
  intro: 'intro',
  verse: 'verse',
  'pre-chorus': 'pre-chorus',
  prechorus: 'pre-chorus',
  'pre chorus': 'pre-chorus',
  chorus: 'chorus',
  hook: 'hook',
  bridge: 'bridge',
  solo: 'solo',
  inst: 'solo',
  instrumental: 'solo',
  breakdown: 'breakdown',
  break: 'breakdown',
  outro: 'outro',
  section: 'section',
  full: 'section',
};

const NUMBERED_ALWAYS: ReadonlySet<SectionKind> = new Set([
  'verse',
  'pre-chorus',
  'chorus',
  'hook',
  'section',
]);

export function inferSectionKind(labelOrName: string): SectionKind {
  const raw = labelOrName.trim().toLowerCase();
  const alias = KIND_ALIASES[raw];
  if (alias) return alias;

  const token = raw.replace(/\s+\d+$/, '').replace(/[^a-z- ]/g, '');
  if (KIND_ALIASES[token]) return KIND_ALIASES[token]!;

  for (const { value } of SECTION_KIND_OPTIONS) {
    if (raw.startsWith(value)) return value;
  }
  return 'section';
}

export function hueForSectionKind(kind: SectionKind): string {
  return SECTION_KIND_HUE[kind];
}

function displayBase(kind: SectionKind): string {
  switch (kind) {
    case 'pre-chorus':
      return 'PRE-CHORUS';
    default:
      return kind.toUpperCase();
  }
}

function usesOrdinal(kind: SectionKind, occurrence: number): boolean {
  if (NUMBERED_ALWAYS.has(kind)) return true;
  return occurrence > 1;
}

/** Human-facing strip label, e.g. VERSE 2 or OUTRO. */
export function formatSectionName(kind: SectionKind, ordinal: number): string {
  const base = displayBase(kind);
  if (!usesOrdinal(kind, ordinal)) return base;
  return `${base} ${ordinal}`;
}

/** Re-number every strip after a kind or order change. */
export function renumberSectionLabels(
  sections: readonly ArrangementSection[],
): ArrangementSection[] {
  const tallies = new Map<SectionKind, number>();
  return sections.map((section) => {
    const kind = section.kind ?? inferSectionKind(section.name);
    const next = (tallies.get(kind) ?? 0) + 1;
    tallies.set(kind, next);
    return {
      ...section,
      kind,
      name: formatSectionName(kind, next),
    };
  });
}

export function sectionKindOf(section: ArrangementSection): SectionKind {
  return section.kind ?? inferSectionKind(section.name);
}
