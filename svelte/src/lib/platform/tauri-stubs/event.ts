/** Web-build stub — real `@tauri-apps/api/event` is resolved when Tauri sets TAURI_ENV_PLATFORM. */

export type UnlistenFn = () => void;

export async function listen<T>(
  _event: string,
  _handler: (event: { payload: T }) => void
): Promise<UnlistenFn> {
  throw new Error('Tauri listen is unavailable in the web runtime');
}
