import { afterEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import type { TimelineFrame } from '$lib/transport';

const harness = vi.hoisted(() => ({ publish: null as null | ((frame: TimelineFrame) => void) }));
vi.mock('$lib/transport', async (original) => ({
  ...await original<object>(),
  audioTimeline: {
    subscribe: (callback: (frame: TimelineFrame) => void, priority: number) => {
      if (priority === 10) harness.publish = callback;
      return () => {};
    },
  },
}));
vi.mock('$lib/audio', () => ({ audioEngine: {
  getState: () => ({ bassAmp: 0, amplitude: 0, highAmp: 0 }),
  getSoundTouchState: () => ({ keySemitones: 0, pitchSemitones: 0 }),
} }));
vi.mock('$lib/rendering/webgpu/WebGpuEngine', () => ({ webGpuEngine: {
  setFrameContext: vi.fn(), getDevice: () => null,
  setTimingTextures: vi.fn(), renderAll: vi.fn(),
} }));
vi.mock('$lib/runtime/timing/TimingRuntime', () => ({ timingRuntime: {
  setActive: vi.fn(), tick: vi.fn(), dispose: vi.fn(), textureFor: vi.fn(),
} }));
vi.mock('$lib/platform/videoSource', () => ({ getVideoSourcePort: () => ({ tick: vi.fn() }) }));
vi.mock('$lib/runtime/renderBudget', () => ({
  startRenderBudget: vi.fn(), stopRenderBudget: vi.fn(), recordFrame: vi.fn(),
}));

import { startAppLoop, stopAppLoop } from '$lib/runtime/AppLoop';
import { setArrangementMode, recordOverdub } from '$lib/arrangement/transportMode';
import { cuts } from '$lib/stores/arrangement';
import { rackTop } from '$lib/stores/rack';
import { pgmSource } from '$lib/stores/pgm';
import { playbackWorkspace } from '$lib/stores/rackUi';
import { sequencerArmed } from '$lib/stores/sequencer';
import { arrangementClips } from '$lib/stores/arrangement';

function publish(step: number, generation = 1, playing = true) {
  harness.publish!({ generation, beatPosition: step / 4, positionSeconds: step / 8,
    bpm: 120, playing, playbackRate: 1 } as TimelineFrame);
}

afterEach(() => { stopAppLoop(); vi.unstubAllGlobals(); });

describe('replace recording take lifecycle', () => {
  test('Timing recording closes each occupancy lane when PGM changes', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    playbackWorkspace.set('timing');
    setArrangementMode('live', 0);
    const decks = get(rackTop);
    pgmSource.set(decks[0]!);
    setArrangementMode('rec', 0);
    startAppLoop();
    publish(0);
    pgmSource.set(decks[1]!);
    publish(4);
    expect(get(arrangementClips)).toEqual([
      expect.objectContaining({slotIndex: 0, startSeconds: 0, endSeconds: .5}),
      expect.objectContaining({slotIndex: 1, startSeconds: .5, endSeconds: null}),
    ]);
    setArrangementMode('live', .75);
  });
  test.each([true, false])('clears earlier take protection through LIVE (playing=%s)', (playing) => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    playbackWorkspace.set('timing');
    cuts.set([]);
    recordOverdub.set(false);
    setArrangementMode('live', 0);
    setArrangementMode('rec', 0);
    sequencerArmed.set(true);
    const decks = get(rackTop);
    pgmSource.set(decks[0]!);
    startAppLoop();
    publish(0);
    pgmSource.set(decks[1]!);
    publish(4);
    expect(get(cuts)).toContainEqual(expect.objectContaining({ step: 4, slotIndex: 1 }));

    setArrangementMode('live', 0.5);
    sequencerArmed.set(false);
    publish(4, 1, playing);
    setArrangementMode('rec', 0);
    sequencerArmed.set(true);
    publish(0, 2);
    publish(5, 2);
    expect(get(cuts)).not.toContainEqual(expect.objectContaining({ step: 4, slotIndex: 1 }));
  });
});
