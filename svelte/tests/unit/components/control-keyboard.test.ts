import { describe, expect, test } from 'vitest';
import { sliderValueForKey } from '$lib/components/controlKeyboard';

describe('continuous control keyboard semantics', () => {
  test.each([
    ['ArrowRight', 51],
    ['ArrowUp', 51],
    ['ArrowLeft', 49],
    ['ArrowDown', 49],
    ['PageUp', 60],
    ['PageDown', 40],
    ['Home', 0],
    ['End', 100]
  ])('%s produces the advertised slider value', (key, expected) => {
    expect(sliderValueForKey(key, 50, 0, 100)).toBe(expected);
  });

  test('clamps changes and ignores unrelated keys', () => {
    expect(sliderValueForKey('ArrowUp', 100, 0, 100)).toBe(100);
    expect(sliderValueForKey('PageDown', 5, 0, 100)).toBe(0);
    expect(sliderValueForKey('Enter', 50, 0, 100)).toBeNull();
  });
});
