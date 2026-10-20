export interface StartupProgress {
  ready: number;
  total: number;
  frame: number;
}

/** Wait for every shader and then a frame rendered with those shaders.
 * A slow startup remains covered; a timeout is an error, never permission to open.
 */
export async function waitForStartupReady(
  read: () => StartupProgress,
  progress: (state: StartupProgress) => void,
  signal: AbortSignal,
  timeoutMs = 60000
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  let warmFrame: number | undefined;
  for (;;) {
    signal.throwIfAborted();
    const state = read();
    progress(state);
    if (state.total > 0 && state.ready >= state.total) {
      warmFrame ??= state.frame;
      if (state.frame > warmFrame) return;
    }
    if (performance.now() >= deadline) throw new Error('Graphics are taking too long to finish. Reload to try again.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
