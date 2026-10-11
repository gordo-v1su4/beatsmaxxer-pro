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
  arrangementLoopRegion,
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
    arrangementLoopRegion.set(null);
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

  test('closes and reopens an unchanged deck across a loop wrap', () => {
    arrangementLoopRegion.set({startSeconds:1,endSeconds:4});
    beginArrangementRecording(2,true);
    tickArrangementRecorder(frame(3.9),get(rackTop),{});
    tickArrangementRecorder({...frame(1.1),reason:'loop-wrap'},get(rackTop),{});
    expect(get(arrangementClips).map(c=>[c.startSeconds,c.endSeconds])).toEqual([[2,4],[1.1,null]]);
    endArrangementRecording(2);
    arrangementLoopRegion.set(null);
  });

  test('a manual backward seek does not fabricate time up to the loop end', () => {
    arrangementLoopRegion.set({startSeconds:1,endSeconds:8});
    beginArrangementRecording(4,true);
    tickArrangementRecorder(frame(5),get(rackTop),{});
    tickArrangementRecorder({...frame(4.5),reason:'seek'},get(rackTop),{});
    expect(get(arrangementClips).map(c=>[c.startSeconds,c.endSeconds])).toEqual([[4,5],[4.5,null]]);
    endArrangementRecording(5);
    arrangementLoopRegion.set(null);
  });
});
