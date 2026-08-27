import { audioEngine } from '$lib/audio';

/**
 * What happens when the page goes away and comes back.
 *
 * The app had no answer to this at all, which is a desktop assumption: a rack
 * on a monitor is visible for the whole session, so nothing ever asked what
 * `document.hidden` meant. A phone backgrounds constantly — a lock, a
 * notification, switching apps, an in-app browser pane scrolled out of view —
 * and each one stops `requestAnimationFrame` and interrupts the AudioContext.
 *
 * Two things then go wrong, and neither recovers on its own:
 *
 *   1. The AudioContext is suspended. `AudioTimeline` derives position from
 *      `AudioContext.currentTime`, so the transport freezes with it. Coming
 *      back, the picture renders again but the song is silent and the playhead
 *      is stuck — with the transport still reporting "playing", so PLAY is a
 *      no-op and there is no way out from inside the app.
 *
 *   2. Anything that counts what the transport crossed sees the whole absence
 *      as one frame. `crossedSequencerSteps` caps that itself; this module is
 *      what stops the gap being created in the first place where it can.
 *
 * Registered once from the page's onMount alongside the other runtime starts,
 * and returns its own teardown like the rest of them.
 */
export function startLifecycleWatch(): () => void {
  if (typeof document === 'undefined') return () => {};

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    // Fire and forget: a refusal is reported by the engine and leaves the
    // transport untouched, so there is nothing here to handle.
    void audioEngine.resumeAfterBackground();
  };

  document.addEventListener('visibilitychange', onVisible);
  // iOS fires pageshow on a back-forward-cache restore without a
  // visibilitychange, so the same recovery has to hang off both.
  window.addEventListener('pageshow', onVisible);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
  };
}
