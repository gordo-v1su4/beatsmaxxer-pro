import { ClipRegistry, type RegisteredClip } from '$lib/media/ClipRegistry';
import {
  videoPool,
  type VideoCandidate,
  type VideoCommitResult
} from '$lib/media/VideoPool';
import { getVideoSourcePort } from '$lib/platform/videoSource';
import { isTauriRuntime } from '$lib/platform/runtime';
import { hotDeckManager, type HotDeckManager } from '$lib/runtime/decks/hotDeck';
import { setClipLoading, setClipReady, setClipError, clearClipStatus } from '$lib/stores/clipStatus';
import {
  currentRackSlotForModule,
  isRackSlotId,
  videoLayers
} from '$lib/stores/rack';
import type { DeckFrameHandleRef } from '$lib/engine/contracts';
import { get } from 'svelte/store';
import { timingActive, allowTimingClip, RIFE_RAMP_ONLY, clipTiming } from '$lib/stores/timing';
import { prepareSlowMotionFile, preparedSlowMotionFile, slotPreparation, clearSlotPreparation } from '$lib/runtime/timing/preparation';
import { identifyInterpolation } from '$lib/runtime/timing/interpolation';

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
  residentFactor?: (source:File|string)=>number|null;
}

export const mediaPublicationHistory: {time:number;slot:string;clip:string|null;stack:string}[]=[];
function publishVideoLayer(sourceId: string, clip: RegisteredClip | null) {
  if(import.meta.env.DEV){
    mediaPublicationHistory.push({time:performance.now(),slot:sourceId,clip:clip?.name??null,stack:new Error().stack??''});
    if(mediaPublicationHistory.length>64)mediaPublicationHistory.shift();
  }
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
  private residentFactor:((source:File|string)=>number|null)|null;

  constructor(dependencies: MediaRuntimeDependencies = {}) {
    this.clipRegistry = dependencies.clipRegistry ?? new ClipRegistry();
    this.pool = dependencies.pool ?? videoPool;
    this.decks = dependencies.decks ?? hotDeckManager;
    this.publish = dependencies.publish ?? publishVideoLayer;
    this.residentFactor=dependencies.residentFactor??null;
    // Dependency-injected runtimes remain generic for isolated lifecycle tests.
    // The production singleton is hard-capped to the ten stable rack slots.
    this.enforceRackSlots = !dependencies.pool && !dependencies.clipRegistry;
  }

  setResidentSourceFactor(factor:((source:File|string)=>number|null)|null){this.residentFactor=factor;}

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
    let target=file;
    if(this.enforceRackSlots&&get(timingActive)&&clipTiming(sourceId).effect==='ramp'){
      const prepared=preparedSlowMotionFile(file);
      if(!prepared||this.residentFactor?.(prepared)==null)return this.prepareAndRegister(sourceId,file);
      target=prepared;
    }
    const current=this.clipRegistry.get(sourceId),factor=this.residentFactor?.(target);
    if(current?.file===target&&this.poolClips.get(sourceId)===current&&factor!=null&&(!get(timingActive)||allowTimingClip(sourceId,factor))){
      // A recall can supersede a pending replacement without remounting the
      // unchanged bank or clearing its selected GPU frame.
      this.bumpGeneration(sourceId);
      clearSlotPreparation(sourceId);setClipReady(sourceId,current.name);
      return Promise.resolve({status:'success',clip:current,previous:current});
    }
    clearSlotPreparation(sourceId);
    return this.registerStaged(sourceId, target.name, () => this.clipRegistry.stageFile(sourceId, target));
  }

  private async prepareAndRegister(sourceId:string,file:File):Promise<ClipRegistrationResult>{
    if(this.disposePromise)await this.disposePromise;
    const generation=this.bumpGeneration(sourceId),previous=this.clipRegistry.get(sourceId);
    setClipLoading(sourceId,file.name);
    slotPreparation.update(s=>({...s,[sourceId]:{state:'working',name:file.name,original:file,stage:'checking-clip',completed:0,total:0}}));
    try{
      const prepared=await prepareSlowMotionFile(file,p=>{
        if(this.isFresh(sourceId,generation))slotPreparation.update(s=>({...s,[sourceId]:{...p,state:'working',name:file.name,original:file}}));
      });
      if(!this.isFresh(sourceId,generation))return {status:'superseded',previous};
      const operation=this.registerStaged(sourceId,file.name,()=>this.clipRegistry.stageFile(sourceId,prepared));
      const attachedGeneration=this.generations.get(sourceId);
      const result=await operation;
      if(this.generations.get(sourceId)===attachedGeneration){
        if(result.status==='failed')slotPreparation.update(s=>({...s,[sourceId]:{...s[sourceId],state:'failed',error:result.error}}));
        else clearSlotPreparation(sourceId);
      }
      return result;
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(this.isFresh(sourceId,generation)){
        setClipError(sourceId,message,file.name);
        slotPreparation.update(s=>({...s,[sourceId]:{...s[sourceId],state:'failed',error:message}}));
      }
      return {status:'failed',error:message,previous};
    }
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
    const operation = this.attachAndCommit(moduleId, generation, clip, previous, predecessor);
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

  private async attachViaHtmlVideo(
    moduleId: string,
    generation: number,
    clip: RegisteredClip,
    previous: RegisteredClip | null,
    interpolationFactor = 1,
    residentCommit?:ReturnType<ClipRegistry['commit']>
  ): Promise<ClipRegistrationResult> {
    let candidate: VideoCandidate | null = null;
    try {
      candidate = await this.pool.prepare(moduleId, clip.url);
      await this.pool.prewarmCandidate(candidate);

      if (!this.isFresh(moduleId, generation)) {
        await this.pool.discardCandidate(candidate);
        this.clipRegistry.releaseReference(clip);
        this.clipRegistry.rollback(clip);
        return { status: 'superseded', previous };
      }

      if(get(timingActive) && !allowTimingClip(moduleId,interpolationFactor))throw new Error(RIFE_RAMP_ONLY);

      this.pool.markFreeRun(moduleId);
      const poolCommit = this.pool.commitCandidate(candidate);
      const committed = residentCommit??this.clipRegistry.commit(clip);
      const previousPoolClip=this.poolClips.get(moduleId);
      this.poolClips.set(moduleId, clip);
      if(!residentCommit)this.publish(moduleId, clip);
      await poolCommit.previousReleased;
      if (previousPoolClip) this.clipRegistry.releaseReference(previousPoolClip);
      try {
        this.markDeckReady(moduleId, clip);
      } catch (error) {
        console.warn(`[MediaRuntime] hot-deck bookkeeping failed for ${moduleId}:`, error);
      }
      setClipReady(moduleId, clip.name);
      return { status: 'success', clip, previous: committed.previous };
    } catch (error) {
      if (candidate) await this.pool.discardCandidate(candidate);
      throw error;
    }
  }

  private async attachAndCommit(
    moduleId: string,
    generation: number,
    clip: RegisteredClip,
    previous: RegisteredClip | null,
    predecessor: Promise<unknown>
  ): Promise<ClipRegistrationResult> {
    if (!this.isFresh(moduleId, generation)) {
      this.clipRegistry.rollback(clip);
      return { status: 'superseded', previous };
    }

    this.clipRegistry.retain(clip);
    let residentCommit:ReturnType<ClipRegistry['commit']>|undefined;
    let heldPrevious:RegisteredClip|null=null;
    try {
      const cachedFactor=get(timingActive)?this.residentFactor?.(clip.file??clip.url):null;
      const interpolationFactor=cachedFactor??(get(timingActive)
        ? await identifyInterpolation(clip.file??clip.url,96) : 1);
      if(!this.isFresh(moduleId,generation)){
        this.clipRegistry.releaseReference(clip);
        this.clipRegistry.rollback(clip);
        return {status:'superseded',previous};
      }
      if(get(timingActive) && !allowTimingClip(moduleId,interpolationFactor))throw new Error(RIFE_RAMP_ONLY);
      if(get(timingActive)&&this.residentFactor?.(clip.file??clip.url)!=null){
        heldPrevious=this.clipRegistry.get(moduleId);
        if(heldPrevious)this.clipRegistry.retain(heldPrevious);
        residentCommit=this.clipRegistry.commit(clip);
        this.publish(moduleId,clip);
        try {this.markDeckReady(moduleId,clip);} catch(error) {
          console.warn(`[MediaRuntime] hot-deck bookkeeping failed for ${moduleId}:`,error);
        }
        setClipReady(moduleId,clip.name);
      }
      // HTML pool changes stay ordered, but a ready resident source must not
      // wait behind a previous decoder before landing at a section boundary.
      await predecessor.catch(()=>{});
      if(!this.isFresh(moduleId,generation)){
        this.clipRegistry.releaseReference(clip);
        this.clipRegistry.rollback(clip);
        return {status:'superseded',previous};
      }
      return await this.attachViaHtmlVideo(moduleId, generation, clip, previous, interpolationFactor,residentCommit);
    } catch (error) {
      if(residentCommit&&this.isFresh(moduleId,generation)&&this.clipRegistry.restoreCurrent(clip,residentCommit.previous))this.publish(moduleId,residentCommit.previous);
      this.clipRegistry.releaseReference(clip);
      this.clipRegistry.rollback(clip);
      const message = String(error);
      if (!this.isFresh(moduleId, generation)) return { status: 'superseded', previous };
      setClipError(moduleId, message, clip.name);
      this.markDeckFailed(moduleId, message);
      return { status: 'failed', error: message, previous };
    }finally{
      if(heldPrevious)this.clipRegistry.releaseReference(heldPrevious);
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
    if (getVideoSourcePort().kind === 'tauri-native') return;
    await this.pool.prewarm(this.resolveSourceId(moduleId));
  }

  async removeModuleClip(moduleId: string) {
    clearSlotPreparation(this.resolveSourceId(moduleId));
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
    for (const id of ids) {this.bumpGeneration(id);clearSlotPreparation(id);}
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
