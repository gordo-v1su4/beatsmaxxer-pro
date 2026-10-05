import { get } from 'svelte/store';
import type { VideoLayer } from '$lib/engine/contracts';
import { RACK_SLOT_IDS, videoLayers } from '$lib/stores/rack';
import type { SceneClip, SectionScene } from '$lib/stores/arrangement';

/**
 * A section's scene: which clip sits in each rack slot while it plays.
 *
 * The bank already says which *effect* each slot runs; this is the other half,
 * so CHORUS 1 can play its own eight clips rather than whatever the verse left
 * loaded. A scene is captured from the live rack — load the clips you want,
 * then capture — and recalled on section entry when AUTO-CLIPS is on.
 */
export function captureScene(layers: Readonly<Record<string, VideoLayer | null>>): SectionScene {
  const slots: Record<string, SceneClip | null> = {};
  for (const slotId of RACK_SLOT_IDS) {
    const layer = layers[slotId];
    slots[slotId] = layer ? { name: layer.name, url: layer.url, file: layer.file } : null;
  }
  return { slots };
}

/** Same clip — by file identity when there is one, since each registration of
 * a file mints a fresh blob URL. */
export function sameClip(a: SceneClip | VideoLayer | null | undefined, b: SceneClip | null | undefined) {
  if (!a || !b) return !a && !b;
  if (a.file || b.file) return a.file === b.file;
  return a.url === b.url;
}

/**
 * Slots whose clip has to change to reach `scene`. Empty slots in the scene are
 * skipped rather than cleared: emptying a slot mid-performance is never what a
 * recall should do, and a scene captured before a slot was loaded would
 * otherwise blank it.
 */
export function sceneChanges(
  scene: SectionScene,
  layers: Readonly<Record<string, VideoLayer | null>>,
): Array<{ slotId: string; clip: SceneClip }> {
  const changes: Array<{ slotId: string; clip: SceneClip }> = [];
  for (const slotId of RACK_SLOT_IDS) {
    const clip = scene.slots[slotId];
    if (!clip) continue;
    if (!sameClip(layers[slotId], clip)) changes.push({ slotId, clip });
  }
  return changes;
}

/** Load the scene's clips into the rack. Only differing slots are touched. */
export async function recallScene(scene: SectionScene): Promise<number> {
  const { mediaRuntime } = await import('$lib/runtime/media/MediaRuntime');
  const changes = sceneChanges(scene, get(videoLayers));
  const results = await Promise.all(
    changes.map(({ slotId, clip }) =>
      clip.file
        ? mediaRuntime.registerModuleFileClip(slotId, clip.file)
        : mediaRuntime.registerModuleClip(slotId, clip.name, clip.url),
    ),
  );
  return results.filter((result) => result.status === 'success').length;
}
