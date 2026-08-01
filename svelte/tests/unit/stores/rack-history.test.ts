import { beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  canRedo,
  canUndo,
  beginRackParamTransaction,
  clearParams,
  endRackParamTransaction,
  moduleParams,
  randomize,
  redoRackParams,
  resetRackParamHistory,
  undoRackParams,
  updateParam,
  updateParams
} from '$lib/stores/rack';
import { selectPreset } from '$lib/stores/presets';

describe('rack parameter history', () => {
  beforeEach(() => {
    clearParams();
    resetRackParamHistory();
  });

  test('records a parameter edit and exposes correct undo/redo state', () => {
    const before = get(moduleParams).transition.amount;
    updateParam('transition', 'amount', before + 1);

    expect(get(canUndo)).toBe(true);
    expect(get(canRedo)).toBe(false);

    undoRackParams();
    expect(get(moduleParams).transition.amount).toBe(before);
    expect(get(canUndo)).toBe(false);
    expect(get(canRedo)).toBe(true);

    redoRackParams();
    expect(get(moduleParams).transition.amount).toBe(before + 1);
    expect(get(canUndo)).toBe(true);
    expect(get(canRedo)).toBe(false);
  });

  test('does not record no-op edits or mutate state for unavailable undo/redo', () => {
    const before = get(moduleParams);
    updateParam('transition', 'amount', before.transition.amount);
    undoRackParams();
    redoRackParams();

    expect(get(moduleParams)).toEqual(before);
    expect(get(canUndo)).toBe(false);
    expect(get(canRedo)).toBe(false);
  });

  test('applies a multi-parameter preset as one undo step', () => {
    const before = structuredClone(get(moduleParams));
    updateParams('shake', { impact: 72, hand: 68, sway: 50 });

    expect(get(moduleParams).shake).toMatchObject({ impact: 72, hand: 68, sway: 50 });
    undoRackParams();
    expect(get(moduleParams)).toEqual(before);
    expect(get(canUndo)).toBe(false);
  });

  test('coalesces every update in one continuous control gesture into one undo step', () => {
    const before = get(moduleParams).transition.amount;

    beginRackParamTransaction();
    updateParam('transition', 'amount', before + 5);
    updateParam('transition', 'amount', before + 12);
    updateParam('transition', 'amount', before + 20);
    endRackParamTransaction();

    expect(get(moduleParams).transition.amount).toBe(before + 20);
    undoRackParams();
    expect(get(moduleParams).transition.amount).toBe(before);
    expect(get(canUndo)).toBe(false);

    redoRackParams();
    expect(get(moduleParams).transition.amount).toBe(before + 20);
  });

  test('applies a factory preset as one undo step', () => {
    const before = structuredClone(get(moduleParams));
    selectPreset('Overclocked');
    expect(get(moduleParams)).not.toEqual(before);

    undoRackParams();
    expect(get(moduleParams)).toEqual(before);
    expect(get(canUndo)).toBe(false);
  });

  test('randomize and clear are each atomic and clear redo after a new edit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
    const defaults = structuredClone(get(moduleParams));

    randomize();
    const randomized = structuredClone(get(moduleParams));
    expect(randomized).not.toEqual(defaults);

    clearParams();
    expect(get(moduleParams)).toEqual(defaults);
    undoRackParams();
    expect(get(moduleParams)).toEqual(randomized);
    undoRackParams();
    expect(get(moduleParams)).toEqual(defaults);

    redoRackParams();
    updateParam('transition', 'amount', 73);
    expect(get(canRedo)).toBe(false);

    vi.restoreAllMocks();
  });
});
