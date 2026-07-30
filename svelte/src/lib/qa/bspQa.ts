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
  bpmLocked: boolean;
  playing: boolean;
  amplitude: number;
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
  analysisError: string | null;
  analysisConfidence: number | null;
  transportSeconds: number;
  soundTouchActive: boolean;
  soundTouch: {
    tempo: number;
    pitchSemitones: number;
    key: string;
    volume: number;
  };
  usingUploadedTrack: boolean;
  trackName: string;
}

function buildSnapshot(): BspQaSnapshot {
  const moduleIds = [...new Set([...get(rackTop), ...get(rackBottom)])];
  const layers = get(videoLayers);
  const statuses = get(clipStatus);
  const audio = audioEngine.getState();
  const caps = get(capabilities);
  const st = audioEngine.getSoundTouchState();

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
    bpmLocked: audio.bpmLocked,
    playing: audio.playing,
    amplitude: audio.amplitude,
    pgmModule: get(pgmSource),
    clipsLoaded: moduleIds.filter((id) => videoPool.hasReadyFrame(id)).length,
    modules,
    analysisStatus: audio.analysisStatus,
    analysisError: audio.analysisError,
    analysisConfidence: audio.analysisConfidence,
    transportSeconds: audio.time,
    soundTouchActive: audioEngine.isSoundTouchActive(),
    soundTouch: {
      tempo: st.tempo,
      pitchSemitones: st.pitchSemitones,
      key: st.key,
      volume: st.volume
    },
    usingUploadedTrack: audio.usingUploadedTrack,
    trackName: audio.trackName
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
    async waitForAnalysis(expected: string | string[] = 'ready', timeoutMs = 90_000) {
      const targets = Array.isArray(expected) ? expected : [expected];
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const snap = buildSnapshot();
        if (targets.includes(snap.analysisStatus)) return snap;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`Timed out waiting for analysis status ${targets.join('|')}`);
    },
    async waitForPlaying(timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (audioEngine.getState().playing) return buildSnapshot();
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('Timed out waiting for playback');
    },
    stopTransport() {
      audioEngine.stop();
      return buildSnapshot();
    },
    async startTransport() {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (!audioEngine.getState().playing) {
        await audioEngine.start();
      }
      return buildSnapshot();
    },
    async exerciseAudioControls() {
      const before = buildSnapshot();
      audioEngine.setTempo(1.35);
      audioEngine.setPitch(2);
      audioEngine.setVolume(0.65);
      audioEngine.cycleKey();
      await new Promise((r) => setTimeout(r, 100));
      const after = buildSnapshot();
      const rateEvents = audioEngine
        .drainTransportEvents()
        .filter((e) => e.type === 'immediate-parameter-change' && e.parameter === 'rate');
      return {
        before,
        after,
        rateEvents: rateEvents.length,
        controlsApplied:
          after.soundTouch.tempo === 1.35 &&
          after.soundTouch.pitchSemitones === 2 &&
          after.soundTouch.key !== before.soundTouch.key &&
          after.soundTouch.volume === 0.65
      };
    },
    async sampleBeatMotion(durationMs = 1500) {
      const samples: Array<{ t: number; beatPhase: number; beat: number; transportSeconds: number }> = [];
      const start = performance.now();
      while (performance.now() - start < durationMs) {
        const s = buildSnapshot();
        samples.push({
          t: performance.now() - start,
          beatPhase: s.beatPhase,
          beat: s.beat,
          transportSeconds: s.transportSeconds
        });
        await new Promise((r) => setTimeout(r, 120));
      }
      const phaseDelta =
        samples.length > 1
          ? Math.abs(samples.at(-1)!.beatPhase - samples[0]!.beatPhase)
          : 0;
      const transportDelta =
        samples.length > 1 ? samples.at(-1)!.transportSeconds - samples[0]!.transportSeconds : 0;
      return { samples, phaseDelta, transportDelta, playing: buildSnapshot().playing };
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
    getEngine() {
      return { webGpuEngine, videoPool, audioEngine };
    }
  };

  (window as Window & { __BSP_QA__?: typeof api }).__BSP_QA__ = api;
  document.documentElement.dataset.bspQa = '1';
}
