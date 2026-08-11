import { writable, derived, get } from 'svelte/store';

/**
 * Is the phone shell up?
 *
 * This is a decision, not a breakpoint. The desktop rack renders five 420px
 * modules per row plus 361px of rails — 2552px — and no amount of reflow turns
 * that into a phone. So the two surfaces are two component trees, and this store
 * picks which one mounts.
 *
 * 820 rather than 960: the existing 960 block in app.css stacks the *desktop*
 * layout for narrow windows, and a laptop at 900px should still get the rack.
 *
 * The test is written on the *short* and *long* edges rather than on width and
 * height, because rotating a phone swaps the two and must not swap the shell.
 * The first version keyed landscape off `pointer: coarse`, and a 850x390 phone
 * that does not report coarse — or any device where the emulation differs —
 * fell straight through to the desktop rack at 390px tall, mid-performance.
 * Turning the phone sideways is the app's stated way to perform; it is the one
 * moment the shell absolutely must not change underneath the operator.
 *
 * 1180 on the long edge keeps the iPad out (1024x768 has a 768 short edge and
 * would already fail) while covering every phone in landscape.
 */
const MOBILE_MAX_WIDTH = 820;
const PHONE_MAX_SHORT_EDGE = 520;
const PHONE_MAX_LONG_EDGE = 1180;

/**
 * Evaluated at module load, not in `onMount`.
 *
 * `WebGpuCanvas.attachCanvas` awaits device init before registering its
 * binding, so a rack that mounts for a single frame and unmounts registers ten
 * bindings *after* their `detachCanvas` calls have already run — ten canvases
 * rendering for the rest of the session with nothing on screen. The shell has
 * to be chosen before the first render, which is why `+layout.ts` turns SSR
 * off: there is no server pass to disagree with this value.
 */
export const isMobileShell = writable(evaluate());
export const orientation = writable<'portrait' | 'landscape'>(
  typeof window !== 'undefined' && window.innerWidth >= window.innerHeight
    ? 'landscape'
    : 'portrait'
);
export const viewportSize = writable(
  typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 0, height: 0 }
);

/** Landscape is the performance posture: picture first, chrome floating over it. */
export const isPerformPosture = derived(
  [isMobileShell, orientation],
  ([mobile, o]) => mobile && o === 'landscape'
);

function evaluate(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  // Both overrides exist so the shell can be reviewed on a desktop browser and
  // so a tablet user who wants the real rack can ask for it.
  if (params.get('mobile') === '1') return true;
  if (params.get('desktop') === '1') return false;

  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= MOBILE_MAX_WIDTH) return true;
  // Orientation-independent: a phone lying down is short on one edge whichever
  // way it is held, so the same device answers the same either way.
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  return short <= PHONE_MAX_SHORT_EDGE && long <= PHONE_MAX_LONG_EDGE;
}

/**
 * Starts tracking and returns the teardown. Called once from the page's
 * onMount — everything downstream is a plain store read.
 */
export function initMobileEnv(): () => void {
  if (typeof window === 'undefined') return () => {};

  const sync = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    viewportSize.set({ width: w, height: h });
    orientation.set(w >= h ? 'landscape' : 'portrait');
    const next = evaluate();
    if (get(isMobileShell) !== next) isMobileShell.set(next);
  };

  sync();
  window.addEventListener('resize', sync, { passive: true });
  window.addEventListener('orientationchange', sync, { passive: true });
  return () => {
    window.removeEventListener('resize', sync);
    window.removeEventListener('orientationchange', sync);
  };
}
