import { isTauriRuntime } from '$lib/platform/runtime';

/** Stage an uploaded clip into the app cache and return a filesystem path for native decode. */
export async function stageClipForNative(moduleId: string, file: File): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Native clip staging requires the desktop runtime');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('stage_clip_file', bytes, {
    headers: {
      'x-bsp-module-id': moduleId,
      'x-bsp-file-name': encodeURIComponent(file.name)
    }
  });
}
