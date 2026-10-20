import { gsap } from 'gsap';

export const SPLASH_REVEAL_SECONDS = 1.8;

export interface SplashLayerMotion {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  reveal: number;
  sheen: number;
}

export function createSplashTimeline(reducedMotion: boolean) {
  const layer = (values: Partial<SplashLayerMotion> = {}): SplashLayerMotion => ({
    x: 0, y: 0, scale: 1, opacity: 0, reveal: 1, sheen: -0.3, ...values
  });
  const motion = {
    background: layer({ x: -0.012, scale: 1.025 }),
    divider: layer({ reveal: 0 }),
    subtitle: layer({ y: 0.015 }),
    pro: layer({ x: 0.04, scale: 1.025 }),
    titleTop: layer({ x: -0.95 }),
    titleBottom: layer({ x: 0.95 })
  };
  const timeline = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  timeline.addLabel('join', 0.10)
    .to(motion.titleTop, { x: 0, opacity: 1, duration: 0.70 }, 'join')
    .to(motion.titleBottom, { x: 0, opacity: 1, duration: 0.70 }, 'join+=0.04')
    .to(motion.background, { x: 0, scale: 1, opacity: 0.80, duration: 1.40 }, 0)
    .to(motion.divider, { reveal: 1, opacity: 1, duration: 0.45 }, 0.60)
    .to(motion.subtitle, { y: 0, opacity: 1, duration: 0.42 }, 0.78)
    .to(motion.pro, { x: 0, scale: 1, opacity: 1, duration: 0.42 }, 0.94)
    .to([motion.titleTop, motion.titleBottom, motion.pro], { sheen: 1.3, duration: 0.65, ease: 'power1.inOut' }, 1.10);
  if (reducedMotion) timeline.progress(1);
  return { motion, timeline };
}
