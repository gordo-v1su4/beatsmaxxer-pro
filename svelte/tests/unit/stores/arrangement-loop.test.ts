import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { loopSeekTargetSeconds } from '$lib/arrangement/loopTransport';
import { arrangementLoopRegion } from '$lib/stores/arrangement';

describe('arrangement loop region', () => {
  beforeEach(() => {
    arrangementLoopRegion.set(null);
  });

  test('wraps playback at loop end', () => {
    arrangementLoopRegion.set({ startSeconds: 10, endSeconds: 20 });
    const loop = get(arrangementLoopRegion);
    expect(loopSeekTargetSeconds(loop, true, 19.97)).toBeNull();
    expect(loopSeekTargetSeconds(loop, true, 19.99)).toBe(10);
    expect(loopSeekTargetSeconds(loop, false, 20)).toBeNull();
  });
});
