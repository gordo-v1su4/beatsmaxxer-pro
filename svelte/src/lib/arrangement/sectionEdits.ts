import type { ArrangementSection } from '$lib/stores/arrangement';
import { ARRANGEMENT_STEPS } from '$lib/stores/arrangement';
import { renumberSectionLabels } from './sectionKinds';
import {
  barStartSeconds,
  secondsStep,
  wallSecondsFromTimelineDisplay,
} from './timelineScale';

/**
 * Operator edits to the SONG strip: split, merge, delete, move a boundary,
 * rename. Essentia seeds the strip; these are local overrides on top of it.
 *
 * Sections tile the song — every edit keeps them contiguous, so there is no
 * reorder: the order is the song's, fixed by the audio. Boundaries snap to the
 * analysed bar grid, and no edit can leave a section shorter than one bar.
 *
 * Everything here works in the strip's own axis (what resolveSectionBounds
 * returns, bar 1 at 0) and writes wall-clock `timeStartS`/`timeEndS` back,
 * which is what the strip reads Essentia spans from. Cuts are untouched: they
 * live at absolute song steps, not inside sections.
 */
export interface SectionEditContext {
  /** Strip-axis spans, one per section — from resolveSectionBounds. */
  bounds: readonly { startSeconds: number; endSeconds: number }[];
  beatGrid: readonly number[];
  bpm: number;
}

let editSerial = 0;

function barIndexAt(axisSeconds: number, ctx: SectionEditContext): number {
  const wall = wallSecondsFromTimelineDisplay(axisSeconds, ctx.beatGrid);
  return Math.max(0, Math.round(secondsStep(wall, ctx.beatGrid, ctx.bpm) / ARRANGEMENT_STEPS));
}

/** Nearest bar line, in strip-axis seconds. */
export function snapToBar(axisSeconds: number, ctx: SectionEditContext): number {
  return barStartSeconds(barIndexAt(axisSeconds, ctx), ctx.beatGrid, ctx.bpm);
}

/**
 * Pin every section to an explicit wall-clock span, so later edits move real
 * boundaries rather than re-deriving them from bar counts. A section's bar
 * count is recomputed from its span against the grid.
 */
function withSpans(
  sections: readonly ArrangementSection[],
  spans: readonly { startSeconds: number; endSeconds: number }[],
  ctx: SectionEditContext,
): ArrangementSection[] {
  if (spans.length !== sections.length) {
    throw new Error(`section edit: ${sections.length} sections but ${spans.length} spans`);
  }
  return sections.map((section, i) => {
    const span = spans[i]!;
    const startBar = barIndexAt(span.startSeconds, ctx);
    const endBar = barIndexAt(span.endSeconds, ctx);
    return {
      ...section,
      bars: Math.max(1, endBar - startBar),
      timeStartS: wallSecondsFromTimelineDisplay(span.startSeconds, ctx.beatGrid),
      timeEndS: wallSecondsFromTimelineDisplay(span.endSeconds, ctx.beatGrid),
    };
  });
}

function spansOf(ctx: SectionEditContext) {
  return ctx.bounds.map((b) => ({ startSeconds: b.startSeconds, endSeconds: b.endSeconds }));
}

function cloneSection(section: ArrangementSection): ArrangementSection {
  return {
    ...section,
    id: `${section.id.replace(/~\d+$/, '')}~${++editSerial}`,
    bank: { top: [...section.bank.top], bottom: [...section.bank.bottom] },
    pattern: [...section.pattern],
    scene: section.scene ? { ...section.scene, slots: { ...section.scene.slots } } : undefined,
  };
}

/**
 * Split a section at the bar nearest `axisSeconds`. The new right half copies
 * the left's part type, bank and scene. Null when the split would leave either
 * side under one bar.
 */
export function splitSection(
  sections: readonly ArrangementSection[],
  index: number,
  axisSeconds: number,
  ctx: SectionEditContext,
): ArrangementSection[] | null {
  const span = ctx.bounds[index];
  if (!span) return null;
  const at = snapToBar(axisSeconds, ctx);
  const startBar = barIndexAt(span.startSeconds, ctx);
  const endBar = barIndexAt(span.endSeconds, ctx);
  const atBar = barIndexAt(at, ctx);
  if (atBar <= startBar || atBar >= endBar) return null;

  const spans = spansOf(ctx);
  spans.splice(index, 1, { startSeconds: span.startSeconds, endSeconds: at }, { startSeconds: at, endSeconds: span.endSeconds });
  const next = [...sections];
  const right = cloneSection(sections[index]!);
  // A custom name belongs to the span it was given to, not to both halves.
  delete right.customName;
  next.splice(index + 1, 0, right);
  return renumberSectionLabels(withSpans(next, spans, ctx));
}

/** Fold section `index + 1` into section `index`; the left keeps its identity. */
export function mergeWithNext(
  sections: readonly ArrangementSection[],
  index: number,
  ctx: SectionEditContext,
): ArrangementSection[] | null {
  if (index < 0 || index >= sections.length - 1) return null;
  const spans = spansOf(ctx);
  spans.splice(index, 2, { startSeconds: spans[index]!.startSeconds, endSeconds: spans[index + 1]!.endSeconds });
  const next = [...sections];
  next.splice(index + 1, 1);
  return renumberSectionLabels(withSpans(next, spans, ctx));
}

/** Remove a section; its span goes to the previous one (the next, for the first). */
export function deleteSection(
  sections: readonly ArrangementSection[],
  index: number,
  ctx: SectionEditContext,
): ArrangementSection[] | null {
  if (sections.length <= 1 || index < 0 || index >= sections.length) return null;
  const spans = spansOf(ctx);
  const next = [...sections];
  if (index === 0) {
    spans.splice(0, 2, { startSeconds: spans[0]!.startSeconds, endSeconds: spans[1]!.endSeconds });
    next.splice(0, 1);
  } else {
    spans.splice(index - 1, 2, { startSeconds: spans[index - 1]!.startSeconds, endSeconds: spans[index]!.endSeconds });
    next.splice(index, 1);
  }
  return renumberSectionLabels(withSpans(next, spans, ctx));
}

/**
 * Move the boundary at the start of section `index` (between `index - 1` and
 * `index`) to the bar nearest `axisSeconds`, keeping both sides at least one
 * bar long.
 */
export function moveBoundary(
  sections: readonly ArrangementSection[],
  index: number,
  axisSeconds: number,
  ctx: SectionEditContext,
): ArrangementSection[] | null {
  if (index <= 0 || index >= sections.length) return null;
  const left = ctx.bounds[index - 1]!;
  const right = ctx.bounds[index]!;
  const minBar = barIndexAt(left.startSeconds, ctx) + 1;
  const maxBar = barIndexAt(right.endSeconds, ctx) - 1;
  if (maxBar < minBar) return null;
  const bar = Math.min(maxBar, Math.max(minBar, barIndexAt(axisSeconds, ctx)));
  const at = barStartSeconds(bar, ctx.beatGrid, ctx.bpm);
  if (Math.abs(at - right.startSeconds) < 1e-6) return null;

  const spans = spansOf(ctx);
  spans[index - 1] = { startSeconds: left.startSeconds, endSeconds: at };
  spans[index] = { startSeconds: at, endSeconds: right.endSeconds };
  return withSpans(sections, spans, ctx);
}

/** Give a section its own label (e.g. DANCE BREAK); empty restores the generated one. */
export function renameSection(
  sections: readonly ArrangementSection[],
  index: number,
  name: string,
): ArrangementSection[] {
  const label = name.trim().toUpperCase().slice(0, 24);
  const next = sections.map((section, i) => {
    if (i !== index) return section;
    const { customName: _drop, ...rest } = section;
    return label ? { ...rest, customName: label } : rest;
  });
  return renumberSectionLabels(next);
}
