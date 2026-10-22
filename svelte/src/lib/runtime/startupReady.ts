export interface StartupProgress {
  ready: number;
  total: number;
  frame: number;
}

/** Wait for every shader and then a frame rendered with those shaders.
 * The deadline measures inactivity, not total loading time. An observed stall
 * remains covered and keeps watching for recovery; it never permits entry.
 */
export async function waitForStartupReady(
  read: () => StartupProgress,
  progress: (state: StartupProgress) => void,
  signal: AbortSignal,
  timeoutMs = 60000,
  isVisible = () => typeof document === 'undefined' || !document.hidden,
  onStallChange?: (stalled: boolean) => void
): Promise<void> {
  let remainingMs = timeoutMs;
  let previousAt = performance.now();
  let wasVisible = isVisible();
  const visibilityChanged = () => {
    // A frozen tab may run no polling timers between hide and show. Observe
    // the transitions themselves so that interval never spends the deadline.
    previousAt = performance.now();
    wasVisible = isVisible();
  };
  const page = typeof document === 'undefined' ? undefined : document;
  page?.addEventListener('visibilitychange', visibilityChanged);
  // init() can finish all compiles before the first poll. That first frame
  // already contains the ready shaders; an idle rack may not draw a second.
  let lastUnreadyFrame = 0;
  let previousReady = 0;
  let stalled = false;
  try {
    for (;;) {
      signal.throwIfAborted();
      const now = performance.now();
      const visible = isVisible();
      if (visible && wasVisible) remainingMs -= now - previousAt;
      previousAt = now;
      wasVisible = visible;
      const state = read();
      if (state.ready > previousReady) {
        remainingMs = timeoutMs;
        if (stalled) { stalled = false; onStallChange?.(false); }
      }
      previousReady = state.ready;
      progress(state);
      if (state.total > 0 && state.ready >= state.total) {
        if (visible && state.frame > lastUnreadyFrame) {
          if (stalled) onStallChange?.(false);
          return;
        }
      } else lastUnreadyFrame = state.frame;
      if (remainingMs <= 0 && !stalled) {
        if (!onStallChange) throw new Error('Graphics are taking too long to finish. Reload to try again.');
        stalled = true;
        onStallChange(true);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally { page?.removeEventListener('visibilitychange', visibilityChanged); }
}
