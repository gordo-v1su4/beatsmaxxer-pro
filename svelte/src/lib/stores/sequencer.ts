import { writable } from 'svelte/store';

/** 16 sixteenth-note steps per bar — module id to cut to, or null = hold. */
export const sequencerSteps = writable<(string | null)[]>(Array.from({ length: 16 }, () => null));

export const sequencerArmed = writable(true);
export const sequencerLastStep = writable(-1);

/** Bonus rack row (visible when main rows collapsed) — film/texture modules. */
export const bonusRow = writable<(string | null)[]>(['leak', 'vhs', 'bulge', 'grain']);

export function toggleSequencerStep(index: number, moduleId: string | null) {
  sequencerSteps.update((steps) => {
    const next = [...steps];
    next[index] = next[index] === moduleId ? null : moduleId;
    return next;
  });
}

export function clearSequencer() {
  sequencerSteps.set(Array.from({ length: 16 }, () => null));
}
