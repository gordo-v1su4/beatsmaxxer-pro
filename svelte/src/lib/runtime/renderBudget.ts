import { get, writable } from 'svelte/store';
import { isMobileShell } from '$lib/mobile/mobileEnv';

/**
 * Keep the phone inside its frame budget by trading render resolution for it.
 *
 * PGM is the only canvas on the phone and it is never throttled, so every
 * module's fragment cost is one number: how many pixels PGM is. The rack can
 * afford to fix that number because a desktop GPU has the headroom and because
 * ten previews around it are already capped. A phone does not have the
 * headroom, and it does not have one number either -- the same build runs on
 * hardware three generations and four times the fill rate apart, on a display
 * that may ask for 120Hz, while the device thermally throttles partway through
 * a set. Any fixed resolution is therefore either wasteful on the good phone or
 * a stutter on the cheap one, and picking it up front cannot be right for both.
 *
 * So it is measured instead. The loop reports how long its frames are actually
 * taking; when they run long the render scale steps down, and when there is
 * headroom back it steps up. The picture gets slightly softer rather than
 * juddering, which is the right way round for something you are performing
 * with -- a dropped frame is visible in a way that a 15% resample is not.
 *
 * Two places this deliberately does nothing:
 *
 *   - The desktop rack. `verify-visual-proof` hashes rendered PNGs, so a
 *     resolution that depends on how the machine felt at the time would make
 *     the release gate nondeterministic. The rack keeps its fixed sizing.
 *   - Under `?qa=`. Same reason, on the shell where the phone gates run.
 */

/** Steps, coarse to fine. Index 0 is full resolution. */
const SCALE_STEPS = [1, 0.85, 0.72, 0.6, 0.5] as const;

/**
 * Frame times either side of which the scale moves.
 *
 * Wide apart on purpose. Every scale change costs a canvas re-attach --
 * reconfiguring the swapchain and reallocating both feedback textures -- so a
 * governor that chased the signal would spend more than it saved. Stepping down
 * at 22ms leaves 60fps (16.7ms) comfortably alone and reacts before 30fps
 * (33ms) is in sight; stepping back up needs a sustained 14ms, which a device
 * only reaches with real headroom at the current scale.
 */
const STEP_DOWN_MS = 22;
const STEP_UP_MS = 14;

/** Frames averaged before any decision. About a third of a second at 60fps. */
const WINDOW_FRAMES = 20;

/**
 * How long a scale has to stand before it may change again.
 *
 * Longer going up than coming down: dropping frames is felt immediately and
 * should be answered immediately, while a device that has just been given more
 * pixels needs time to show whether it can hold them -- and a phone that is
 * warming up will keep offering brief headroom it cannot sustain.
 */
const DWELL_DOWN_MS = 700;
const DWELL_UP_MS = 4000;

/**
 * Render scale for the PGM canvas: 1 = full device resolution.
 *
 * A store rather than a getter so the canvas can react to it the same way it
 * reacts to anything else, instead of polling.
 */
export const renderScale = writable<number>(1);

/** Off unless the phone shell is up and this is not a gate run. */
let enabled = false;
let stepIndex = 0;
let accumulatedMs = 0;
let frameCount = 0;
let lastChangeAt = 0;
let lastFrameAt = 0;

/**
 * Start measuring. Safe to call more than once; the second call re-arms rather
 * than adding a second governor.
 */
export function startRenderBudget(search = typeof window !== 'undefined' ? window.location.search : '') {
  const isQaRun = new URLSearchParams(search).has('qa');
  enabled = get(isMobileShell) && !isQaRun;
  stepIndex = 0;
  accumulatedMs = 0;
  frameCount = 0;
  lastFrameAt = 0;
  // Anchored on the first frame rather than on performance.now(). The dwell
  // rules are all expressed against the frame clock, and seeding them from a
  // different one makes "how long since the last change" mean nothing until
  // the two happen to line up.
  lastChangeAt = 0;
  renderScale.set(1);
}

export function stopRenderBudget() {
  enabled = false;
  renderScale.set(1);
}

/**
 * One animation frame happened. Called from AppLoop's tick, which is the only
 * owner of requestAnimationFrame, so this measures the real presented cadence
 * rather than a second timer's idea of it.
 */
export function recordFrame(now: number) {
  if (!enabled) return;
  if (lastFrameAt === 0) {
    lastFrameAt = now;
    lastChangeAt = now;
    return;
  }
  const delta = now - lastFrameAt;
  lastFrameAt = now;
  // A gap this large is not a slow frame, it is the page having been away --
  // backgrounded, or blocked on a decode. Averaging it in would drop the scale
  // to the floor for something that says nothing about steady-state cost.
  if (delta > 250) return;

  accumulatedMs += delta;
  frameCount += 1;
  if (frameCount < WINDOW_FRAMES) return;

  const averageMs = accumulatedMs / frameCount;
  accumulatedMs = 0;
  frameCount = 0;

  const sinceChange = now - lastChangeAt;
  if (averageMs > STEP_DOWN_MS && stepIndex < SCALE_STEPS.length - 1) {
    if (sinceChange < DWELL_DOWN_MS) return;
    stepIndex += 1;
  } else if (averageMs < STEP_UP_MS && stepIndex > 0) {
    if (sinceChange < DWELL_UP_MS) return;
    stepIndex -= 1;
  } else {
    return;
  }
  lastChangeAt = now;
  renderScale.set(SCALE_STEPS[stepIndex]);
}

/** Test seam: what the governor currently thinks, without reading the store. */
export function renderBudgetState() {
  return { enabled, stepIndex, scale: SCALE_STEPS[stepIndex] };
}
