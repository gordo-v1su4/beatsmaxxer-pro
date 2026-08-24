import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  finished: boolean;
}

export interface DesktopUpdaterAdapter {
  check(): Promise<Update | null>;
  relaunch(): Promise<void>;
}

export function reduceDownloadProgress(
  progress: DownloadProgress,
  event: DownloadEvent
): DownloadProgress {
  switch (event.event) {
    case 'Started':
      return {
        downloadedBytes: 0,
        totalBytes: event.data.contentLength,
        finished: false
      };
    case 'Progress':
      return {
        ...progress,
        downloadedBytes: progress.downloadedBytes + event.data.chunkLength
      };
    case 'Finished':
      return {
        ...progress,
        downloadedBytes: progress.totalBytes ?? progress.downloadedBytes,
        finished: true
      };
  }
}

export function downloadPercent(progress: DownloadProgress): number | null {
  if (!progress.totalBytes || progress.totalBytes <= 0) return progress.finished ? 100 : null;
  return Math.max(0, Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100)));
}

/** Load updater bindings only in the native shell; the shared web build never calls this. */
export async function loadDesktopUpdaterAdapter(): Promise<DesktopUpdaterAdapter> {
  const [{ check }, { relaunch }] = await Promise.all([
    import('@tauri-apps/plugin-updater'),
    import('@tauri-apps/plugin-process')
  ]);
  return { check, relaunch };
}
