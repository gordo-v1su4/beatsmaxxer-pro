import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { videoPool } from '$lib/media/VideoPool';
import { isVideoFile } from '$lib/media/videoFile';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import {
  currentRackSlotForModule,
  activeRackSlotIds,
  videoLayers
} from '$lib/stores/rack';

function rackClipTargets(clips: File[], startId?: string): string[] {
  const slotIds = activeRackSlotIds();
  const current = get(videoLayers);
  const resolvedStart = startId ? (currentRackSlotForModule(startId) ?? startId) : undefined;
  const targets: string[] = resolvedStart ? [resolvedStart] : [];

  for (const id of slotIds) {
    if (targets.length >= clips.length) break;
    if (resolvedStart && id === resolvedStart) continue;
    if (current[id]) continue;
    targets.push(id);
  }
  if (targets.length < clips.length) {
    for (const id of slotIds) {
      if (targets.length >= clips.length) break;
      if (targets.includes(id)) continue;
      targets.push(id);
    }
  }
  return targets;
}

async function setSlotVideo(id: string, file: File) {
  return mediaRuntime.registerModuleFileClip(id, file);
}

async function finishClipLoad() {
  videoPool.tick(true);
  if (!audioEngine.getState().playing) {
    await audioEngine.start();
  }
}

/** Same path as TopBar CLIPS — fill rack slots from local File objects. */
export async function loadRackClipsFromFiles(files: File[], startId?: string) {
  const clips = files.filter(isVideoFile);
  if (clips.length === 0) return { loaded: 0, targets: [] as string[] };

  const targets = rackClipTargets(clips, startId);
  if (targets.length === 0) return { loaded: 0, targets: [] as string[] };

  const results = await Promise.all(
    targets.map((slotId, index) => {
      const file = clips[index];
      return file ? setSlotVideo(slotId, file) : Promise.resolve();
    })
  );
  const loadedTargets = targets.filter((_, index) => results[index]?.status === 'success');
  if (loadedTargets.length > 0) await finishClipLoad();
  return { loaded: loadedTargets.length, targets: loadedTargets, results };
}

/** QA helper — fetch manifest clips as File objects (simulates CLIPS picker). */
export async function fetchManifestClipFiles(max = 8): Promise<File[]> {
  const res = await fetch('/qa-media/manifest.json');
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const manifest = (await res.json()) as { clips?: string[] };
  const names = (manifest.clips ?? []).slice(0, max);
  return Promise.all(
    names.map(async (name) => {
      const clipRes = await fetch(`/qa-media/${name}`);
      if (!clipRes.ok) throw new Error(`clip fetch failed: ${name} ${clipRes.status}`);
      const blob = await clipRes.blob();
      return new File([blob], name, { type: blob.type || 'video/mp4' });
    })
  );
}
