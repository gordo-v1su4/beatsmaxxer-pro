import { describe, expect, test } from 'vitest';
import { BOLT_LOGO } from '../../src/lib/components/splashLogoPaths';
import { splitWordmark } from '../../src/lib/components/splashLogoParts';

const subpaths = (d: string) => d.split('Z').filter((s) => s.trim()).length;
const xs = (d: string) =>
  d
    .replace(/[MZ]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((_, i) => i % 2 === 0);

describe('splash wordmark split', () => {
  const parts = splitWordmark(BOLT_LOGO);

  test('every subpath of the word lands in exactly one part', () => {
    expect(
      subpaths(parts.beats) + subpaths(parts.maxxer) + subpaths(parts.swoosh) + subpaths(parts.tip) + subpaths(parts.pro)
    ).toBe(subpaths(BOLT_LOGO.word) + subpaths(BOLT_LOGO.pro));
  });

  test('BEATS sits left of MAXXER, and the line tip moves from PRO to the swoosh', () => {
    expect(Math.max(...xs(parts.beats))).toBeLessThan(1100);
    expect(Math.min(...xs(parts.maxxer))).toBeGreaterThan(880);
    expect(subpaths(parts.swoosh)).toBe(1);
    // The line's tip, which the trace had put in PRO.
    expect(subpaths(parts.tip)).toBe(1);
    expect(Math.min(...xs(parts.pro))).toBeGreaterThan(1226);
  });
});
