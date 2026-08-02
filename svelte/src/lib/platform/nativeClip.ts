import { isTauriRuntime } from '$lib/platform/runtime';
import { tauriInvoke } from '$lib/platform/tauriInvoke';

/** Stage an uploaded clip into the app cache and return a filesystem path for native decode. */
export async function stageClipForNative(moduleId: string, file: File): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Native clip staging requires the desktop runtime');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return tauriInvoke<string>('stage_clip_file', {
    moduleId,
    fileName: file.name,
    bytes,
  });
}
