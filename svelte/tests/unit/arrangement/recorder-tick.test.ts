import { beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  beginArrangementRecording,
  endArrangementRecording,
  resetArrangementRecorderState,
  tickArrangementRecorder,
} from '$lib/arrangement/recorder';
import {
  arrangementClips,
  arrangementRecording,
  arrangementTriggers,
} from '$lib/stores/arrangement';
import { assignModuleToSlot, rackTop } from '$lib/stores/rack';
import { pgmSource } from '$lib/stores/pgm';
import type { TimelineFrame } from '$lib/transport';

function frame(seconds: number, playing = true): TimelineFrame {
  return {
    positionSeconds: seconds,
    playing,
    beatPosition: 0,
    generation: 1,
    bpm: 120,
  } as TimelineFrame;
}

describe('tickArrangementRecorder', () => {
  beforeEach(() => {
    arrangementClips.set([]);
    arrangementTriggers.set([]);
    arrangementRecording.set(false);
    resetArrangementRecorderState();
    assignModuleToSlot('top', 0, 'transition');
    pgmSource.set('transition');
  });

  test('records PGM clip span while REC and playing', () => {
    beginArrangementRecording(1, true);
    tickArrangementRecorder(frame(1.5), get(rackTop), {});
    tickArrangementRecorder(frame(2), get(rackTop), {});
    endArrangementRecording(2.5);

    const clips = get(arrangementClips);
    expect(clips).toHaveLength(1);
    expect(clips[0]?.slotIndex).toBe(0);
    expect(clips[0]?.startSeconds).toBe(1);
    expect(clips[0]?.endSeconds).toBe(2.5);
  });

  test('records trigger mark on rising triggerAge edge', () => {
    beginArrangementRecording(0, true);
    const modules = get(rackTop);
    tickArrangementRecorder(frame(1), modules, { transition: 0.05 });
    tickArrangementRecorder(frame(1.02), modules, { transition: 0.2 });

    expect(get(arrangementTriggers)).toHaveLength(1);
    expect(get(arrangementTriggers)[0]?.slotIndex).toBe(0);
    endArrangementRecording(2);
  });
});
