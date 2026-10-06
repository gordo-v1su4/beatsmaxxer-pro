import type { ModuleType } from '$lib/engine/contracts';
import { writable } from 'svelte/store';

/** 0 straight · 1 swing · 2 dotted — matches LiveScheduleRuntime */
export type PgmFeel = 0 | 1 | 2;

export const PGM_INTERVALS = [
  { label: '1BT', beats: 1 },
  { label: '2BT', beats: 2 },
  { label: '1BR', beats: 4 },
  { label: '2BR', beats: 8 },
  { label: '4BR', beats: 16 },
  { label: '8BR', beats: 32 }
] as const;

export const pgmSource = writable<ModuleType>('transition');
export const queuedPgmSource = writable<ModuleType | null>(null);
/**
 * Launch quantize for hand cuts, in beats: a queued source lands on the next
 * bar line (Ableton's global launch quantize, 1 Bar) regardless of the
 * RAND/LINEAR cadence in intervalBeats.
 */
export const PGM_LAUNCH_QUANTIZE_BEATS = 4;
/** Beat the queued source will land on, or null when nothing is queued. */
export const queuedCutBeat = writable<number | null>(null);
/**
 * Bumped each time the performer picks a PGM source by hand (rail, viewport,
 * digit keys). The arrangement reads this — not PGM changing — to know a cut
 * was the performer's: dropping an effect into a slot, the mobile shell and
 * the sequencer all move PGM too.
 */
export const manualCutRequests = writable(0);
export function markManualCut() {
  manualCutRequests.update((n) => n + 1);
}
export const intervalBeats = writable(4);
export const feel = writable<PgmFeel>(0);
export const autoRandom = writable(false);
export const linearOrder = writable(false);
export type ClipOrder = 'hold' | 'linear' | 'random';
export function setClipOrder(order: ClipOrder) {
  linearOrder.set(order === 'linear');
  autoRandom.set(order === 'random');
}

export function formatQuantizeLabel(beats: number, f: PgmFeel): string {
  const base = PGM_INTERVALS.find((o) => o.beats === beats)?.label ?? `${beats}BT`;
  if (f === 1) return `${base} SW`;
  if (f === 2) return `${base} DOT`;
  return base;
}

export function selectPgmSource(id: ModuleType) {
  queuedPgmSource.set(id);
}

export function clearPgmQueue() {
  queuedPgmSource.set(null);
}

export function commitPgmCut(id: ModuleType) {
  pgmSource.set(id);
  queuedPgmSource.set(null);
}

export function cutImmediate(id: ModuleType) {
  pgmSource.set(id);
  queuedPgmSource.set(null);
}
