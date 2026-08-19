import { describe, expect, test } from 'vitest';
import { midiNotesForTriggerSource, timeSamplerAccentUniforms } from '$lib/runtime/AppLoop';
import { firingNotes } from '$lib/stores/midiTrigger';
import { MODULE_FX_WGSL } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import type { TimelineFrame } from '$lib/transport';

function frame(positionSeconds: number, playing = true) {
  return { positionSeconds, playing } as TimelineFrame;
}

describe('TimeSampler authoritative accent uniforms', () => {
  test('is dark by default and emits only a bounded schedule-derived pulse', () => {
    expect(timeSamplerAccentUniforms(frame(10), null)).toEqual({ aux1: 0, aux2: 2 });
    expect(timeSamplerAccentUniforms(frame(10), {
      mode: 0,
      transportSeconds: 10
    })).toEqual({ aux1: 1, aux2: 0 });
    expect(timeSamplerAccentUniforms(frame(10.1), {
      mode: 1,
      transportSeconds: 10
    })).toEqual({ aux1: expect.closeTo(Math.exp(-1.2)), aux2: 1 });
    expect(timeSamplerAccentUniforms(frame(11), {
      mode: 0,
      transportSeconds: 10
    })).toEqual({ aux1: 0, aux2: 0 });
  });

  test('stays in the transport domain across late starts and seeks', () => {
    expect(timeSamplerAccentUniforms(frame(42.1), {
      mode: 0,
      transportSeconds: 42
    }).aux1).toBeCloseTo(Math.exp(-1.2), 6);
  });

  test('WGSL consumes the event uniforms instead of rebuilding jump timing from beat', () => {
    const body = MODULE_FX_WGSL.match(/fn effectTimeSampler\([^]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('let hit = clamp(u.aux1, 0.0, 1.0) * u.playing;');
    expect(body).toContain('u.aux2 < 0.5');
    expect(body).not.toContain('jumpBeats');
    expect(body).not.toContain('floor(u.beat');
  });
});

describe('TimeSampler module MIDI contract', () => {
  const layer = {
    name: 'real-part.mid',
    duration: 3,
    notes: Array.from({ length: 24 }, (_, index) => ({
      time: index * 0.125,
      note: 60 + (index % 4),
      velocity: 20 + index * 4
    }))
  };

  test('audio routing ignores the attached part', () => {
    expect(midiNotesForTriggerSource('audio', layer, 0.5)).toBeNull();
  });

  test('runtime receives the exact identities retained by the shared DENS rule', () => {
    const expected = firingNotes(layer, 0.45).map(({ note }) => note);
    const actual = midiNotesForTriggerSource('midi', layer, 0.45);
    expect(actual).toEqual(expected);
    expect(actual?.every((note) => layer.notes.includes(note))).toBe(true);
  });
});
