import { get, writable, derived } from 'svelte/store';
import type { ModuleType } from '$lib/engine/contracts';
import { listCatalog, type ModuleDefinition } from '$lib/modules/catalog';
import { rackTop, rackBottom, videoLayers } from '$lib/stores/rack';
import { pgmSource, queuedPgmSource, autoRandom } from '$lib/stores/pgm';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { clipLibrary, addClipsToLibrary, type LibraryClip } from '$lib/stores/clipLibrary';
import { audioEngine } from '$lib/audio';
import { videoPool } from '$lib/media/VideoPool';
import { transportDisplay } from '$lib/stores/transportDisplay';

/**
 * The phone runs a one-slot rack.
 *
 * The desktop rack is ten decode lanes and eleven live WebGPU canvases, which is
 * not a phone workload and is not the phone's idea anyway: one video plays, you
 * page through effects to see what each does to it. So the mobile session
 * rewrites the rack to a single slot and swaps which effect occupies it.
 *
 * Why this works with no engine changes: `videoLayers` is keyed by *slot*, not
 * by module, and `PgmDirector` already follows the stable slot across an effect
 * replacement (see its `normalizeSelection`). Swapping `rackTop[0]` therefore
 * changes the effect while the decoded video underneath keeps playing — no
 * reload, no black frame between modules.
 *
 * Row affinity (`canPlaceInRow`) is deliberately not consulted. top/bottom is a
 * desktop *layout* convention — beat FX above, camera moves below — and the
 * shader does not care which row a module came from. Honouring it here would
 * have forced a second decode lane just to host bottom-row effects.
 */
export const MOBILE_SLOT = 'top-0';

/** Catalog order, so paging left/right walks beat → camera → film predictably. */
export const MOBILE_MODULES: ModuleDefinition[] = listCatalog();
export const MOBILE_MODULE_IDS: string[] = MOBILE_MODULES.map((m) => m.id);

export const activeModuleIndex = writable(0);
export const activeModuleId = derived(activeModuleIndex, (i) =>
  MOBILE_MODULE_IDS[Math.max(0, Math.min(MOBILE_MODULE_IDS.length - 1, i))] ?? MOBILE_MODULE_IDS[0]!
);
export const activeModule = derived(
  activeModuleIndex,
  (i) => MOBILE_MODULES[Math.max(0, Math.min(MOBILE_MODULES.length - 1, i))] ?? MOBILE_MODULES[0]!
);

/** How the stage moves through the chosen clips when one ends. */
export type AdvanceMode = 'hold' | 'linear' | 'random';
export const advanceMode = writable<AdvanceMode>('hold');

/** Clips the operator has picked for this set, in pick order. */
export const clipQueueIds = writable<string[]>([]);
export const clipQueue = derived([clipQueueIds, clipLibrary], ([ids, lib]) =>
  ids.map((id) => lib.find((c) => c.id === id)).filter((c): c is LibraryClip => !!c)
);

/** Which clip is on the stage right now. */
export const stageClipId = writable<string | null>(null);
export const stageClip = derived([stageClipId, clipLibrary], ([id, lib]) =>
  id ? (lib.find((c) => c.id === id) ?? null) : null
);

/** True while a clip swap is in flight, so the stage can show a loading state. */
export const stageLoading = writable(false);

/**
 * Point the one slot at a different effect. The clip stays put.
 */
export function setActiveModuleIndex(index: number) {
  const clamped = Math.max(0, Math.min(MOBILE_MODULE_IDS.length - 1, index));
  const id = MOBILE_MODULE_IDS[clamped];
  if (!id) return;
  activeModuleIndex.set(clamped);
  rackTop.set([id]);
  pgmSource.set(id as ModuleType);
  queuedPgmSource.set(null);
}

export function setActiveModuleById(id: string) {
  const index = MOBILE_MODULE_IDS.indexOf(id);
  if (index >= 0) setActiveModuleIndex(index);
}

/** Paging wraps: the module list is a carousel, not a list with two dead ends. */
export function pageModule(delta: number) {
  const n = MOBILE_MODULE_IDS.length;
  const next = (get(activeModuleIndex) + delta + n) % n;
  setActiveModuleIndex(next);
}

/** Put a clip on the stage. This is the one path that re-decodes. */
export async function loadStageClip(clip: LibraryClip): Promise<boolean> {
  stageLoading.set(true);
  try {
    const result = await mediaRuntime.registerModuleFileClip(MOBILE_SLOT, clip.file);
    if (result?.status !== 'success') return false;
    stageClipId.set(clip.id);
    videoPool.tick(true);
    return true;
  } finally {
    stageLoading.set(false);
  }
}

export async function clearStageClip() {
  await mediaRuntime.removeModuleClip(MOBILE_SLOT);
  stageClipId.set(null);
}

/** Add/remove a clip from the set. Picking the first one also stages it. */
export async function toggleQueuedClip(clip: LibraryClip) {
  const ids = get(clipQueueIds);
  if (ids.includes(clip.id)) {
    clipQueueIds.set(ids.filter((id) => id !== clip.id));
    if (get(stageClipId) === clip.id) await advanceStageClip();
    return;
  }
  clipQueueIds.set([...ids, clip.id]);
  if (!get(stageClipId)) await loadStageClip(clip);
}

/** Next clip per `advanceMode`. Returns false when there is nowhere to go. */
export async function advanceStageClip(force = false): Promise<boolean> {
  const queue = get(clipQueue);
  if (queue.length === 0) {
    await clearStageClip();
    return false;
  }
  const mode = get(advanceMode);
  if (mode === 'hold' && !force) return false;
  if (queue.length === 1) return loadStageClip(queue[0]!);

  const currentId = get(stageClipId);
  const currentIndex = queue.findIndex((c) => c.id === currentId);
  let nextIndex: number;
  if (mode === 'random') {
    // Never re-pick the clip already on screen — a "random" that repeats the
    // same clip reads as the control being broken.
    do {
      nextIndex = Math.floor(Math.random() * queue.length);
    } while (nextIndex === currentIndex);
  } else {
    nextIndex = (currentIndex + 1) % queue.length;
  }
  return loadStageClip(queue[nextIndex]!);
}

/**
 * How often the stage moves to the next clip, in bars.
 *
 * Advancing had to be driven by *something*, and it could not be the clip
 * ending: `VideoPool` sets `video.loop = true`, so a rack clip never fires
 * `ended` — it runs until it is replaced. A musical boundary is the better
 * trigger anyway, and it is what the desktop already does for PGM cuts
 * (`intervalBeats`): the cut lands on the bar rather than whenever a file
 * happens to run out.
 */
export const advanceBars = writable(8);

/**
 * Drives LINEAR / RANDOM off the bar counter. Returns the teardown.
 *
 * Guarded on the bar *crossing* rather than on `bar % n === 0`, because the
 * transport polls at 100ms and a bar at 128bpm lasts 1.9s — the same boundary
 * would otherwise fire nineteen times.
 */
export function startMobileClipAdvance(): () => void {
  let lastBar = -1;
  let inFlight = false;
  return transportDisplay.subscribe((td) => {
    if (!td.playing) return;
    const bar = Math.floor(td.beat / 4);
    if (bar === lastBar) return;
    const previous = lastBar;
    lastBar = bar;
    if (previous < 0) return;
    if (get(advanceMode) === 'hold') return;
    const every = Math.max(1, get(advanceBars));
    if (bar % every !== 0) return;
    if (inFlight) return;
    inFlight = true;
    void advanceStageClip().finally(() => {
      inFlight = false;
    });
  });
}

/**
 * `?qa=1` on the phone.
 *
 * The desktop QA path fans the manifest across every rack slot, which here is
 * one slot and leaves the clip bank empty — so the grid, the queue and the
 * advance modes all have nothing to act on. Pulling the manifest into the
 * library instead gives the phone the same starting state a real import would.
 */
export async function seedMobileQaClips() {
  const res = await fetch('/qa-media/manifest.json');
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const manifest = (await res.json()) as { clips?: string[]; audio?: string };
  const names = manifest.clips ?? [];

  const files = await Promise.all(
    names.map(async (name) => {
      const clipRes = await fetch(`/qa-media/${name}`);
      if (!clipRes.ok) throw new Error(`clip fetch failed: ${name} ${clipRes.status}`);
      const blob = await clipRes.blob();
      return new File([blob], name, { type: blob.type || 'video/webm' });
    })
  );

  const added = await addClipsToLibrary(files);
  const first = added[0] ?? get(clipLibrary)[0];
  if (first) {
    clipQueueIds.set(added.map((c) => c.id));
    await loadStageClip(first);
  }

  if (manifest.audio) {
    const audioRes = await fetch(`/qa-media/${manifest.audio}`);
    if (audioRes.ok) {
      const blob = await audioRes.blob();
      await audioEngine.loadAudioFile(
        new File([blob], manifest.audio, { type: blob.type || 'audio/mpeg' }),
        { hostedAnalysis: true }
      );
    }
  }
}

/**
 * Collapse the rack to one slot for the phone, and hand back the restore.
 *
 * The restore matters for the review path: `?mobile=1` on a desktop browser,
 * then resizing back, must not leave the operator with a one-module rack.
 */
export function enterMobileSession(): () => void {
  const previous = {
    top: get(rackTop),
    bottom: get(rackBottom),
    pgm: get(pgmSource),
    autoRandom: get(autoRandom)
  };

  // Any clip the desktop path had already mounted lives in a slot that is about
  // to stop existing; drop them all so nothing decodes off-screen forever.
  const layers = get(videoLayers);
  for (const slotId of Object.keys(layers)) {
    if (slotId !== MOBILE_SLOT && layers[slotId]) void mediaRuntime.removeModuleClip(slotId);
  }

  rackBottom.set([]);
  autoRandom.set(false);
  const startIndex = Math.max(0, MOBILE_MODULE_IDS.indexOf(previous.pgm));
  setActiveModuleIndex(startIndex);

  return () => {
    rackTop.set(previous.top);
    rackBottom.set(previous.bottom);
    pgmSource.set(previous.pgm);
    autoRandom.set(previous.autoRandom);
  };
}
