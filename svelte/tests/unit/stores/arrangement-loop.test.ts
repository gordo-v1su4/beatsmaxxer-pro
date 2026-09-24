import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { arrangementLoopRegion } from '$lib/stores/arrangement';

/** Minimal stand-in for transport poll loop-wrap logic. */
function shouldSeekToLoopStart(
  loop: { startSeconds: number; endSeconds: number } | null,
  playing: boolean,
  positionSeconds: number,
): number | null {
  if (
    loop &&
    playing &&
    loop.endSeconds > loop.startSeconds &&
    positionSeconds >= loop.endSeconds - 0.02
  ) {
    return loop.startSeconds;
  }
  return null;
}

describe('arrangement loop region', () => {
  beforeEach(() => {
    arrangementLoopRegion.set(null);
  });

  test('wraps playback at loop end', () => {
    arrangementLoopRegion.set({ startSeconds: 10, endSeconds: 20 });
    const loop = get(arrangementLoopRegion);
    expect(shouldSeekToLoopStart(loop, true, 19.99)).toBeNull();
    expect(shouldSeekToLoopStart(loop, true, 20)).toBe(10);
    expect(shouldSeekToLoopStart(loop, false, 20)).toBeNull();
  });
});
