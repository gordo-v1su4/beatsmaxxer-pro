import type { ArrangementLoopRegion } from '$lib/stores/arrangement';

/** When playback crosses the loop end, transport seeks to loop start. */
export function loopSeekTargetSeconds(
  loop: ArrangementLoopRegion | null,
  playing: boolean,
  positionSeconds: number,
  endEpsilonSeconds = 0.02,
): number | null {
  if (
    loop &&
    playing &&
    loop.endSeconds > loop.startSeconds &&
    positionSeconds >= loop.endSeconds - endEpsilonSeconds
  ) {
    return loop.startSeconds;
  }
  return null;
}
