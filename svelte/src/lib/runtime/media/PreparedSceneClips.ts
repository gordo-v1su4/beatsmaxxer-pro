import type { ClipRegistry, RegisteredClip } from '$lib/media/ClipRegistry';
import type { VideoCandidate } from '$lib/media/VideoPool';

export interface UpcomingSceneClip {
  slotId: string;
  clip: { name: string; url: string; file?: File };
  /** At a loop end, decode the loop-start position rather than the end time. */
  positionSeconds?: number;
}

interface PreparationPool {
  prepare(id: string, url: string, signal?: AbortSignal): Promise<VideoCandidate>;
  parkCandidate?(candidate: VideoCandidate, positionSeconds: number): Promise<void>;
  discardCandidate(candidate: VideoCandidate): Promise<void>;
}

interface Entry {
  source: File | string;
  clip: RegisteredClip;
  controller: AbortController;
  candidate?: VideoCandidate;
  ready: boolean;
  error: string | null;
  task: Promise<void>;
}

/** One upcoming scene, prepared serially without publishing or playing it. */
export class PreparedSceneClips {
  private key = '';
  private at = 0;
  private planned: Array<{ slotId: string; source: File | string }> = [];
  private stagingError: string | null = null;
  private entries = new Map<string, Entry>();
  private transferred = new WeakMap<RegisteredClip, VideoCandidate>();
  private tail = Promise.resolve();

  constructor(private registry: ClipRegistry, private pool: PreparationPool) {}

  stage(key: string, sources: readonly UpcomingSceneClip[], at: number) {
    if (!this.pool.parkCandidate) return;
    if (this.key === key && this.at === at && sources.length === this.planned.length &&
      sources.every(({ slotId, clip }, i) => this.planned[i].slotId === slotId &&
        this.planned[i].source === (clip.file ?? clip.url))) return;
    void this.clear();
    this.key = key; this.at = at;
    this.planned = sources.map(({ slotId, clip }) => ({ slotId, source: clip.file ?? clip.url }));
    for (const { slotId, clip: source, positionSeconds } of sources) {
      let clip: RegisteredClip;
      try {
        clip = source.file ? this.registry.stageFile(slotId, source.file)
          : this.registry.stageUrl(slotId, source.name, source.url);
      } catch (error) { this.stagingError = String(error); continue; }
      const entry: Entry = { source: source.file ?? source.url, clip,
        controller: new AbortController(), ready: false, error: null, task: Promise.resolve() };
      this.entries.set(slotId, entry);
      entry.task = this.tail.then(async () => {
        if (entry.controller.signal.aborted) return;
        entry.candidate = await this.pool.prepare(slotId, clip.url, entry.controller.signal);
        if (entry.controller.signal.aborted) return;
        await this.pool.parkCandidate!(entry.candidate, positionSeconds ?? at);
        entry.ready = !entry.controller.signal.aborted;
      }).catch(error => {
        if (!entry.controller.signal.aborted) entry.error = String(error);
      }).finally(async () => {
        if (!entry.ready || entry.controller.signal.aborted) await this.releaseEntry(entry);
      });
      this.tail = entry.task.catch(() => {});
    }
  }

  /** Transfer a ready staged URL and decoder into the normal commit transaction. */
  take(slotId: string, source: File | string): RegisteredClip | null {
    const entry = this.entries.get(slotId);
    if (!entry) return null;
    this.entries.delete(slotId);
    if (entry.source !== source || !entry.ready || !entry.candidate) {
      void this.cancel(entry); return null;
    }
    this.transferred.set(entry.clip, entry.candidate);
    return entry.clip;
  }

  candidateFor(clip: RegisteredClip) { return this.transferred.get(clip); }

  async releaseTransfer(clip: RegisteredClip) {
    const candidate = this.transferred.get(clip);
    this.transferred.delete(clip);
    if (candidate) await this.pool.discardCandidate(candidate);
  }

  clear(): Promise<void> {
    this.key = '';
    this.planned = []; this.stagingError = null;
    const entries = [...this.entries.values()]; this.entries.clear();
    return Promise.all(entries.map(entry => this.cancel(entry))).then(() => {});
  }

  get diagnostics() {
    return { key: this.key, at: this.at, ready: [...this.entries.values()].filter(e => e.ready).length,
      pending: [...this.entries.values()].filter(e => !e.ready && !e.error).length,
      errors: [...(this.stagingError ? [this.stagingError] : []),
        ...[...this.entries.values()].flatMap(e => e.error ? [e.error] : [])] };
  }

  private async cancel(entry: Entry) {
    entry.controller.abort();
    if (entry.candidate) await this.pool.discardCandidate(entry.candidate);
    await entry.task;
    await this.releaseEntry(entry);
  }

  private async releaseEntry(entry: Entry) {
    if (entry.candidate) await this.pool.discardCandidate(entry.candidate);
    this.registry.rollback(entry.clip);
  }
}
