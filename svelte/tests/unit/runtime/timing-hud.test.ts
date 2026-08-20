import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildClockHud,
  buildSamplerHud,
  buildTimingHud,
  formatTransportSeconds
} from '$lib/runtime/timingHud';
import type { TimelineFrame } from '$lib/transport/AudioTimeline';

function frame(overrides: Partial<TimelineFrame> = {}): TimelineFrame {
  return {
    frameId: 1,
    audioFrameId: 1,
    contextTimeSeconds: 1,
    positionSeconds: 12.4,
    transportSeconds: 12.4,
    playbackRate: 1,
    playing: true,
    generation: 4,
    reason: 'play',
    bpm: 125,
    beatPosition: 31.2,
    beatPhase: 0.2,
    beatIndex: 31,
    beatIntervalSeconds: 0.48,
    gridSource: 'hosted',
    fixedStepSeconds: 1 / 60,
    fixedStepIndex: 744,
    fixedStepPhase: 0,
    deterministicSeed: 1,
    events: [],
    ...overrides
  } as TimelineFrame;
}

describe('timing HUD', () => {
  test('formats transport time for the clock readout', () => {
    expect(formatTransportSeconds(0)).toBe('0:00.0');
    expect(formatTransportSeconds(12.4)).toBe('0:12.4');
    expect(formatTransportSeconds(125.41)).toBe('2:05.4');
  });

  test('PLAY, SEEK, and LOOP are distinct visible clock reasons', () => {
    expect(buildClockHud(frame({ reason: 'play', playing: true }), true).reasonLabel).toBe('PLAY');
    expect(buildClockHud(frame({ reason: 'seek', playing: true, generation: 5 }), true).reasonLabel).toBe(
      'SEEK'
    );
    expect(
      buildClockHud(frame({ reason: 'loop-wrap', playing: true, generation: 6 }), true).reasonLabel
    ).toBe('LOOP');
    expect(buildClockHud(frame({ reason: 'pause', playing: false }), false).reasonLabel).toBe('STOP');
  });

  test('clock bar/beat and position come from the timeline frame', () => {
    const clock = buildClockHud(frame(), true);
    expect(clock.bar).toBe(8);
    expect(clock.beatInBar).toBe(4);
    expect(clock.positionLabel).toBe('0:12.4');
    expect(clock.generation).toBe(4);
    expect(clock.bpmLocked).toBe(true);
  });

  test('sampler tree is 1-based slice over the reducer output', () => {
    const sampler = buildSamplerHud({
      mode: 'FWD',
      activeSlice: 2,
      effectiveSliceCount: 8,
      sourceTimestampSeconds: 4.21,
      jumpGeneration: 12,
      jumpReason: 'scheduled',
      loopIteration: 1,
      loopCount: 1
    });
    expect(sampler.slice).toBe(3);
    expect(sampler.sliceCount).toBe(8);
    expect(sampler.sourceLabel).toBe('4.21s');
    expect(sampler.jumpLabel).toBe('SCHED');
    expect(sampler.mode).toBe('FWD');
  });

  test('one snapshot carries both the clock and the sampler tree', () => {
    const hud = buildTimingHud({
      frame: frame({ reason: 'seek', generation: 9, positionSeconds: 8 }),
      bpmLocked: true,
      sampler: {
        mode: 'PONG',
        activeSlice: 0,
        effectiveSliceCount: 8,
        sourceTimestampSeconds: 0.5,
        jumpGeneration: 1,
        jumpReason: 'discontinuity',
        loopIteration: 1,
        loopCount: 2
      }
    });
    expect(hud.clock.reasonLabel).toBe('SEEK');
    expect(hud.clock.generation).toBe(9);
    expect(hud.sampler?.mode).toBe('PONG');
    expect(hud.sampler?.jumpLabel).toBe('DISC');
    expect(hud.sampler?.loopCount).toBe(2);
  });
});

describe('timing HUD wiring', () => {
  test('transport display still has no requestAnimationFrame of its own', () => {
    const source = readFileSync(resolve('src/lib/stores/transportDisplay.ts'), 'utf8');
    expect(source).toContain('audioTimeline.subscribe');
    expect(source).toContain('hudFromFrame');
    expect(source).not.toMatch(/\brequestAnimationFrame\s*\(/);
  });

  test('PGM gutter exposes the HUD for PLAY/seek/loop', () => {
    const source = readFileSync(resolve('src/lib/components/MainViewer.svelte'), 'utf8');
    expect(source).toContain('data-timing-hud');
    expect(source).toContain('data-clock-reason');
    expect(source).toContain('data-sampler-slice');
    expect(source).toContain('SAMPLER');
    expect(source).toContain('audioEngine.seek');
  });
});
