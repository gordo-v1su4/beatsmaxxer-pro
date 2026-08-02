import { audioEngine } from '$lib/audio';
import { videoPool } from '$lib/media/VideoPool';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { activeRackSlotIds } from '$lib/stores/rack';
import { isTauriRuntime } from '$lib/platform/runtime';

export interface QaManifest {
  clips?: string[];
  audio?: string;
}

export async function loadQaMediaFromManifest(manifest: QaManifest) {
  const clips = manifest.clips ?? [];
  const slotIds = activeRackSlotIds();
  const errors: string[] = [];

  for (let i = 0; i < slotIds.length; i++) {
    const clip = clips[i % clips.length];
    if (!clip) continue;
    const slotId = slotIds[i];
    const url = `/qa-media/${clip}`;
    try {
      let file: File | undefined;
      if (isTauriRuntime()) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`clip fetch failed: ${response.status}`);
        const blob = await response.blob();
        file = new File([blob], clip, { type: blob.type || 'video/mp4' });
      }
      const result = await mediaRuntime.registerModuleClip(slotId, clip, url, file);
      if (result.status !== 'success') {
        throw new Error(result.status === 'failed' ? result.error : result.status);
      }
      await videoPool.prewarm(slotId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${slotId}: ${msg}`);
      console.error(`[QA] clip load failed for ${slotId} (${clip}):`, err);
    }
  }

  videoPool.tick(true);

  if (manifest.audio) {
    try {
      await audioEngine.loadAudioUrl(`/qa-media/${manifest.audio}`, manifest.audio);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`audio: ${msg}`);
      console.error('[QA] audio load failed:', err);
    }
  }

  if (errors.length > 0) {
    throw new Error(`QA media partial failure:\n${errors.join('\n')}`);
  }
}

export async function fetchAndLoadQaMedia() {
  const res = await fetch('/qa-media/manifest.json');
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const manifest = (await res.json()) as QaManifest;
  await loadQaMediaFromManifest(manifest);
  return manifest;
}
