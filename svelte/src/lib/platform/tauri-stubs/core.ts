/** Web-build stub — real `@tauri-apps/api/core` is resolved when Tauri sets TAURI_ENV_PLATFORM. */

export async function invoke<T>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  throw new Error('Tauri invoke is unavailable in the web runtime');
}

/**
 * Keep the web alias compatible with packages that subclass Tauri resources at
 * module evaluation time. Resource methods remain unavailable without Tauri.
 */
export class Resource {
  constructor(readonly rid: number) {}

  async close(): Promise<void> {
    return invoke('plugin:resources|close', { rid: this.rid });
  }
}

/**
 * The updater constructs channels only after a native update download starts.
 * This shape lets its module bundle for web without registering Tauri callbacks.
 */
export class Channel<T = unknown> {
  onmessage: (response: T) => void = () => {};
}
