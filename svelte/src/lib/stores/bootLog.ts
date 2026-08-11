import { writable } from 'svelte/store';

/**
 * Append-only record of what the app is doing while it boots.
 *
 * This exists because first load stalls hard — the module shader compiles once
 * per canvas and the main thread is blocked the whole time — and a frozen
 * screen with no text on it is indistinguishable from a crash. The log names
 * the step that is running so the freeze reads as work.
 *
 * The one rule that makes it useful: a step is pushed *before* its work
 * starts, never after. Once the main thread blocks, nothing else gets written
 * until it unblocks, so the last visible line has to already be the thing that
 * is stuck. `step()` returns a handle you finish afterwards.
 *
 * Labels are for whoever is staring at the screen, not for us — "Compiling
 * effect shaders", not "hasRenderedFrame".
 */
export interface BootStep {
  id: number;
  label: string;
  state: 'running' | 'done';
  /** Live suffix, e.g. the shader pipeline count. */
  note?: string;
}

/** Boot is a couple of dozen lines at most; the cap is only a leak guard. */
const MAX_STEPS = 32;

export const bootLog = writable<BootStep[]>([]);

let nextId = 1;

export interface BootStepHandle {
  /** Update the trailing detail on this line while it is still running. */
  note(text: string): void;
  /** Mark it finished. Safe to call twice. */
  done(): void;
}

/**
 * Push a step as running and hand back its controls. Call this on the line
 * before the work, so the label is on screen if the work blocks.
 */
export function bootStep(label: string): BootStepHandle {
  const id = nextId++;
  bootLog.update((steps) => {
    const next = [...steps, { id, label, state: 'running' as const }];
    return next.length > MAX_STEPS ? next.slice(next.length - MAX_STEPS) : next;
  });

  const patch = (change: Partial<BootStep>) => {
    bootLog.update((steps) => steps.map((s) => (s.id === id ? { ...s, ...change } : s)));
  };

  return {
    note: (text: string) => patch({ note: text }),
    done: () => patch({ state: 'done' })
  };
}

/** Close out anything still marked running — used when boot finishes or bails. */
export function bootLogSettle() {
  bootLog.update((steps) => steps.map((s) => (s.state === 'running' ? { ...s, state: 'done' } : s)));
}

export function bootLogReset() {
  bootLog.set([]);
}
