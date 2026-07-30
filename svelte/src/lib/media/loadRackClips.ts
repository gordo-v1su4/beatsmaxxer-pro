import { get } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { videoPool } from '$lib/media/VideoPool';
import { isVideoFile } from '$lib/media/videoFile';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { rackTop, rackBottom, videoLayers } from '$lib/stores/rack';

function rackClipTargets(clips: File[], startId?: string): string[] {
  const slotIds = [...get(rackTop), ...get(rackBottom)];
  const current = get(videoLayers);
  const targets: string[] = startId ? [startId] : [];

  for (const id of slotIds) {
    if (targets.length >= clips.length) break;
    if (startId && id === startId) continue;
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

async function setModuleVideo(id: string, file: File) {
  const layers = get(videoLayers);
  const prev = layers[id];
  if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);

  const url = URL.createObjectURL(file);
  videoLayers.update((state) => ({
    ...state,
    [id]: { name: file.name, url, file }
  }));
  try {
    await mediaRuntime.registerModuleClip(id, file.name, url, file);
    await videoPool.prewarm(id);
  } catch (err) {
    console.error(`[clip] failed to load video for ${id}:`, err);
    throw err;
  }
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

  await Promise.all(
    targets.map((moduleId, index) => {
      const file = clips[index];
      return file ? setModuleVideo(moduleId, file) : Promise.resolve();
    })
  );
  await finishClipLoad();
  return { loaded: targets.length, targets };
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
