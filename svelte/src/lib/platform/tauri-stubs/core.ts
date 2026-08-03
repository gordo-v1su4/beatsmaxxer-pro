/** Web-build stub — real `@tauri-apps/api/core` is resolved when Tauri sets TAURI_ENV_PLATFORM. */

export async function invoke<T>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  throw new Error('Tauri invoke is unavailable in the web runtime');
}
