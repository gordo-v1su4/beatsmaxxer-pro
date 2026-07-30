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
import { bypassed, videoLayers } from '$lib/stores/rack';
import { listCatalog } from '$lib/modules/catalog';

/** Beat-quantized PGM cuts via AudioEngine live schedule — no React rAF promotion. */
class PgmDirector {
  private stopSelection: (() => void) | null = null;
  private unsubs: (() => void)[] = [];

  start() {
    this.stop();

    this.stopSelection = audioEngine.subscribePgmSelection((source) => {
      commitPgmCut(source);
      webGpuEngine.setPgmLiveModule(source);
    });

    const sync = () => this.syncSchedule();
    this.unsubs = [
      pgmSource.subscribe(sync),
      queuedPgmSource.subscribe(sync),
      intervalBeats.subscribe(sync),
      feel.subscribe(sync),
      autoRandom.subscribe(sync),
      bypassed.subscribe(sync),
      videoLayers.subscribe(sync)
    ];

    sync();
    webGpuEngine.setPgmLiveModule(get(pgmSource));
  }

  stop() {
    this.stopSelection?.();
    this.stopSelection = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  private playableSources(): string[] {
    const layers = get(videoLayers);
    const bypass = get(bypassed);
    return listCatalog()
      .map((m) => m.id)
      .filter((id) => !!layers[id] && !bypass[id]);
  }

  private syncSchedule() {
    audioEngine.configurePgmSchedule({
      active: get(pgmSource),
      sources: this.playableSources(),
      queued: get(queuedPgmSource),
      autoRandom: get(autoRandom),
      intervalBeats: get(intervalBeats),
      feel: get(feel)
    });
  }
}

export const pgmDirector = new PgmDirector();
