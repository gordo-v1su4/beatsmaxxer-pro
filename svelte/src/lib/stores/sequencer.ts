import { writable } from 'svelte/store';

/** 16 sixteenth-note steps per bar — module id to cut to, or null = hold. */
export const sequencerSteps = writable<(string | null)[]>(Array.from({ length: 16 }, () => null));

/** Off by default: an idle sequencer that still animates its playhead reads as
 * activity the user did not ask for. Arming it starts both the cuts and the
 * running highlight. */
export const sequencerArmed = writable(false);
export const sequencerLastStep = writable(-1);

/**
 * How many sixteenths one publication may replay before it is treated as a
 * resume rather than as playback.
 *
 * 64 is four bars — comfortably more than any real frame drop or GC pause
 * produces at a sane tempo, and short enough that the burst is inaudible.
 * Beyond it the gap is not playback at all: the tab was hidden, the phone was
 * locked, or the surface stopped compositing, and the transport kept advancing
 * on the AudioContext clock the whole time. Five backgrounded minutes at 128bpm
 * is roughly 2560 steps, and replaying them meant allocating two arrays that
 * long and then firing 2560 PGM cuts and decode prewarms into a single frame —
 * a visible stall and a cut storm on the first frame after unlocking, for
 * events that happened while the screen was off. Only the step the transport is
 * actually on can still matter, so a jump that large lands on it directly.
 */
export const MAX_REPLAYED_SEQUENCER_STEPS = 64;

/**
 * Every sixteenth crossed since the last publication.
 *
 * `steps` are bar-relative (0-15). `absoluteSteps` are counted from the top of
 * the transport and are what an arrangement addresses: a cut placed at bar 34
 * has to be distinguishable from the same position in bar 2, which the folded
 * value cannot express.
 */
export function crossedSequencerSteps(
  previousAbsoluteStep: number | null,
  beatPosition: number
) {
  const currentAbsoluteStep = Math.max(0, Math.floor(beatPosition * 4));
  if (previousAbsoluteStep === null || currentAbsoluteStep <= previousAbsoluteStep) {
    return {
      currentAbsoluteStep,
      steps: [currentAbsoluteStep % 16],
      absoluteSteps: [currentAbsoluteStep]
    };
  }
  const crossed = currentAbsoluteStep - previousAbsoluteStep;
  if (crossed > MAX_REPLAYED_SEQUENCER_STEPS) {
    return {
      currentAbsoluteStep,
      steps: [currentAbsoluteStep % 16],
      absoluteSteps: [currentAbsoluteStep]
    };
  }
  const absoluteSteps = Array.from(
    { length: crossed },
    (_, index) => previousAbsoluteStep + index + 1
  );
  return {
    currentAbsoluteStep,
    steps: absoluteSteps.map((step) => step % 16),
    absoluteSteps
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
