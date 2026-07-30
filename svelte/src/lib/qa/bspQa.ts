import { get } from 'svelte/store';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { videoPool } from '$lib/media/VideoPool';
import { audioEngine } from '$lib/audio';
import { clipStatus } from '$lib/stores/clipStatus';
import { rackTop, rackBottom, videoLayers } from '$lib/stores/rack';
import { pgmSource } from '$lib/stores/pgm';
import { capabilities } from '$lib/stores/capabilities';

export interface BspQaSnapshot {
  webgpu: boolean;
  beatPhase: number;
  beat: number;
  bpm: number;
  playing: boolean;
  pgmModule: string;
  clipsLoaded: number;
  modules: Record<
    string,
    {
      hasReadyFrame: boolean;
      clipStatus: string;
      clipName: string | null;
      videoWidth: number;
      videoHeight: number;
      currentTime: number;
    }
  >;
  analysisStatus: string;
  transportSeconds: number;
  soundTouchActive: boolean;
}

function buildSnapshot(): BspQaSnapshot {
  const moduleIds = [...new Set([...get(rackTop), ...get(rackBottom)])];
  const layers = get(videoLayers);
  const statuses = get(clipStatus);
  const audio = audioEngine.getState();
  const caps = get(capabilities);

  const modules: BspQaSnapshot['modules'] = {};
  for (const id of moduleIds) {
    const v = videoPool.get(id);
    modules[id] = {
      hasReadyFrame: videoPool.hasReadyFrame(id),
      clipStatus: statuses[id]?.status ?? 'idle',
      clipName: layers[id]?.name ?? null,
      videoWidth: v?.videoWidth ?? 0,
      videoHeight: v?.videoHeight ?? 0,
      currentTime: v?.currentTime ?? 0
    };
  }

  return {
    webgpu: caps.webgpu,
    beatPhase: audio.beatPhase,
    beat: audio.beat,
    bpm: audio.bpm,
    playing: audio.playing,
    pgmModule: get(pgmSource),
    clipsLoaded: moduleIds.filter((id) => videoPool.hasReadyFrame(id)).length,
    modules,
    analysisStatus: audio.analysisStatus,
    transportSeconds: audio.time,
    soundTouchActive: audioEngine.isSoundTouchActive()
  };
}

export function installBspQaHook() {
  if (typeof window === 'undefined') return;

  const api = {
    snapshot: buildSnapshot,
    async waitForClips(count = 8, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const snap = buildSnapshot();
        if (snap.clipsLoaded >= count) return snap;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`Timed out waiting for ${count} ready clips`);
    },
    async waitForPlaying(timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (audioEngine.getState().playing) return buildSnapshot();
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('Timed out waiting for playback');
    },
    sampleCanvasPixel(canvasId: string) {
      const canvas = document.querySelector(
        `[data-canvas-id="${canvasId}"]`
      ) as HTMLCanvasElement | null;
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { method: 'webgpu-only' as const };
      const w = canvas.width;
      const h = canvas.height;
      if (w < 1 || h < 1) return { r: 0, g: 0, b: 0, w, h };
      const d = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], w, h };
    },
    async startTransport() {
      await audioEngine.start();
      return buildSnapshot();
    },
    getEngine() {
      return { webGpuEngine, videoPool, audioEngine };
    }
  };

  (window as Window & { __BSP_QA__?: typeof api }).__BSP_QA__ = api;
  document.documentElement.dataset.bspQa = '1';
}
