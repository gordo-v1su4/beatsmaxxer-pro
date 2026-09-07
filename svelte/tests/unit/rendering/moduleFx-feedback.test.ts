import { describe, expect, test } from 'vitest';
import { MODULE_FX_WGSL } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';

function effectBodies(wgsl: string) {
  const bodies = new Map<string, string>();
  const pattern = /fn (effect[A-Za-z]+)\([^)]*\) -> vec3f \{([\s\S]*?)\n\}/g;
  for (const match of wgsl.matchAll(pattern)) {
    bodies.set(match[1], match[2]);
  }
  return bodies;
}

describe('moduleFx feedback sampling', () => {
  test('only tapdelay reads the feedback texture', () => {
    const bodies = effectBodies(MODULE_FX_WGSL);

    expect(bodies.get('effectTapDelay')).toContain('sampleFeedback');
    for (const [name, body] of bodies) {
      if (name === 'effectTapDelay') continue;
      expect(body).not.toContain('sampleFeedback');
    }
  });
});
