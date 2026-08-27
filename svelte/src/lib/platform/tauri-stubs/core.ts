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
 * import is still resolved and bundled — so a stub that exported `invoke`
 * alone failed the web production build outright with two MISSING_EXPORTs,
 * while `vite dev` and `svelte-check` both stayed green.
 *
 * Nothing on the web ever constructs either of these; they are shaped to match
 * the real API so a caller that somehow reached one fails the same way `invoke`
 * does, rather than on a missing property.
 */
export class Resource {
  get rid(): number {
    throw new Error('Tauri Resource is unavailable in the web runtime');
  }

  async close(): Promise<void> {
    throw new Error('Tauri Resource is unavailable in the web runtime');
  }
}

export class Channel<T = unknown> {
  id = 0;
  onmessage: (response: T) => void = () => {};

  toJSON(): string {
    throw new Error('Tauri Channel is unavailable in the web runtime');
  }
}
