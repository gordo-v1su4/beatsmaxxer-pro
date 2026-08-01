import { describe, expect, test } from 'vitest';
import { timeSamplerAccentUniforms } from '$lib/runtime/AppLoop';
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
      presentationTimeSeconds: 10
    })).toEqual({ aux1: 1, aux2: 0 });
    expect(timeSamplerAccentUniforms(frame(10.1), {
      mode: 1,
      presentationTimeSeconds: 10
    })).toEqual({ aux1: expect.closeTo(Math.exp(-1.2)), aux2: 1 });
    expect(timeSamplerAccentUniforms(frame(11), {
      mode: 0,
      presentationTimeSeconds: 10
    })).toEqual({ aux1: 0, aux2: 0 });
  });

  test('WGSL consumes the event uniforms instead of rebuilding jump timing from beat', () => {
    const body = MODULE_FX_WGSL.match(/fn effectTimeSampler\([^]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('let hit = clamp(u.aux1, 0.0, 1.0) * u.playing;');
    expect(body).toContain('u.aux2 < 0.5');
    expect(body).not.toContain('jumpBeats');
    expect(body).not.toContain('floor(u.beat');
  });
});
