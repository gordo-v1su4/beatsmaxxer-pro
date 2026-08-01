import { get, writable } from 'svelte/store';
import { audioEngine } from '$lib/audio';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import {
  pgmSource,
  queuedPgmSource,
  intervalBeats,
  feel,
  autoRandom,
  commitPgmCut
} from '$lib/stores/pgm';
import {
  bypassed,
  currentRackAssignments,
  currentRackModuleForSlot,
  currentRackSlotForModule,
  rackBottom,
  rackTop,
  videoLayers
} from '$lib/stores/rack';

/** Beat-quantized PGM cuts via AudioEngine live schedule — no React rAF promotion. */
class PgmDirector {
  private stopSelection: (() => void) | null = null;
  private unsubs: (() => void)[] = [];
  private liveSourceId: string | null = null;

  start() {
    this.stop();

    this.stopSelection = audioEngine.subscribePgmSelection((source) => {
      const sourceId = currentRackSlotForModule(source);
      if (!sourceId) return;
      this.liveSourceId = sourceId;
      commitPgmCut(source);
      webGpuEngine.setPgmLiveModule(source, sourceId);
    });

    const sync = () => this.syncSchedule();
    this.unsubs = [
      pgmSource.subscribe(sync),
      queuedPgmSource.subscribe(sync),
      intervalBeats.subscribe(sync),
      feel.subscribe(sync),
      autoRandom.subscribe(sync),
      bypassed.subscribe(sync),
      videoLayers.subscribe(sync),
      rackTop.subscribe(sync),
      rackBottom.subscribe(sync)
    ];

    sync();
    this.normalizeSelection();
  }

  stop() {
    this.stopSelection?.();
    this.stopSelection = null;
    this.liveSourceId = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  private playableSources(): string[] {
    const layers = get(videoLayers);
    const bypass = get(bypassed);
    return currentRackAssignments()
      .filter(({ slotId, moduleId }) => !!layers[slotId] && !bypass[moduleId])
      .map(({ moduleId }) => moduleId);
  }

  private syncSchedule() {
    this.normalizeSelection();
    const sources = this.playableSources();
    const active = get(pgmSource);
    const queued = get(queuedPgmSource);
    audioEngine.configurePgmSchedule({
      active,
      sources,
      queued: queued && sources.includes(queued) ? queued : null,
      autoRandom: get(autoRandom),
      intervalBeats: get(intervalBeats),
      feel: get(feel)
    });
  }

  private normalizeSelection() {
    const current = get(pgmSource);
    if (this.liveSourceId) {
      const channelModule = currentRackModuleForSlot(this.liveSourceId);
      if (channelModule && channelModule !== current) {
        commitPgmCut(channelModule);
        webGpuEngine.setPgmLiveModule(channelModule, this.liveSourceId);
        return;
      }
    }
    let sourceId: string | null = currentRackSlotForModule(current);
    if (!sourceId) {
      // A palette replacement changes the effect in-place. Keep the stable
      // channel on air and adopt the replacement effect instead of following
      // stale module identity off rack.
      const replacement = this.liveSourceId
        ? currentRackModuleForSlot(this.liveSourceId)
        : null;
      const fallback = replacement ?? this.playableSources()[0] ?? currentRackAssignments()[0]?.moduleId;
      if (!fallback) return;
      commitPgmCut(fallback);
      sourceId = this.liveSourceId ?? currentRackSlotForModule(fallback);
      if (!sourceId) return;
      this.liveSourceId = sourceId;
      webGpuEngine.setPgmLiveModule(fallback, sourceId);
      return;
    }
    this.liveSourceId = sourceId;
    const queued = get(queuedPgmSource);
    if (queued && !currentRackSlotForModule(queued)) commitPgmCut(current);
    webGpuEngine.setPgmLiveModule(current, sourceId);
  }
}

export const pgmDirector = new PgmDirector();
