import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  activeSectionIndex,
  arrangement,
  autoBank,
  DEFAULT_ARRANGEMENT,
  selectSection,
} from '$lib/stores/arrangement';
import { rackBottom, rackTop } from '$lib/stores/rack';

describe('auto-bank on section select', () => {
  beforeEach(() => {
    arrangement.set(structuredClone(DEFAULT_ARRANGEMENT));
    activeSectionIndex.set(0);
    autoBank.set(false);
  });

  test('does not recall section bank when auto-bank is off', () => {
    const introTop = [...get(rackTop)];
    selectSection(2);
    expect(get(activeSectionIndex)).toBe(2);
    expect(get(rackTop)).toEqual(introTop);
  });

  test('recalls section bank when auto-bank is on', () => {
    autoBank.set(true);
    selectSection(2);
    const chorus = DEFAULT_ARRANGEMENT[2]!;
    expect(get(rackTop)).toEqual(chorus.bank.top);
    expect(get(rackBottom)).toEqual(chorus.bank.bottom);
  });
});
