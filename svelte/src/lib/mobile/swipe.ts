/**
 * One pointer stream, two gestures.
 *
 * The module sheet needs vertical drag-to-dismiss and horizontal paging from
 * the same finger, and the finger does not announce which one it meant. So the
 * first ~10px of travel decide: whichever axis moved further wins, and the
 * gesture is locked to it for the rest of the stroke. Anything shorter than the
 * threshold never locks and reports back as a tap, which is how the grabber can
 * be both a drag handle and a button.
 *
 * Pointer capture is deliberately taken at *lock*, not at pointerdown. Capturing
 * early would redirect the eventual `click` to this node and swallow every
 * button press inside the sheet; capturing at lock means a tap stays a tap on
 * whatever child was pressed, and a drag stops being that child's problem.
 *
 * `touch-action` is written to the node rather than left to CSS because the
 * whole point is claiming the axes from the browser's scroller — a handler that
 * competes with native panning loses, silently, only on a real device.
 */

export type SwipeAxis = 'x' | 'y';

export interface SwipeEnd {
  /** null when the stroke never travelled far enough to lock — a tap. */
  axis: SwipeAxis | null;
  dx: number;
  dy: number;
  /** Signed px/ms along the locked axis, sampled over the tail of the stroke. */
  velocity: number;
  /** Total stroke duration in ms. */
  duration: number;
}

export interface SwipeOptions {
  /** Fires once, the moment an axis is chosen. */
  onLock?: (axis: SwipeAxis, dx: number, dy: number) => void;
  /** Fires on every move after the lock. */
  onMove?: (axis: SwipeAxis, dx: number, dy: number) => void;
  /** Fires on pointerup/cancel, including for taps (axis === null). */
  onEnd?: (end: SwipeEnd) => void;
  /** Axes this target may lock onto. A stroke on any other axis is released. */
  axes?: SwipeAxis[];
  /** Travel in px before the axis is decided. Default 10. */
  lockThreshold?: number;
  /** Written straight to `node.style.touchAction`. Default 'none'. */
  touchAction?: string;
  /** Pointers that start inside a match of this selector are left alone. */
  ignore?: string;
  /** Default true. */
  enabled?: boolean;
}

/** Velocity is read over the tail of the stroke, not the whole of it. */
const VELOCITY_WINDOW_MS = 90;

export function swipe(node: HTMLElement, initial: SwipeOptions = {}) {
  let options: SwipeOptions = initial;

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let axis: SwipeAxis | null = null;
  let captured = false;
  /** Rolling sample used for the release velocity. */
  let sampleX = 0;
  let sampleY = 0;
  let sampleT = 0;
  let lastX = 0;
  let lastY = 0;

  function applyTouchAction() {
    node.style.touchAction = options.touchAction ?? 'none';
  }
  applyTouchAction();

  function allows(candidate: SwipeAxis): boolean {
    const axes = options.axes;
    return !axes || axes.includes(candidate);
  }

  function reset() {
    if (captured && pointerId !== null) {
      try {
        node.releasePointerCapture(pointerId);
      } catch {
        // The pointer can already be gone (cancel, element removed); nothing to release.
      }
    }
    pointerId = null;
    axis = null;
    captured = false;
  }

  function onPointerDown(e: PointerEvent) {
    if (options.enabled === false) return;
    if (pointerId !== null) return; // one finger owns the gesture
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (options.ignore && (e.target as Element | null)?.closest?.(options.ignore)) return;

    pointerId = e.pointerId;
    startX = lastX = sampleX = e.clientX;
    startY = lastY = sampleY = e.clientY;
    startT = sampleT = e.timeStamp;
    axis = null;
    captured = false;
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;
    const dx = lastX - startX;
    const dy = lastY - startY;

    if (axis === null) {
      const threshold = options.lockThreshold ?? 10;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      const candidate: SwipeAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (!allows(candidate)) {
        // Wrong axis for this target — hand the stroke back to the browser so a
        // vertical flick can still scroll the list it started on.
        detach();
        reset();
        return;
      }
      axis = candidate;
      try {
        node.setPointerCapture(e.pointerId);
        captured = true;
      } catch {
        // Capture is best-effort; the move listeners still fire on the node.
      }
      options.onLock?.(axis, dx, dy);
    }

    if (e.timeStamp - sampleT > VELOCITY_WINDOW_MS) {
      sampleX = lastX;
      sampleY = lastY;
      sampleT = e.timeStamp;
    }
    options.onMove?.(axis, dx, dy);
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = lastX - startX;
    const dy = lastY - startY;
    const span = Math.max(1, e.timeStamp - sampleT);
    const velocity = axis === 'x' ? (lastX - sampleX) / span : (lastY - sampleY) / span;
    const end: SwipeEnd = {
      axis,
      dx,
      dy,
      velocity: axis === null ? 0 : velocity,
      duration: e.timeStamp - startT
    };
    detach();
    reset();
    options.onEnd?.(end);
  }

  function detach() {
    node.removeEventListener('pointermove', onPointerMove);
    node.removeEventListener('pointerup', onPointerUp);
    node.removeEventListener('pointercancel', onPointerUp);
  }

  node.addEventListener('pointerdown', onPointerDown);

  return {
    update(next: SwipeOptions) {
      options = next;
      applyTouchAction();
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      detach();
      reset();
    }
  };
}

/**
 * Did this stroke mean it?
 *
 * Distance alone makes a slow deliberate half-swipe fail while a fast flick
 * that barely moved succeeds. Either signal is enough on its own.
 */
export function committed(
  travel: number,
  velocity: number,
  distanceThreshold: number,
  velocityThreshold = 0.45
): boolean {
  return Math.abs(travel) >= distanceThreshold || Math.abs(velocity) >= velocityThreshold;
}
