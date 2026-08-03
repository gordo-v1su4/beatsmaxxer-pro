import { writable } from 'svelte/store';

/** 16 sixteenth-note steps per bar — module id to cut to, or null = hold. */
export const sequencerSteps = writable<(string | null)[]>(Array.from({ length: 16 }, () => null));

/** Off by default: an idle sequencer that still animates its playhead reads as
 * activity the user did not ask for. Arming it starts both the cuts and the
 * running highlight. */
export const sequencerArmed = writable(false);
export const sequencerLastStep = writable(-1);

export function crossedSequencerSteps(
  previousAbsoluteStep: number | null,
  beatPosition: number
) {
  const currentAbsoluteStep = Math.max(0, Math.floor(beatPosition * 4));
  if (previousAbsoluteStep === null || currentAbsoluteStep <= previousAbsoluteStep) {
    return { currentAbsoluteStep, steps: [currentAbsoluteStep % 16] };
  }
  return {
    currentAbsoluteStep,
    steps: Array.from(
      { length: currentAbsoluteStep - previousAbsoluteStep },
      (_, index) => (previousAbsoluteStep + index + 1) % 16
    )
  };
}

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
