import { get } from 'svelte/store';
import { afterEach, describe, expect, test } from 'vitest';
import { isMobileShell } from '$lib/mobile/mobileEnv';
import {
  recordFrame,
  renderBudgetState,
  renderScale,
  startRenderBudget,
  stopRenderBudget
} from '$lib/runtime/renderBudget';

/**
 * The governor trades PGM resolution for frame budget on the phone. These
 * cover the parts that decide whether it helps or thrashes: that it only runs
 * where it is allowed to, that it needs a sustained signal to move, and that a
 * backgrounded page does not read as a slow one.
 */

/** Frames per decision window, mirroring WINDOW_FRAMES in the module. */
const WINDOW = 20;

/**
 * Feed `count` frames of `deltaMs` starting at `from`; returns the new clock.
 *
 * The very first frame after a start only primes the clock -- there is no
 * interval yet to measure -- so `prime()` gets that out of the way and lets a
 * test say how many *measured* frames it wants.
 */
function feed(from: number, deltaMs: number, count: number): number {
  let now = from;
  for (let i = 0; i < count; i++) {
    now += deltaMs;
    recordFrame(now);
  }
  return now;
}

function prime(at: number): number {
  recordFrame(at);
  return at;
}

afterEach(() => {
  stopRenderBudget();
  isMobileShell.set(false);
});

describe('render budget', () => {
  test('is off unless explicitly opted in', () => {
    // Default on a phone: no ?budget=1, so nothing adjusts. The mechanism costs
    // a black frame per change until it can resize without a re-attach.
    isMobileShell.set(true);
    startRenderBudget('');
    expect(renderBudgetState().enabled).toBe(false);

    feed(10_000, 40, 200);
    expect(get(renderScale)).toBe(1);
  });

  test('stays off on the desktop rack even when opted in', () => {
    isMobileShell.set(false);
    startRenderBudget('?budget=1');
    expect(renderBudgetState().enabled).toBe(false);

    feed(0, 40, 200);
    // A rack that is dropping frames still renders at its fixed size: the
    // visual-proof gate hashes those PNGs.
    expect(get(renderScale)).toBe(1);
  });

  test('stays off under a QA run on the phone', () => {
    isMobileShell.set(true);
    startRenderBudget('?budget=1&qa=1&qaAutoplay=1');
    expect(renderBudgetState().enabled).toBe(false);

    feed(0, 40, 200);
    expect(get(renderScale)).toBe(1);
  });

  test('steps down on the phone when frames run long', () => {
    isMobileShell.set(true);
    startRenderBudget('?budget=1');
    expect(renderBudgetState().enabled).toBe(true);

    // 40ms frames: worse than 30fps, well past the 22ms step-down threshold.
    feed(10_000, 40, 40);
    expect(get(renderScale)).toBeLessThan(1);
  });

  test('holds full resolution at 60fps', () => {
    isMobileShell.set(true);
    startRenderBudget('?budget=1');

    feed(10_000, 16.7, 200);
    // 16.7ms is inside neither threshold: nothing to fix, nothing to reclaim.
    expect(get(renderScale)).toBe(1);
  });

  test('will not drop a second step inside the downward dwell', () => {
    isMobileShell.set(true);
    startRenderBudget('?budget=1');

    // 40ms frames clear the 22ms step-down threshold, and one window of them is
    // 800ms -- past the 700ms dwell, so the first drop lands.
    let now = prime(10_000);
    now = feed(now, 40, WINDOW);
    const afterFirst = get(renderScale);
    expect(afterFirst).toBeLessThan(1);

    // A whole further window of 30ms frames is only 600ms, inside the dwell.
    now = feed(now, 30, WINDOW);
    expect(get(renderScale)).toBe(afterFirst);
  });

  test('ignores the gap left by a backgrounded page', () => {
    isMobileShell.set(true);
    startRenderBudget('?budget=1');

    // One 30-second absence between two good frames must not be averaged in.
    let now = 10_000;
    now += 16.7;
    recordFrame(now);
    now += 30_000;
    recordFrame(now);
    feed(now, 16.7, 40);

    expect(get(renderScale)).toBe(1);
  });

  test('recovers resolution once the device has sustained headroom', () => {
    isMobileShell.set(true);
    startRenderBudget('?budget=1');

    // Two full windows of 40ms frames, landing on a window boundary so no
    // expensive frame is left over to be averaged into the recovery below.
    let now = prime(10_000);
    now = feed(now, 40, WINDOW * 2);
    const dropped = get(renderScale);
    expect(dropped).toBeLessThan(1);

    // Recovery is one step per four seconds by design: a phone that is warming
    // up keeps offering brief headroom it cannot hold, so climbing back has to
    // be slower than falling. Two seconds of cheap frames is not enough.
    now = feed(now, 10, 200);
    expect(get(renderScale)).toBe(dropped);

    // Given long enough, it climbs all the way back.
    now = feed(now, 10, 1200);
    expect(get(renderScale)).toBe(1);
  });
});
