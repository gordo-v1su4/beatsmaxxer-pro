import { isTauriRuntime } from '$lib/platform/runtime';

/** Stage an uploaded clip into the app cache and return a filesystem path for native decode. */
export async function stageClipForNative(moduleId: string, file: File): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Native clip staging requires the desktop runtime');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return invoke<string>('stage_clip_file', {
    moduleId,
    fileName: file.name,
    bytes: Array.from(bytes)
  });
}
