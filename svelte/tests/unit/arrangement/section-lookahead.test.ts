import { expect, test } from 'vitest';
import { upcomingSectionBoundaries } from '$lib/arrangement/sectionBounds';

const bounds = [{ startSeconds:0 }, { startSeconds:10 }, { startSeconds:20 }];

test('plans the loop-start section at the loop end instead of looking beyond it', () => {
  expect(upcomingSectionBoundaries(bounds, 17, { startSeconds:5, endSeconds:20 }, 30))
    .toEqual([{ index:0, at:20, positionSeconds:5 }]);
});

test('keeps ordinary boundaries before the wrap and resolves a loop start inside a section', () => {
  expect(upcomingSectionBoundaries(bounds, 2, { startSeconds:12, endSeconds:25 }, 30))
    .toEqual([{ index:1, at:10, positionSeconds:10 }, { index:2, at:20, positionSeconds:20 },
      { index:1, at:25, positionSeconds:12 }]);
});

test('plans the first section at the normal song restart', () => {
  expect(upcomingSectionBoundaries(bounds, 27, null, 30))
    .toEqual([{ index:0, at:30, positionSeconds:0 }]);
  expect(upcomingSectionBoundaries([], 0, null, 30)).toEqual([]);
});

test('an unloaded song duration does not suppress BPM-only future sections', () => {
  expect(upcomingSectionBoundaries(bounds, 2, null, 0))
    .toEqual([{ index:1, at:10, positionSeconds:10 }, { index:2, at:20, positionSeconds:20 }]);
});
