import { describe, expect, test } from 'vitest';
import { sectionIndexAtSeconds } from '$lib/arrangement/sectionBounds';

const bands = [{ startSeconds: 0 }, { startSeconds: 10 }, { startSeconds: 25 }];

describe('sectionIndexAtSeconds', () => {
  test('finds the section by position, so a seek lands mid-song', () => {
    expect(sectionIndexAtSeconds(bands, 12)).toBe(1);
    expect(sectionIndexAtSeconds(bands, 30)).toBe(2);
  });

  test('a boundary belongs to the section that starts there', () => {
    expect(sectionIndexAtSeconds(bands, 10)).toBe(1);
  });

  test('clamps before the first and past the last', () => {
    expect(sectionIndexAtSeconds(bands, -1)).toBe(0);
    expect(sectionIndexAtSeconds(bands, 999)).toBe(2);
    expect(sectionIndexAtSeconds([], 5)).toBe(-1);
  });
});
