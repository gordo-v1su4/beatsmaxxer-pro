import { describe, expect, test } from 'vitest';
import { createSplashTimeline, SPLASH_REVEAL_SECONDS } from '$lib/rendering/webgpu/splashTimeline';

describe('layered splash choreography', () => {
  test('the title halves enter from opposite sides before the subtitle and PRO', () => {
    const { motion, timeline } = createSplashTimeline(false);
    try {
      expect(motion.titleTop.x).toBeLessThan(0);
      expect(motion.titleBottom.x).toBeGreaterThan(0);
      timeline.time(0.85);
      expect(motion.titleTop.x).toBeCloseTo(0);
      expect(motion.titleBottom.x).toBeCloseTo(0);
      expect(motion.titleTop.opacity).toBe(1);
      expect(motion.pro.opacity).toBe(0);
      expect(motion.divider.reveal).toBeGreaterThan(0);
    } finally { timeline.kill(); }
  });

  test('the entire composition settles before the splash is allowed to leave', () => {
    const { motion, timeline } = createSplashTimeline(false);
    try {
      expect(timeline.duration()).toBeLessThanOrEqual(SPLASH_REVEAL_SECONDS);
      timeline.time(SPLASH_REVEAL_SECONDS);
      for (const layer of Object.values(motion)) {
        expect(layer.x).toBe(0);
        expect(layer.y).toBe(0);
        expect(layer.scale).toBe(1);
        expect(layer.reveal).toBe(1);
      }
      expect(motion.subtitle.opacity).toBe(1);
      expect(motion.pro.opacity).toBe(1);
      expect(motion.titleTop.sheen).toBeGreaterThan(1);
      expect(motion.background.opacity).toBeGreaterThan(0.5);
      expect(motion.background.opacity).toBeLessThan(1);
    } finally { timeline.kill(); }
  });

  test('reduced motion begins with the full composition visible', () => {
    const { motion, timeline } = createSplashTimeline(true);
    try {
      expect(motion.titleTop.x).toBe(0);
      expect(motion.titleBottom.x).toBe(0);
      expect(motion.subtitle.opacity).toBe(1);
      expect(motion.pro.opacity).toBe(1);
    } finally { timeline.kill(); }
  });
});
