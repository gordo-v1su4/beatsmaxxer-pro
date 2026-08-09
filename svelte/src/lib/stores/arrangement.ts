import { derived, get, writable } from 'svelte/store';
import { MAX_RACK_SLOTS_PER_ROW, assignModuleToSlot, rackBottom, rackTop } from '$lib/stores/rack';

/**
 * A song section — the verse/chorus layer above the 16-step grid.
 *
 * The step grid alone is one bar on a loop, which is a groove, not an
 * arrangement: there is no way to say "the chorus cuts harder than the verse".
 * A section owns both halves of that answer — how long it runs, and which ten
 * effects the rack is holding while it runs.
 */
export interface ArrangementSection {
  id: string;
  name: string;
  /** Length in bars. Drives both the arrangement strip's width and the advance. */
  bars: number;
  /** Section accent, used for the strip and the active-section readouts. */
  hue: string;
  /**
   * The rack this section plays through. Split by row because the catalog gives
   * every module a row affinity — assignModuleToSlot rejects a bottom-row module
   * offered to the top row, so a flat list of ten would silently half-apply.
   */
  bank: { top: string[]; bottom: string[] };
  /**
   * 16 sixteenth-notes. Each entry is a rack slot index 0-9 (top 0-4 then
   * bottom 5-9) to cut to, or null to hold whatever is on PGM.
   *
   * Slot index rather than module id: a section swaps the rack's contents when
   * it starts, so "cut to slot 3" survives the bank change and "cut to PUNCH"
   * would not — the pattern would break exactly when the bank made it interesting.
   */
  pattern: (number | null)[];
}

/** Total rack slots across both rows — the range a pattern step can address. */
export const ARRANGEMENT_SLOT_COUNT = MAX_RACK_SLOTS_PER_ROW * 2;
export const ARRANGEMENT_STEPS = 16;

/** Sparse literal to a full 16-step pattern, so the defaults stay readable. */
function steps(marks: Record<number, number>): (number | null)[] {
  return Array.from({ length: ARRANGEMENT_STEPS }, (_, i) => (i in marks ? marks[i] : null));
}

// Only six modules can occupy the top row (transition, speedramp, tapdelay,
// timesampler, streak, leak), so sections differentiate mostly through the
// bottom row, where thirteen are eligible. Top rows vary by swapping LEAK for a
// beat module rather than by wholesale replacement.
export const DEFAULT_ARRANGEMENT: ArrangementSection[] = [
  {
    id: 'intro',
    name: 'INTRO',
    bars: 8,
    hue: '#4fd6e8',
    bank: {
      top: ['transition', 'speedramp', 'leak', 'timesampler', 'streak'],
      bottom: ['orbit', 'focus', 'halation', 'anamorphic', 'grain']
    },
    pattern: steps({ 0: 0, 8: 2 })
  },
  {
    id: 'verse1',
    name: 'VERSE 1',
    bars: 16,
    hue: '#35e08a',
    bank: {
      top: ['transition', 'speedramp', 'tapdelay', 'timesampler', 'streak'],
      bottom: ['punch', 'shake', 'prism', 'focus', 'mirror']
    },
    pattern: steps({ 0: 0, 4: 5, 8: 1, 12: 6 })
  },
  {
    id: 'chorus1',
    name: 'CHORUS 1',
    bars: 16,
    hue: '#ff6bb0',
    bank: {
      top: ['transition', 'timesampler', 'streak', 'speedramp', 'tapdelay'],
      bottom: ['punch', 'lens', 'mirror', 'prism', 'bulge']
    },
    pattern: steps({ 0: 0, 2: 1, 4: 3, 6: 2, 8: 0, 10: 4, 12: 9, 13: 5, 14: 1, 15: 3 })
  },
  {
    id: 'verse2',
    name: 'VERSE 2',
    bars: 16,
    hue: '#35e08a',
    bank: {
      top: ['transition', 'speedramp', 'tapdelay', 'timesampler', 'streak'],
      bottom: ['punch', 'shake', 'orbit', 'prism', 'grain']
    },
    pattern: steps({ 0: 2, 4: 6, 8: 1, 12: 8 })
  },
  {
    id: 'bridge',
    name: 'BRIDGE',
    bars: 8,
    hue: '#ffb454',
    bank: {
      top: ['speedramp', 'leak', 'transition', 'timesampler', 'tapdelay'],
      bottom: ['focus', 'orbit', 'dutch', 'halation', 'vhs']
    },
    pattern: steps({ 0: 8, 6: 2, 12: 3 })
  },
  {
    id: 'chorus2',
    name: 'CHORUS 2',
    bars: 16,
    hue: '#ff6bb0',
    bank: {
      top: ['transition', 'timesampler', 'streak', 'tapdelay', 'speedramp'],
      bottom: ['punch', 'lens', 'mirror', 'vhs', 'shake']
    },
    pattern: steps({ 0: 0, 1: 5, 3: 2, 4: 3, 6: 9, 8: 0, 9: 1, 11: 4, 12: 6, 14: 2, 15: 7 })
  },
  {
    id: 'outro',
    name: 'OUTRO',
    bars: 8,
    hue: '#9d7bff',
    bank: {
      top: ['leak', 'speedramp', 'transition', 'streak', 'timesampler'],
      bottom: ['focus', 'halation', 'anamorphic', 'grain', 'orbit']
    },
    pattern: steps({ 0: 1, 8: 0 })
  }
];

export const arrangement = writable<ArrangementSection[]>(
  DEFAULT_ARRANGEMENT.map((s) => ({ ...s, pattern: [...s.pattern] }))
);

/**
 * A cut placed in the song, not in a repeating bar.
 *
 * `step` is an absolute sixteenth from the top of the arrangement, so bar 34
 * beat 3 is a different cut from bar 2 beat 3 and can be edited on its own. The
 * pattern model could not express that: a section held one bar and replayed it
 * for all sixteen of its bars, so the only thing you could say about bar 34 was
 * whatever you had already said about every other bar in the chorus.
 */
export interface Cut {
  step: number;
  /** Rack slot 0-9. */
  slotIndex: number;
}

/** Bar index each section starts on, and the arrangement's length in steps. */
export const sectionStarts = derived(arrangement, (sections) => {
  const starts: number[] = [];
  let bar = 0;
  for (const section of sections) {
    starts.push(bar);
    bar += section.bars;
  }
  return starts;
});

export const arrangementTotalSteps = derived(
  arrangement,
  (sections) => sections.reduce((total, s) => total + s.bars, 0) * ARRANGEMENT_STEPS
);

/**
 * Unroll the section patterns across the whole song.
 *
 * This is what the pattern model was already doing on playback — a 16-bar verse
 * fired its four marks sixteen times over — it just had no way to show it. The
 * timeline starts from the same cuts you were already hearing rather than from
 * an empty grid, so nothing changes underfoot on the first load; the difference
 * is that every one of them is now an object you can move or delete.
 */
function unrollDefaultCuts(sections: ArrangementSection[]): Cut[] {
  const cuts: Cut[] = [];
  let bar = 0;
  for (const section of sections) {
    for (let b = 0; b < section.bars; b++) {
      section.pattern.forEach((slotIndex, step) => {
        if (slotIndex == null) return;
        cuts.push({ step: (bar + b) * ARRANGEMENT_STEPS + step, slotIndex });
      });
    }
    bar += section.bars;
  }
  return cuts;
}

export const cuts = writable<Cut[]>(unrollDefaultCuts(DEFAULT_ARRANGEMENT));

/** Slot to cut to at an absolute step, or null to hold. */
export function cutAtStep(list: readonly Cut[], step: number): number | null {
  for (const cut of list) if (cut.step === step) return cut.slotIndex;
  return null;
}

/** Place or remove a cut. A step holds at most one slot — PGM is one output. */
export function toggleCut(step: number, slotIndex: number) {
  cuts.update((list) => {
    const existing = list.find((c) => c.step === step);
    if (existing?.slotIndex === slotIndex) return list.filter((c) => c !== existing);
    return [...list.filter((c) => c.step !== step), { step, slotIndex }].sort(
      (a, b) => a.step - b.step
    );
  });
}

/** Drop every cut inside a bar range — the timeline's erase gesture. */
export function clearCutsBetween(startStep: number, endStep: number) {
  cuts.update((list) => list.filter((c) => c.step < startStep || c.step >= endStep));
}

/** Index into `arrangement` of the section currently playing. */
export const activeSectionIndex = writable(0);

/** Bars elapsed inside the active section — drives the strip's progress fill. */
export const barInSection = writable(0);

/**
 * Whether entering a section rebuilds the rack from its bank.
 *
 * Off by default. On, this rewrites all ten slots the moment a section starts,
 * which silently discards whatever rack the operator had built — and because
 * the swap only changes which module sits where, it does not read as an action
 * at all. It reads as the colours and titles having shifted for no reason.
 * Recalling a bank is worth having, but it has to be asked for.
 */
export const autoBank = writable(false);

/** Which rack slot a click paints into the grid. */
export const paintSlotIndex = writable(0);

export const activeSection = derived(
  [arrangement, activeSectionIndex],
  ([sections, index]) => sections[index] ?? sections[0]
);

export const arrangementTotalBars = derived(arrangement, (sections) =>
  sections.reduce((total, section) => total + section.bars, 0)
);

/** Rack slot index 0-9 to its module id, or null when that slot is empty. */
export function moduleForSlotIndex(top: string[], bottom: string[], slotIndex: number) {
  if (slotIndex < MAX_RACK_SLOTS_PER_ROW) return top[slotIndex] ?? null;
  return bottom[slotIndex - MAX_RACK_SLOTS_PER_ROW] ?? null;
}

/**
 * Rebuild the rack from a section's bank.
 *
 * Assignments go through assignModuleToSlot so row affinity and duplicate rules
 * stay enforced in one place; a rejected entry leaves that slot alone rather
 * than emptying it, so a bad bank degrades to a partial swap instead of a hole.
 */
export function applySectionBank(section: ArrangementSection) {
  section.bank.top.slice(0, MAX_RACK_SLOTS_PER_ROW).forEach((moduleId, index) => {
    assignModuleToSlot('top', index, moduleId);
  });
  section.bank.bottom.slice(0, MAX_RACK_SLOTS_PER_ROW).forEach((moduleId, index) => {
    assignModuleToSlot('bottom', index, moduleId);
  });
}

/** Jump to a section, recalling its bank when auto-bank is on. */
export function selectSection(index: number) {
  const sections = get(arrangement);
  if (index < 0 || index >= sections.length) return;
  activeSectionIndex.set(index);
  barInSection.set(0);
  if (get(autoBank)) applySectionBank(sections[index]);
}

/** Paint or clear one step of the active section. */
export function toggleArrangementStep(step: number, slotIndex: number) {
  const index = get(activeSectionIndex);
  arrangement.update((sections) =>
    sections.map((section, i) => {
      if (i !== index) return section;
      const pattern = [...section.pattern];
      pattern[step] = pattern[step] === slotIndex ? null : slotIndex;
      return { ...section, pattern };
    })
  );
}

export function clearActiveSectionPattern() {
  const index = get(activeSectionIndex);
  arrangement.update((sections) =>
    sections.map((section, i) =>
      i === index
        ? { ...section, pattern: Array.from({ length: ARRANGEMENT_STEPS }, () => null) }
        : section
    )
  );
}

/** Reset to the top of the arrangement — used when the transport restarts. */
export function rewindArrangement() {
  activeSectionIndex.set(0);
  barInSection.set(0);
  if (get(autoBank)) applySectionBank(get(arrangement)[0]);
}

/** The module a pattern step points at, resolved against the live rack. */
export function moduleForStep(step: number): string | null {
  const section = get(activeSection);
  const slotIndex = section?.pattern[step];
  if (slotIndex == null) return null;
  return moduleForSlotIndex(get(rackTop), get(rackBottom), slotIndex);
}
