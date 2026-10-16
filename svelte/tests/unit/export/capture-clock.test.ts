import { expect, test } from 'vitest';
import { CaptureClock } from '$lib/export/captureClock';

test('removes capture timestamp stalls without removing recorded silence', () => {
  const clock = new CaptureClock();
  for (const timestamp of [0.04, 0.1, 0.96, 1.02]) clock.add(timestamp, 0.06);
  expect(clock.drifted).toBe(true);
  expect(clock.end).toBeCloseTo(0.28);
  expect(clock.map(0.96)).toBeCloseTo(0.16);
  expect(clock.map(0.99)).toBeCloseTo(0.19);
  expect(clock.map(1.08)).toBeCloseTo(0.28);
});

test('keeps a healthy capture clock and its initial audio offset', () => {
  const clock = new CaptureClock();
  for (const timestamp of [0.04, 0.1, 0.16]) clock.add(timestamp, 0.06);
  expect(clock.drifted).toBe(false);
  expect(clock.map(0)).toBe(0);
  expect(clock.map(0.13)).toBeCloseTo(0.13);
});
