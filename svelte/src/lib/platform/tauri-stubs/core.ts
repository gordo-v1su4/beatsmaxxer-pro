/** Web-build stub — real `@tauri-apps/api/core` is resolved when Tauri sets TAURI_ENV_PLATFORM. */

export async function invoke<T>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  throw new Error('Tauri invoke is unavailable in the web runtime');
}

/**
 * `Resource` and `Channel` exist here only to satisfy the bundler.
 *
 * `@tauri-apps/plugin-updater` imports all three names from
 * `@tauri-apps/api/core` at the top of its module, and the web build aliases
 * that specifier to this file. `loadDesktopUpdaterAdapter` imports the plugin
 * dynamically and is only ever called from the native shell, but a dynamic
 * import is still resolved and bundled — so a stub exporting `invoke` alone
 * failed the web production build outright with two MISSING_EXPORTs, while
 * `vite dev` and `svelte-check` both stayed green.
 *
 * Shaped like the real thing rather than as throwing placeholders, because
 * packages subclass Tauri resources at module evaluation time — that happens
 * during bundling, before any guard could decide not to run it. The methods
 * still go nowhere useful off Tauri: `close()` routes through `invoke`, which
 * throws.
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
