import { ClipRegistry } from '$lib/media/ClipRegistry';
import { videoPool } from '$lib/media/VideoPool';
import { hotDeckManager } from '$lib/runtime/decks/hotDeck';
import type { DeckFrameHandleRef } from '$lib/engine/contracts';

/** Bridges clip registration → video pool + hot-deck readiness. */
class MediaRuntime {
  readonly clipRegistry = new ClipRegistry();

  async registerModuleClip(moduleId: string, name: string, url: string, file?: File) {
    const clip = file
      ? this.clipRegistry.registerFile(moduleId, file)
      : this.clipRegistry.registerUrl(moduleId, name, url);

    let lifecycle = hotDeckManager.lifecycle(moduleId);
    if (!lifecycle) {
      hotDeckManager.upsert(moduleId, moduleId, clip.url);
      lifecycle = hotDeckManager.lifecycle(moduleId);
    } else if (lifecycle.canTransition('prepare')) {
      lifecycle.dispatch({ type: 'prepare', slotId: moduleId, sourceId: clip.url });
    }

    try {
      await videoPool.attach(moduleId, clip.url);
      if (moduleId !== 'timesampler' && moduleId !== 'speedramp') {
        videoPool.markFreeRun(moduleId);
      }
      if (lifecycle?.canTransition('resourcesReady')) {
        lifecycle.dispatch({ type: 'resourcesReady' });
      }
      await videoPool.prewarm(moduleId);

      const frame: DeckFrameHandleRef = {
        id: `${moduleId}-frame-${clip.revision}`,
        kind: 'videoFrame',
        sourceId: clip.id,
        deckId: moduleId,
        sourceTimeMs: 0,
        createdAtMs: Date.now(),
        staleAfterMs: null
      };
      if (lifecycle?.canTransition('frameReady')) {
        lifecycle.dispatch({ type: 'frameReady', frame });
      }
    } catch (err) {
      console.warn(`[MediaRuntime] clip attach failed for ${moduleId}:`, err);
      if (lifecycle?.canTransition('prepareFailed')) {
        lifecycle.dispatch({ type: 'prepareFailed', error: String(err) });
      }
    }

    return clip;
  }

  async prewarmModule(moduleId: string) {
    await videoPool.prewarm(moduleId);
  }

  removeModuleClip(moduleId: string) {
    this.clipRegistry.remove(moduleId);
    videoPool.detach(moduleId);
    hotDeckManager.dispose(moduleId);
  }
}

export const mediaRuntime = new MediaRuntime();
