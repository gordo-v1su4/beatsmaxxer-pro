import { ClipRegistry } from '$lib/media/ClipRegistry';
import { hotDeckManager } from '$lib/runtime/decks/hotDeck';
import type { DeckFrameHandleRef } from '$lib/engine/contracts';

/** Bridges ClipRegistry registration with hot-deck readiness (no React/HTML video). */
class MediaRuntime {
  readonly clipRegistry = new ClipRegistry();

  registerModuleClip(moduleId: string, name: string, url: string, file?: File) {
    const clip = file
      ? this.clipRegistry.registerFile(moduleId, file)
      : this.clipRegistry.registerUrl(moduleId, name, url);

    let lifecycle = hotDeckManager.lifecycle(moduleId);
    if (!lifecycle) {
      hotDeckManager.upsert(moduleId, moduleId, clip.url);
      lifecycle = hotDeckManager.lifecycle(moduleId);
    } else if (lifecycle.canTransition('prepare')) {
      lifecycle.dispatch({ type: 'prepare', slotId: moduleId, sourceId: clip.url });
    } else if (lifecycle.canTransition('retry')) {
      lifecycle.dispatch({ type: 'retry' });
      if (lifecycle.canTransition('prepare')) {
        lifecycle.dispatch({ type: 'prepare', slotId: moduleId, sourceId: clip.url });
      }
    }

    if (lifecycle?.canTransition('resourcesReady')) {
      lifecycle.dispatch({ type: 'resourcesReady' });
    }

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

    return clip;
  }

  removeModuleClip(moduleId: string) {
    this.clipRegistry.remove(moduleId);
    hotDeckManager.dispose(moduleId);
  }
}

export const mediaRuntime = new MediaRuntime();
