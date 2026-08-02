import { ClipRegistry, type RegisteredClip } from '$lib/media/ClipRegistry';
import {
  videoPool,
  type VideoCandidate,
  type VideoCommitResult
} from '$lib/media/VideoPool';
import { getVideoSourcePort } from '$lib/platform/videoSource';
import { isTauriRuntime } from '$lib/platform/runtime';
import { stageClipForNative } from '$lib/platform/nativeClip';
import { hotDeckManager, type HotDeckManager } from '$lib/runtime/decks/hotDeck';
import { setClipLoading, setClipReady, setClipError, clearClipStatus } from '$lib/stores/clipStatus';
import {
  currentRackSlotForModule,
  isRackSlotId,
  videoLayers
} from '$lib/stores/rack';
import type { DeckFrameHandleRef } from '$lib/engine/contracts';

interface MediaPoolPort {
  prepare(moduleId: string, url: string): Promise<VideoCandidate>;
  prewarmCandidate(candidate: VideoCandidate): Promise<void>;
  commitCandidate(candidate: VideoCandidate): VideoCommitResult;
  discardCandidate(candidate: VideoCandidate): Promise<void>;
  prewarm(moduleId: string): Promise<void>;
  markFreeRun(moduleId: string): void;
  detach(moduleId: string): Promise<void>;
  dispose(): Promise<void>;
}

export type ClipRegistrationResult =
  | { status: 'success'; clip: RegisteredClip; previous: RegisteredClip | null }
  | { status: 'failed'; error: string; previous: RegisteredClip | null }
  | { status: 'superseded'; previous: RegisteredClip | null };

export interface MediaRuntimeDependencies {
  clipRegistry?: ClipRegistry;
  pool?: MediaPoolPort;
  decks?: Pick<HotDeckManager, 'lifecycle' | 'upsert' | 'dispose'>;
  publish?: (moduleId: string, clip: RegisteredClip | null) => void;
}

function publishVideoLayer(sourceId: string, clip: RegisteredClip | null) {
  const layer = clip ? { name: clip.name, url: clip.url, file: clip.file } : null;
  videoLayers.update((state) => ({
    ...state,
    [sourceId]: layer
  }));
}

/** Transactional bridge from registry-owned clip URLs to decoded pool media. */
export class MediaRuntime {
  readonly clipRegistry: ClipRegistry;
  private readonly pool: MediaPoolPort;
  private readonly decks: Pick<HotDeckManager, 'lifecycle' | 'upsert' | 'dispose'>;
  private readonly publish: (moduleId: string, clip: RegisteredClip | null) => void;
  private readonly generations = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly poolClips = new Map<string, RegisteredClip>();
  private disposePromise: Promise<void> | null = null;
  private disposed = false;
  private readonly enforceRackSlots: boolean;

  constructor(dependencies: MediaRuntimeDependencies = {}) {
    this.clipRegistry = dependencies.clipRegistry ?? new ClipRegistry();
    this.pool = dependencies.pool ?? videoPool;
    this.decks = dependencies.decks ?? hotDeckManager;
    this.publish = dependencies.publish ?? publishVideoLayer;
    // Dependency-injected runtimes remain generic for isolated lifecycle tests.
    // The production singleton is hard-capped to the eight stable rack slots.
    this.enforceRackSlots = !dependencies.pool && !dependencies.clipRegistry;
  }

  private resolveSourceId(id: string) {
    const sourceId = currentRackSlotForModule(id) ?? id;
    if (this.enforceRackSlots && !isRackSlotId(sourceId)) {
      throw new Error(`media-source-not-in-rack: ${id}`);
    }
    return sourceId;
  }

  registerModuleFileClip(moduleId: string, file: File): Promise<ClipRegistrationResult> {
    let sourceId: string;
    try {
      sourceId = this.resolveSourceId(moduleId);
    } catch (error) {
      return Promise.resolve({ status: 'failed', error: String(error), previous: null });
    }
    return this.registerStaged(sourceId, file.name, () => this.clipRegistry.stageFile(sourceId, file));
  }

  /** URL clips are supported for bundled/QA media; file URLs are always created by ClipRegistry. */
  registerModuleClip(
    moduleId: string,
    name: string,
    url: string,
    file?: File
  ): Promise<ClipRegistrationResult> {
    let sourceId: string;
    try {
      sourceId = this.resolveSourceId(moduleId);
    } catch (error) {
      return Promise.resolve({ status: 'failed', error: String(error), previous: null });
    }
    return file
      ? this.registerModuleFileClip(sourceId, file)
      : this.registerStaged(sourceId, name, () => this.clipRegistry.stageUrl(sourceId, name, url));
  }

  private registerStaged(
    moduleId: string,
    name: string,
    stage: () => RegisteredClip
  ): Promise<ClipRegistrationResult> {
    if (this.disposePromise) {
      return this.disposePromise.then(() => this.registerStaged(moduleId, name, stage));
    }
    this.disposed = false;
    const generation = this.bumpGeneration(moduleId);
    const previous = this.clipRegistry.get(moduleId);
    setClipLoading(moduleId, name);

    let clip: RegisteredClip;
    try {
      clip = stage();
    } catch (error) {
      const message = String(error);
      if (this.isFresh(moduleId, generation)) setClipError(moduleId, message, name);
      return Promise.resolve({ status: 'failed', error: message, previous });
    }

    const predecessor = this.queues.get(moduleId) ?? Promise.resolve();
    const operation = predecessor
      .catch(() => {})
      .then(() => this.attachAndCommit(moduleId, generation, clip, previous));
    const queueTail = operation.then(
      () => {},
      () => {}
    );
    this.queues.set(moduleId, queueTail);
    void queueTail.finally(() => {
      if (this.queues.get(moduleId) === queueTail) this.queues.delete(moduleId);
    });
    return operation;
  }

  private shouldUseNativeDecode(clip: RegisteredClip) {
    return isTauriRuntime() && Boolean(clip.file) && !clip.url.startsWith('http');
  }

  private async attachAndCommit(
    moduleId: string,
    generation: number,
    clip: RegisteredClip,
    previous: RegisteredClip | null
  ): Promise<ClipRegistrationResult> {
    if (!this.isFresh(moduleId, generation)) {
      this.clipRegistry.rollback(clip);
      return { status: 'superseded', previous };
    }

    let candidate: VideoCandidate | null = null;
    this.clipRegistry.retain(clip);
    try {
      if (this.shouldUseNativeDecode(clip)) {
        const path = await stageClipForNative(moduleId, clip.file!);
        const port = getVideoSourcePort();
        await port.attach(moduleId, path);
        if (!this.isFresh(moduleId, generation)) {
          await port.release(moduleId);
          this.clipRegistry.releaseReference(clip);
          this.clipRegistry.rollback(clip);
          return { status: 'superseded', previous };
        }
        this.pool.markFreeRun(moduleId);
        const committed = this.clipRegistry.commit(clip);
        this.poolClips.set(moduleId, clip);
        this.publish(moduleId, clip);
        try {
          this.markDeckReady(moduleId, clip);
        } catch (error) {
          console.warn(`[MediaRuntime] hot-deck bookkeeping failed for ${moduleId}:`, error);
        }
        setClipReady(moduleId, clip.name);
        return { status: 'success', clip, previous: committed.previous };
      }

      candidate = await this.pool.prepare(moduleId, clip.url);
      await this.pool.prewarmCandidate(candidate);

      if (!this.isFresh(moduleId, generation)) {
        await this.pool.discardCandidate(candidate);
        this.clipRegistry.releaseReference(clip);
        this.clipRegistry.rollback(clip);
        return { status: 'superseded', previous };
      }

      this.pool.markFreeRun(moduleId);
      const poolCommit = this.pool.commitCandidate(candidate);
      const committed = this.clipRegistry.commit(clip);
      this.poolClips.set(moduleId, clip);
      this.publish(moduleId, clip);
      await poolCommit.previousReleased;
      if (committed.previous) this.clipRegistry.releaseReference(committed.previous);
      try {
        this.markDeckReady(moduleId, clip);
      } catch (error) {
        console.warn(`[MediaRuntime] hot-deck bookkeeping failed for ${moduleId}:`, error);
      }
      setClipReady(moduleId, clip.name);
      return { status: 'success', clip, previous: committed.previous };
    } catch (error) {
      if (candidate) await this.pool.discardCandidate(candidate);
      this.clipRegistry.releaseReference(clip);
      this.clipRegistry.rollback(clip);
      const message = String(error);
      if (!this.isFresh(moduleId, generation)) return { status: 'superseded', previous };
      setClipError(moduleId, message, clip.name);
      this.markDeckFailed(moduleId, message);
      return { status: 'failed', error: message, previous };
    }
  }

  private markDeckReady(moduleId: string, clip: RegisteredClip) {
    let lifecycle = this.decks.lifecycle(moduleId);
    if (!lifecycle) {
      this.decks.upsert(moduleId, moduleId, clip.url);
      lifecycle = this.decks.lifecycle(moduleId);
    } else if (lifecycle.canTransition('prepare')) {
      lifecycle.dispatch({ type: 'prepare', slotId: moduleId, sourceId: clip.url });
    }
    if (lifecycle?.canTransition('resourcesReady')) lifecycle.dispatch({ type: 'resourcesReady' });
    const frame: DeckFrameHandleRef = {
      id: `${moduleId}-frame-${clip.revision}`,
      kind: 'videoFrame',
      sourceId: clip.id,
      deckId: moduleId,
      sourceTimeMs: 0,
      createdAtMs: Date.now(),
      staleAfterMs: null
    };
    if (lifecycle?.canTransition('frameReady')) lifecycle.dispatch({ type: 'frameReady', frame });
  }

  private markDeckFailed(moduleId: string, error: string) {
    const lifecycle = this.decks.lifecycle(moduleId);
    if (lifecycle?.canTransition('prepareFailed')) {
      lifecycle.dispatch({ type: 'prepareFailed', error });
    }
  }

  async prewarmModule(moduleId: string) {
    await this.pool.prewarm(this.resolveSourceId(moduleId));
  }

  async removeModuleClip(moduleId: string) {
    moduleId = this.resolveSourceId(moduleId);
    this.bumpGeneration(moduleId);
    if (isTauriRuntime()) {
      await getVideoSourcePort().release(moduleId).catch(() => {});
    }
    await this.pool.detach(moduleId);
    const poolClip = this.poolClips.get(moduleId);
    this.poolClips.delete(moduleId);
    this.clipRegistry.remove(moduleId);
    if (poolClip) this.clipRegistry.releaseReference(poolClip);
    this.decks.dispose(moduleId);
    this.publish(moduleId, null);
    clearClipStatus(moduleId);
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    if (this.disposed) return Promise.resolve();
    this.disposed = true;
    const ids = new Set([
      ...this.generations.keys(),
      ...this.poolClips.keys(),
      ...this.clipRegistry.list().map((clip) => clip.id)
    ]);
    for (const id of ids) this.bumpGeneration(id);
    const operation = this.pool.dispose().then(() => {
      for (const clip of this.poolClips.values()) {
        this.clipRegistry.releaseReference(clip);
      }
      for (const id of ids) {
        this.decks.dispose(id);
        this.publish(id, null);
        clearClipStatus(id);
      }
      this.poolClips.clear();
      this.clipRegistry.dispose();
    });
    this.disposePromise = operation;
    void operation.finally(() => {
      if (this.disposePromise === operation) this.disposePromise = null;
    });
    return operation;
  }

  private bumpGeneration(moduleId: string) {
    const generation = (this.generations.get(moduleId) ?? 0) + 1;
    this.generations.set(moduleId, generation);
    return generation;
  }

  private isFresh(moduleId: string, generation: number) {
    return this.generations.get(moduleId) === generation;
  }
}

export const mediaRuntime = new MediaRuntime();
