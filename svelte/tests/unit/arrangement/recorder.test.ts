import { describe, expect, it } from 'vitest';
import { rackSlotIndex } from '$lib/stores/rack';
import { triggerJustFired } from '$lib/arrangement/recorder';

describe('rackSlotIndex', () => {
  it('maps top row slots to 0-4', () => {
    expect(rackSlotIndex('top-0')).toBe(0);
    expect(rackSlotIndex('top-4')).toBe(4);
  });

  it('maps bottom row slots to 5-9', () => {
    expect(rackSlotIndex('bottom-0')).toBe(5);
    expect(rackSlotIndex('bottom-4')).toBe(9);
  });

  it('rejects unknown ids', () => {
    expect(rackSlotIndex('transition')).toBeNull();
  });
});

describe('triggerJustFired', () => {
  it('is true only at the start of a trigger window', () => {
    expect(triggerJustFired(-0.01)).toBe(false);
    expect(triggerJustFired(0)).toBe(true);
    expect(triggerJustFired(0.05)).toBe(true);
    expect(triggerJustFired(0.2)).toBe(false);
    expect(triggerJustFired(undefined)).toBe(false);
  });
});
