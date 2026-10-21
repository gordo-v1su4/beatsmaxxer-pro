import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { fxLibOpen, pgmRailOpen, moduleCollapsed, setMinimalPerformView, viewMode } from '$lib/stores/rackUi';

afterEach(() => {
  viewMode.set('perform');
  moduleCollapsed.set({});
});

describe('Perform rail layout', () => {
  it('keeps rails open while Min All collapses module controls', () => {
    setMinimalPerformView(['transition', 'punch'], true);
    expect(get(moduleCollapsed)).toMatchObject({ transition: true, punch: true });
    expect(get(fxLibOpen)).toBe(true);
    expect(get(pgmRailOpen)).toBe(true);
  });

  it('reopens rails when returning from a collapsed Timing layout', () => {
    viewMode.set('timing');
    setMinimalPerformView(['transition'], true);
    expect(get(fxLibOpen)).toBe(false);
    expect(get(pgmRailOpen)).toBe(false);
    viewMode.set('perform');
    expect(get(fxLibOpen)).toBe(true);
    expect(get(pgmRailOpen)).toBe(true);
  });
});
