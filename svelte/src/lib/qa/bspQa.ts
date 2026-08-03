import { get } from 'svelte/store';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { videoPool } from '$lib/media/VideoPool';
import { audioEngine } from '$lib/audio';
import { clipStatus } from '$lib/stores/clipStatus';
import { rackTop, rackBottom, videoLayers, moduleParams, updateParam, updateParams, clearParams, bypassed, assignModuleToSlot, currentRackSlotForModule, activeRackSlotIds, RACK_SLOT_IDS } from '$lib/stores/rack';
import { pgmSource, cutImmediate } from '$lib/stores/pgm';
import { capabilities } from '$lib/stores/capabilities';
import { listCatalog } from '$lib/modules/catalog';
import { MODULE_PRESETS } from '$lib/modules/presets';
import { SHADER_EFFECT_MODE } from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import { fetchManifestClipFiles, loadRackClipsFromFiles } from '$lib/media/loadRackClips';
import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
import { audioTimeline } from '$lib/transport';
import { moduleCollapsed, fxLibOpen, pgmRailOpen } from '$lib/stores/rackUi';
import { reduceSerialVisualProofSelection } from '$lib/qa/visualProof';
import { getLatencySamples } from '$lib/qa/performance';

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
      playbackRate: number;
    }
  >;
  /** Per-module renderer state — what the GPU actually did last frame. */
  render: Record<string, unknown>;
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
  uploadedTrackLoadGeneration: number;
  params: Record<string, Record<string, number>>;
}

export function visualProofExpectedMediaTime(
  moduleId: string,
  transportSeconds: number,
  durationSeconds: number,
  timeSamplerSourceSeconds?: number
) {
  const sourceSeconds = moduleId === 'timesampler' && Number.isFinite(timeSamplerSourceSeconds)
    ? timeSamplerSourceSeconds!
    : transportSeconds;
  return ((sourceSeconds % durationSeconds) + durationSeconds) % durationSeconds;
}

export function visualProofSlotForModule(moduleId: string) {
  const mod = listCatalog().find((item) => item.id === moduleId);
  if (!mod) return null;
  const row = mod.row === 'bottom' ? 'bottom' as const : 'top' as const;
  const eligible = listCatalog().filter((item) => item.row === row || item.row === 'both');
  const eligibleIndex = eligible.findIndex((item) => item.id === moduleId);
  return `${row}-${Math.max(0, eligibleIndex) % 4}`;
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
    const sourceId = currentRackSlotForModule(id);
    const v = sourceId ? videoPool.get(sourceId) : undefined;
    modules[id] = {
      hasReadyFrame: sourceId ? videoPool.hasReadyFrame(sourceId) : false,
      clipStatus: sourceId ? statuses[sourceId]?.status ?? 'idle' : 'idle',
      clipName: sourceId ? layers[sourceId]?.name ?? null : null,
      videoWidth: v?.videoWidth ?? 0,
      videoHeight: v?.videoHeight ?? 0,
      currentTime: v?.currentTime ?? 0,
      playbackRate: v?.playbackRate ?? 1
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
    clipsLoaded: moduleIds.filter((id) => {
      const sourceId = currentRackSlotForModule(id);
      return sourceId ? videoPool.hasReadyFrame(sourceId) : false;
    }).length,
    modules,
    render: webGpuEngine.getRenderDiagnostics(),
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
    trackName: audio.trackName,
    uploadedTrackLoadGeneration: audioEngine.getUploadedTrackLoadGeneration(),
    params: get(moduleParams)
  };
}

export function installBspQaHook() {
  if (typeof window === 'undefined') return;

  const eightVideoElementIds = new WeakMap<HTMLVideoElement, string>();
  let nextEightVideoElementId = 0;
  const eightVideoCanvasIds = new WeakMap<HTMLCanvasElement, string>();
  let nextEightVideoCanvasId = 0;
  const eightVideoIdentity = (video: HTMLVideoElement) => {
    let identity = eightVideoElementIds.get(video);
    if (!identity) {
      identity = `rack-video-${++nextEightVideoElementId}`;
      eightVideoElementIds.set(video, identity);
    }
    return identity;
  };
  const eightVideoCanvasIdentity = (canvas: HTMLCanvasElement) => {
    let identity = eightVideoCanvasIds.get(canvas);
    if (!identity) {
      identity = `rack-canvas-${++nextEightVideoCanvasId}`;
      eightVideoCanvasIds.set(canvas, identity);
    }
    return identity;
  };

  const rackSlotEntries = () => {
    const top = get(rackTop);
    return [
      ...top.map((moduleId, slotIndex) => ({ row: 'top' as const, slotIndex, canvasId: `top-${slotIndex}`, moduleId })),
      ...get(rackBottom).map((moduleId, slotIndex) => ({ row: 'bottom' as const, slotIndex, canvasId: `bottom-${slotIndex}`, moduleId }))
    ];
  };
  const videoForRackSlot = (canvasId: string) => videoPool.get(canvasId);
  const targetForRackSlot = (canvasId: string) => videoPool.getTimelineTarget(canvasId);
  const visualProofInitialRack = { top: [...get(rackTop)], bottom: [...get(rackBottom)] };
  const visualProofModuleSlots = new Map<string, string>();
  const ensureVisualProofModuleSlot = (moduleId: string) => {
    const mod = listCatalog().find((item) => item.id === moduleId);
    if (!mod) throw new Error(`Unknown visual-proof module: ${moduleId}`);
    const slotId = visualProofSlotForModule(moduleId)!;
    const [row, index] = slotId.split('-');
    const slotIndex = Number(index);
    if (currentRackSlotForModule(moduleId) !== slotId) {
      const accepted = assignModuleToSlot(row as 'top' | 'bottom', slotIndex, moduleId);
      if (!accepted || currentRackSlotForModule(moduleId) !== slotId) {
        throw new Error(`Could not assign ${moduleId} to stable proof slot ${slotId}`);
      }
    }
    visualProofModuleSlots.set(moduleId, slotId);
    return slotId;
  };

  let visualProofRealFiles: File[] = [];
  let visualProofSelectionGeneration = 0;
  let visualProofSelectionError = '';
  let visualProofSelectionHash: Promise<string> = Promise.resolve('');
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.accept.startsWith('video/')) return;
    const next = reduceSerialVisualProofSelection({
      generation: visualProofSelectionGeneration,
      files: visualProofRealFiles,
      error: visualProofSelectionError
    }, input.files ?? []);
    if (next.generation === visualProofSelectionGeneration) return;
    visualProofSelectionGeneration = next.generation;
    visualProofRealFiles = next.files;
    visualProofSelectionError = next.error;
    if (visualProofRealFiles[0]) {
      const selected = visualProofRealFiles[0];
      visualProofSelectionHash = selected.arrayBuffer().then(async (bytes) => {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      });
    } else {
      visualProofSelectionHash = Promise.resolve('');
    }
  }, { capture: true });
  const proofOverlay = document.createElement('div');
  proofOverlay.dataset.bspRealMediaOverlay = 'true';
  proofOverlay.style.cssText = 'display:none;position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;background:#05070aee;border:2px solid #22d3ee;color:#fff;font:700 15px/1.2 ui-monospace,monospace;letter-spacing:.04em;box-shadow:0 0 24px #22d3ee88;pointer-events:none';
  document.body.appendChild(proofOverlay);

  const api = {
    snapshot: buildSnapshot,
    /** Assign a module to a rack slot through the production domain path. */
    assignModule(row: 'top' | 'bottom', slotIndex: number, moduleId: string) {
      return assignModuleToSlot(row, slotIndex, moduleId);
    },
    /** Load a QA-served clip into a specific rack slot (drives the add-slot flow). */
    async loadClipIntoSlot(slotId: string, clipName: string) {
      const url = `/qa-media/${clipName}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`clip fetch failed: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], clipName, { type: blob.type || 'video/mp4' });
      const result = await mediaRuntime.registerModuleClip(slotId, clipName, url, file);
      await videoPool.prewarm(slotId);
      videoPool.tick(true);
      return result.status;
    },
    /** PGM cut latency (scheduler decision -> first submitted PGM frame), ms. */
    cutLatency() {
      const cuts = getLatencySamples().filter((s) => s.label === 'pgm-cut');
      const sorted = cuts.map((s) => s.ms).sort((a, b) => a - b);
      const p = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
      return {
        count: sorted.length,
        mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
        p50: p(0.5),
        p95: p(0.95),
        max: sorted.length ? sorted[sorted.length - 1] : 0,
        samples: sorted
      };
    },
    async prepareEightVideoBenchmark(timeoutMs = 60_000) {
      const slots = rackSlotEntries();
      if (slots.length !== 8) throw new Error(`Eight-video benchmark requires exactly 8 rack slots; found ${slots.length}`);
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (slots.every(({ canvasId }) => videoPool.hasReadyFrame(canvasId))) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!slots.every(({ canvasId }) => videoPool.hasReadyFrame(canvasId))) throw new Error('Timed out waiting for eight concurrent decoded clips');
      for (const { canvasId } of slots) videoPool.markFreeRun(canvasId);
      if (!audioEngine.getState().playing) await audioEngine.start();
      videoPool.tick(audioTimeline.getLastFrame() ?? true);
      return this.eightVideoSnapshot();
    },
    eightVideoSnapshot() {
      const top = get(rackTop);
      const ids = [...top, ...get(rackBottom)];
      const layers = get(videoLayers);
      const diagnostics = webGpuEngine.getRenderDiagnostics();
      const frame = audioTimeline.getLastFrame();
      if (!frame) throw new Error('Eight-video diagnostics require an active shared timeline');
      const slots = ids.map((moduleId, index) => {
        const canvasId = index < top.length ? `top-${index}` : `bottom-${index - top.length}`;
        const video = videoPool.get(canvasId);
        if (!video) throw new Error(`Eight-video rack slot has no HTMLVideoElement: ${canvasId}`);
        const render = diagnostics[canvasId] as {
          source?: string | null; externalTextureImported?: boolean; externalTextureBound?: boolean;
          cachedTextureUploaded?: boolean; cachedTextureBound?: boolean; samplePath?: string; frameId?: number | null;
          renderCount?: number; skippedRenderCount?: number; targetFps?: number; frameIntervalMs?: number | null;
        } | undefined;
        const quality = typeof video.getVideoPlaybackQuality === 'function'
          ? video.getVideoPlaybackQuality()
          : { totalVideoFrames: 0, droppedVideoFrames: 0 };
        const duration = video.duration;
        const target = videoPool.getTimelineTarget(canvasId) ?? (Number.isFinite(duration) && duration > 0
          ? ((frame.positionSeconds % duration) + duration) % duration : video.currentTime);
        let drift = target - video.currentTime;
        if (Number.isFinite(duration) && duration > 0 && Math.abs(drift) > duration / 2) {
          drift += drift > 0 ? -duration : duration;
        }
        return {
          moduleId,
          canvasId,
          fileName: layers[canvasId]?.name ?? '',
          elementIdentity: eightVideoIdentity(video),
          currentSrc: video.currentSrc,
          readyState: video.readyState,
          paused: video.paused,
          currentTime: video.currentTime,
          duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          totalVideoFrames: quality.totalVideoFrames,
          droppedVideoFrames: quality.droppedVideoFrames,
          driftSeconds: drift,
          render: {
            source: render?.source ?? null,
            externalTextureImported: render?.externalTextureImported === true,
            externalTextureBound: render?.externalTextureBound === true,
            cachedTextureUploaded: render?.cachedTextureUploaded === true,
            cachedTextureBound: render?.cachedTextureBound === true,
            samplePath: render?.samplePath ?? '',
            frameId: render?.frameId ?? null,
            renderCount: render?.renderCount ?? 0,
            skippedRenderCount: render?.skippedRenderCount ?? 0,
            targetFps: render?.targetFps ?? 0,
            frameIntervalMs: render?.frameIntervalMs ?? null
          }
        };
      });
      return {
        decoderCount: rackSlotEntries().filter(({ canvasId }) => !!videoPool.get(canvasId)).length,
        documentVideoCount: document.querySelectorAll('video').length,
        timelineGeneration: frame.generation,
        timelineFrameId: frame.frameId,
        transportSeconds: frame.transportSeconds,
        maxDriftSeconds: Math.max(...slots.map((slot) => Math.abs(slot.driftSeconds))),
        slots
      };
    },
    catalogHotSwapCatalog() {
      return listCatalog().map((mod) => ({
        moduleId: mod.id,
        row: mod.row,
        shaderKey: mod.shaderKey ?? mod.id,
        effectMode: SHADER_EFFECT_MODE[mod.shaderKey ?? mod.id] ?? Number.NaN
      }));
    },
    catalogHotSwapSnapshot(phase: 'before' | 'settle' = 'settle', elapsedMs = 0) {
      const frame = audioTimeline.getLastFrame();
      if (!frame) throw new Error('Catalog hot-swap diagnostics require an active shared timeline');
      const diagnostics = webGpuEngine.getRenderDiagnostics();
      const slots = rackSlotEntries().map(({ canvasId, moduleId }) => {
        const video = videoForRackSlot(canvasId);
        const canvas = document.querySelector(`[data-canvas-id="${canvasId}"]`);
        if (!video) throw new Error(`Catalog hot-swap slot has no HTMLVideoElement: ${canvasId}`);
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Catalog hot-swap slot has no stable canvas: ${canvasId}`);
        const render = diagnostics[canvasId] as unknown as Record<string, unknown> | undefined;
        const duration = video.duration;
        const target = targetForRackSlot(canvasId) ?? (Number.isFinite(duration) && duration > 0
          ? ((frame.positionSeconds % duration) + duration) % duration : video.currentTime);
        let drift = target - video.currentTime;
        if (Number.isFinite(duration) && duration > 0 && Math.abs(drift) > duration / 2) {
          drift += drift > 0 ? -duration : duration;
        }
        const quality = typeof video.getVideoPlaybackQuality === 'function'
          ? video.getVideoPlaybackQuality()
          : { totalVideoFrames: 0 };
        return {
          canvasId,
          canvasIdentity: eightVideoCanvasIdentity(canvas),
          moduleId,
          sourceId: String(render?.sourceId ?? canvasId),
          elementIdentity: eightVideoIdentity(video),
          currentSrc: video.currentSrc,
          currentTime: video.currentTime,
          totalVideoFrames: quality.totalVideoFrames,
          driftSeconds: drift,
          renderCount: Number(render?.renderCount ?? 0),
          bindingId: String(render?.bindingId ?? ''),
          renderedModuleId: String(render?.effectModuleId ?? render?.moduleId ?? ''),
          renderedSourceId: String(render?.sourceId ?? ''),
          effectMode: Number(render?.effectMode ?? Number.NaN),
          rendererSource: typeof render?.source === 'string' ? render.source : null,
          samplePath: String(render?.samplePath ?? ''),
          cachedTextureBound: render?.cachedTextureBound === true
        };
      });
      return {
        phase,
        elapsedMs,
        decoderCount: rackSlotEntries().filter(({ canvasId }) => !!videoForRackSlot(canvasId)).length,
        documentVideoCount: document.querySelectorAll('video').length,
        timelineGeneration: frame.generation,
        timelineFrameId: frame.frameId,
        transportSeconds: frame.transportSeconds,
        slots
      };
    },
    catalogHotSwapBaseline() {
      const snapshot = this.catalogHotSwapSnapshot('before', 0);
      return {
        decoderCount: snapshot.decoderCount,
        documentVideoCount: snapshot.documentVideoCount,
        timelineGeneration: snapshot.timelineGeneration,
        slots: snapshot.slots.map(({ canvasId, canvasIdentity, elementIdentity, currentSrc, sourceId }) =>
          ({ canvasId, canvasIdentity, elementIdentity, currentSrc, sourceId }))
      };
    },
    async stressCatalogModule(moduleId: string, preferredSlotIndex: number, settleMs = 1_000) {
      const def = listCatalog().find((item) => item.id === moduleId);
      if (!def) throw new Error(`Unknown catalog module: ${moduleId}`);
      const row = def.row === 'bottom' ? 'bottom' as const : 'top' as const;
      const rowSlots = row === 'top' ? get(rackTop) : get(rackBottom);
      if (rowSlots.length < 2) throw new Error(`Catalog hot-swap requires at least two ${row} slots`);
      let slotIndex = ((preferredSlotIndex % rowSlots.length) + rowSlots.length) % rowSlots.length;
      if (rowSlots[slotIndex] === moduleId) slotIndex = (slotIndex + 1) % rowSlots.length;

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const before = this.catalogHotSwapSnapshot('before', 0);
      const accepted = assignModuleToSlot(row, slotIndex, moduleId);
      const start = performance.now();
      const samples = [before];
      const settleDurationMs = Math.min(5_000, Math.max(1_000, settleMs));
      do {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(this.catalogHotSwapSnapshot('settle', performance.now() - start));
      } while (performance.now() - start < settleDurationMs);

      const selectedCanvasId = `${row}-${slotIndex}`;
      const selectedSlot = samples.at(-1)?.slots.find((slot) => slot.canvasId === selectedCanvasId);
      const selectedVideo = selectedSlot ? videoForRackSlot(selectedCanvasId) : undefined;
      if (!selectedSlot || !selectedVideo) throw new Error(`Selected swap slot is unavailable: ${selectedCanvasId}`);
      cutImmediate(moduleId);
      webGpuEngine.setPgmLiveModule(moduleId, selectedCanvasId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const pgmRender = webGpuEngine.getRenderDiagnostics().pgm as { source?: string | null; sourceId?: string } | undefined;
      const pgmVideo = pgmRender?.sourceId ? videoPool.get(pgmRender.sourceId) : undefined;
      return {
        moduleId,
        row,
        slotIndex,
        accepted,
        expectedEffectMode: SHADER_EFFECT_MODE[def.shaderKey ?? def.id] ?? Number.NaN,
        samples,
        pgm: {
          selectedCanvasId,
          selectedElementIdentity: eightVideoIdentity(selectedVideo),
          pgmElementIdentity: pgmVideo ? eightVideoIdentity(pgmVideo) : '',
          selectedCurrentSrc: selectedVideo.currentSrc,
          rendererSource: pgmRender?.source ?? null,
          rendererSourceId: pgmRender?.sourceId ?? '',
          decoderCount: rackSlotEntries().filter(({ canvasId }) => !!videoForRackSlot(canvasId)).length,
          documentVideoCount: document.querySelectorAll('video').length
        }
      };
    },
    async cutEightVideoPgm(moduleId: string, settleMs = 250) {
      const selectedCanvasId = currentRackSlotForModule(moduleId);
      const selected = selectedCanvasId ? videoPool.get(selectedCanvasId) : undefined;
      if (!selected) throw new Error(`Cannot cut missing eight-video slot: ${moduleId}`);
      cutImmediate(moduleId);
      webGpuEngine.setPgmLiveModule(moduleId, selectedCanvasId!);
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const render = webGpuEngine.getRenderDiagnostics().pgm as {
        sourceId?: string;
        source?: string | null; externalTextureImported?: boolean; externalTextureBound?: boolean;
        cachedTextureUploaded?: boolean; cachedTextureBound?: boolean; samplePath?: string;
      } | undefined;
      const rendererVideo = render?.sourceId ? videoPool.get(render.sourceId) : undefined;
      return {
        moduleId,
        decoderCount: rackSlotEntries().filter(({ canvasId }) => !!videoPool.get(canvasId)).length,
        documentVideoCount: document.querySelectorAll('video').length,
        selectedElementIdentity: eightVideoIdentity(selected),
        pgmElementIdentity: rendererVideo ? eightVideoIdentity(rendererVideo) : '',
        selectedSourceId: selectedCanvasId,
        rendererSourceId: render?.sourceId ?? '',
        selectedCurrentSrc: selected.currentSrc,
        rendererSource: render?.source ?? null,
        externalTextureImported: render?.externalTextureImported === true,
        externalTextureBound: render?.externalTextureBound === true,
        cachedTextureUploaded: render?.cachedTextureUploaded === true,
        cachedTextureBound: render?.cachedTextureBound === true,
        samplePath: render?.samplePath ?? ''
      };
    },
    realAudioSnapshot() {
      const state = audioEngine.getState();
      return {
        ...audioEngine.getProofPlaybackDiagnostics(),
        bpm: state.bpm,
        analysisStatus: state.analysisStatus,
        analysisConfidence: state.analysisConfidence
      };
    },
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
    async waitForUploadedTrackLoad(afterGeneration: number, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const snap = buildSnapshot();
        if (snap.uploadedTrackLoadGeneration > afterGeneration) return snap;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`Timed out waiting for uploaded track load after generation ${afterGeneration}`);
    },
    stopTransport() {
      audioEngine.stop('qa');
      return buildSnapshot();
    },
    async startTransport() {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (!audioEngine.getState().playing) {
        await audioEngine.start();
      }
      return buildSnapshot();
    },
    /** Simulates TopBar CLIPS — fetch fixture files and run the same loader. */
    async loadTopBarClips(count = 8) {
      const files = await fetchManifestClipFiles(count);
      const result = await loadRackClipsFromFiles(files);
      const want = Math.min(count, result.loaded);
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const snap = buildSnapshot();
        if (snap.clipsLoaded >= want) return { ...result, snap };
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`Timed out waiting for ${want} ready clips after TopBar load`);
    },
    /** Load the committed fixtures into the eight stable rack media slots once. */
    async loadVisualProofFixtures() {
      const files = await fetchManifestClipFiles(8);
      if (files.length !== 8) throw new Error(`Visual proof requires 8 fixture clips; received ${files.length}`);
      const result = await loadRackClipsFromFiles(files);
      if (result.loaded !== 8) throw new Error(`Fixture assignment loaded ${result.loaded}/8 stable slots`);
      const slotIds = activeRackSlotIds();
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const missing = slotIds.filter((slotId) => !videoPool.hasReadyFrame(slotId));
        if (missing.length === 0) {
          return {
            loaded: slotIds.length,
            assignments: Object.fromEntries(slotIds.map((slotId) => [slotId, get(videoLayers)[slotId]?.name ?? null]))
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for eight fixed visual-proof slot fixtures');
    },
    visualProofRealMediaSelectionState() {
      return { generation: visualProofSelectionGeneration };
    },
    async waitForVisualProofRealMediaSelection(afterGeneration: number, expectedName: string, timeoutMs = 5_000) {
      const deadline = performance.now() + timeoutMs;
      while (visualProofSelectionGeneration <= afterGeneration && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (visualProofSelectionGeneration <= afterGeneration) throw new Error(`Timed out waiting for capture-phase File selection: ${expectedName}`);
      if (visualProofSelectionError) throw new Error(visualProofSelectionError);
      const file = visualProofRealFiles[0];
      if (!file || file.name !== expectedName) throw new Error(`Captured ${file?.name ?? 'no file'}; expected ${expectedName}`);
      return { generation: visualProofSelectionGeneration, name: file.name, size: file.size, sha256: await visualProofSelectionHash };
    },
    async attachVisualProofRealClipToModule(moduleId: string) {
      const file = visualProofRealFiles[0];
      if (!file) throw new Error('No single real-media File was retained from the visible CLIP picker');
      const selectedCanvasId = ensureVisualProofModuleSlot(moduleId);
      const result = await mediaRuntime.registerModuleFileClip(selectedCanvasId, file);
      if (result.status !== 'success') throw new Error(`Real-media clip failed to load: ${file.name}`);
      cutImmediate(moduleId);
      webGpuEngine.setPgmLiveModule(moduleId, selectedCanvasId);
      videoPool.tick(audioTimeline.getLastFrame() ?? false);
      const deadline = performance.now() + 30_000;
      while (performance.now() < deadline) {
        const video = videoPool.get(selectedCanvasId);
        const pgm = webGpuEngine.getRenderDiagnostics().pgm as {
          bindingId?: string; source?: string | null; externalTextureImported?: boolean;
          externalTextureBound?: boolean; samplePath?: string;
        } | undefined;
        if (video && videoPool.hasReadyFrame(selectedCanvasId) && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 && video.videoHeight > 0 && Number.isFinite(video.duration) && video.duration > 0 &&
            pgm?.bindingId === 'pgm' && pgm.source === video.currentSrc && pgm.externalTextureImported === true &&
            pgm.externalTextureBound === true && pgm.samplePath === 'external-texture') {
          return { moduleId, sourceId: selectedCanvasId, fileName: file.name, currentSrc: video.currentSrc, videoWidth: video.videoWidth, videoHeight: video.videoHeight, durationSeconds: video.duration };
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      throw new Error(`Timed out waiting for decoded PGM frame for ${file.name} on ${moduleId}`);
    },
    async releaseVisualProofRealClip(moduleId: string, previousSource = '') {
      const sourceId = visualProofModuleSlots.get(moduleId) ?? currentRackSlotForModule(moduleId);
      if (sourceId) await mediaRuntime.removeModuleClip(sourceId);
      visualProofModuleSlots.delete(moduleId);
      const deadline = performance.now() + 5_000;
      let pgm = webGpuEngine.getRenderDiagnostics().pgm as { source?: string | null; hasVideo?: number } | undefined;
      while (previousSource && pgm?.source === previousSource && performance.now() < deadline) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        pgm = webGpuEngine.getRenderDiagnostics().pgm as { source?: string | null; hasVideo?: number } | undefined;
      }
      return {
        moduleId,
        released: !sourceId || !videoPool.get(sourceId),
        previousSourceUnbound: !previousSource || pgm?.source !== previousSource,
        decodedCount: activeRackSlotIds().filter((slotId) => videoPool.hasReadyFrame(slotId)).length
      };
    },
    async releaseAllVisualProofClips() {
      for (const slotId of RACK_SLOT_IDS) {
        if (videoPool.get(slotId)) await mediaRuntime.removeModuleClip(slotId);
      }
      visualProofModuleSlots.clear();
      return { decodedCount: activeRackSlotIds().filter((slotId) => videoPool.hasReadyFrame(slotId)).length };
    },
    realMediaDecodedCount() {
      return activeRackSlotIds().filter((slotId) => videoPool.hasReadyFrame(slotId)).length;
    },
    focusVisualProofModule(moduleId: string) {
      const sourceId = ensureVisualProofModuleSlot(moduleId);
      cutImmediate(moduleId);
      webGpuEngine.setPgmLiveModule(moduleId, sourceId);
      return { moduleId, sourceId, pgmModule: get(pgmSource) };
    },
    showVisualProofRealVideoProgress(index: number, total: number, fileName: string) {
      proofOverlay.textContent = `REAL VIDEO ${index}/${total} — ${fileName}`;
      proofOverlay.style.display = 'block';
      return proofOverlay.textContent;
    },
    hideVisualProofRealVideoProgress() {
      proofOverlay.style.display = 'none';
    },
    async waitForVisualProofClip(moduleId: string, fileName: string, timeoutMs = 30_000) {
      const { sourceId } = this.focusVisualProofModule(moduleId);
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        const video = videoPool.get(sourceId);
        const pgm = webGpuEngine.getRenderDiagnostics().pgm as {
          bindingId?: string; source?: string | null; externalTextureImported?: boolean;
          externalTextureBound?: boolean; samplePath?: string;
        } | undefined;
        if (get(videoLayers)[sourceId]?.name === fileName && video && videoPool.hasReadyFrame(sourceId) &&
            pgm?.bindingId === 'pgm' && pgm.source === video.currentSrc && pgm.externalTextureImported === true &&
            pgm.externalTextureBound === true && pgm.samplePath === 'external-texture') {
          return { moduleId, sourceId, pgmModule: get(pgmSource), currentSrc: video.currentSrc, bindingId: pgm.bindingId };
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for serial real clip ${fileName} on ${moduleId}`);
    },
    readVisualProofLiveClip() {
      const moduleId = get(pgmSource);
      const frame = audioTimeline.getLastFrame();
      const render = webGpuEngine.getRenderDiagnostics().pgm as {
        sourceId?: string;
        bindingId?: string;
        hasVideo?: number; externalTextureImported?: boolean; externalTextureBound?: boolean;
        samplePath?: string; source?: string | null; dimensions?: string | null; frameId?: number | null;
        videoSize?: string; timelineFrameId?: number;
      } | undefined;
      const sourceId = render?.sourceId ?? visualProofModuleSlots.get(moduleId) ?? '';
      const video = sourceId ? videoPool.get(sourceId) : undefined;
      if (!video || !frame) throw new Error('Live real-media diagnostics are unavailable');
      return {
        moduleId,
        pgmModule: get(pgmSource),
        bindingId: render?.bindingId ?? '',
        sourceId,
        fileName: get(videoLayers)[sourceId]?.name ?? '',
        currentSrc: video.currentSrc,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        durationSeconds: video.duration,
        mediaTimeSeconds: video.currentTime,
        transportSeconds: frame.transportSeconds,
        contextTimeSeconds: frame.contextTimeSeconds,
        centralFrameId: frame.frameId,
        hasVideo: render?.hasVideo === 1,
        externalTextureImported: render?.externalTextureImported === true,
        externalTextureBound: render?.externalTextureBound === true,
        samplePath: render?.samplePath ?? '',
        rendererSource: render?.source ?? null,
        rendererDimensions: render?.dimensions ?? null,
        rendererFrameId: render?.frameId ?? null,
        videoSize: render?.videoSize ?? null
      };
    },
    async sampleVisualProofFrameCadence(durationMs = 1100) {
      const before = this.readVisualProofLiveClip();
      const intervals: number[] = [];
      let previous = performance.now();
      const deadline = previous + durationMs;
      while (performance.now() < deadline) {
        await new Promise<void>((resolve) => requestAnimationFrame((now) => {
          intervals.push(now - previous);
          previous = now;
          resolve();
        }));
      }
      const sorted = [...intervals].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? Infinity;
      return {
        before,
        after: this.readVisualProofLiveClip(),
        frameIntervalsMs: intervals,
        sampleCount: intervals.length,
        p95IntervalMs: p95,
        maxIntervalMs: Math.max(...intervals),
        droppedFrames: intervals.filter((value) => value > 34).length,
        stalledFrames: intervals.filter((value) => value > 100).length
      };
    },
    async sampleRealAudioPlayback(durationMs = 3000) {
      audioEngine.setVolume(0.72);
      if (!audioEngine.getState().playing) await audioEngine.start();
      const before = audioEngine.getProofPlaybackDiagnostics();
      let rmsPeak = before.rms;
      let amplitudePeak = before.amplitude;
      const deadline = performance.now() + durationMs;
      while (performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const sample = audioEngine.getProofPlaybackDiagnostics();
        rmsPeak = Math.max(rmsPeak, sample.rms);
        amplitudePeak = Math.max(amplitudePeak, sample.amplitude);
      }
      return { before, after: audioEngine.getProofPlaybackDiagnostics(), rmsPeak, amplitudePeak, observationDurationMs: durationMs };
    },
    async resetVisualProofUiState() {
      moduleCollapsed.set({});
      fxLibOpen.set(true);
      pgmRailOpen.set(true);
      clearParams();
      audioEngine.setTempo(1);
      audioEngine.setPitch(0);
      audioEngine.setVolume(0.72);
      const keyShift = audioEngine.getSoundTouchState().keySemitones;
      if (keyShift !== 0) audioEngine.nudgeKey(-keyShift);
      if (!audioEngine.getState().usingUploadedTrack) {
        throw new Error('Visual proof requires Redline loaded through SONG -> LOCAL ONLY');
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return buildSnapshot();
    },
    async restoreVisualProofRack() {
      rackTop.set([...visualProofInitialRack.top]);
      rackBottom.set([...visualProofInitialRack.bottom]);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return { top: [...get(rackTop)], bottom: [...get(rackBottom)] };
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
    /** Sample time-manipulation modules while transport runs — beat should advance. */
    async sampleTimeModules(durationMs = 3000) {
      const ids = ['speedramp', 'tapdelay', 'timesampler', 'transition'] as const;
      const samples: Array<Record<string, unknown>> = [];
      const start = performance.now();
      while (performance.now() - start < durationMs) {
        const snap = buildSnapshot();
        const row: Record<string, unknown> = {
          t: performance.now() - start,
          beat: snap.beat,
          beatPhase: snap.beatPhase,
          playing: snap.playing
        };
        for (const id of ids) {
          const m = snap.modules[id];
          if (m) {
            row[`${id}_time`] = m.currentTime;
            row[`${id}_rate`] = m.playbackRate;
            row[`${id}_ready`] = m.hasReadyFrame;
          }
        }
        samples.push(row);
        await new Promise((r) => setTimeout(r, 150));
      }
      const first = samples[0] ?? {};
      const last = samples.at(-1) ?? {};
      const beatMoved = Number(last.beat) > Number(first.beat);
      const speedrampRateVaried =
        samples.some((s) => Number(s.speedramp_rate) !== Number(first.speedramp_rate));
      const timesamplerTimeMoved = Math.abs(Number(last.timesampler_time) - Number(first.timesampler_time)) > 0.05;
      return {
        samples,
        beatMoved,
        speedrampRateVaried,
        timesamplerTimeMoved,
        allReady: ids.every((id) => samples.every((s) => s[`${id}_ready`] === true))
      };
    },
    /** Randomize params on all rack modules while clips play — no throw = pass. */
    async exerciseLiveControls(iterations = 20) {
      const ids = [...new Set([...get(rackTop), ...get(rackBottom)])];
      const params = get(moduleParams);
      const errors: string[] = [];
      for (let i = 0; i < iterations; i++) {
        for (const id of ids) {
          const modParams = params[id];
          if (!modParams) continue;
          const keys = Object.keys(modParams);
          const key = keys[i % keys.length];
          if (!key) continue;
          try {
            const next = Math.round(Math.random() * 100);
            updateParam(id, key, next);
          } catch (err) {
            errors.push(`${id}.${key}: ${String(err)}`);
          }
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      const snap = buildSnapshot();
      return {
        ok: errors.length === 0 && snap.clipsLoaded >= 8,
        errors,
        clipsLoaded: snap.clipsLoaded,
        playing: snap.playing
      };
    },
    /** List catalog modules and whether each has a WGSL effect mode registered. */
    auditShaderCatalog() {
      return listCatalog().map((mod) => ({
        id: mod.id,
        shaderKey: mod.shaderKey ?? mod.id,
        effectMode: SHADER_EFFECT_MODE[mod.shaderKey ?? mod.id] ?? null,
        hasShader: (mod.shaderKey ?? mod.id) in SHADER_EFFECT_MODE
      }));
    },
    visualProofCatalog() {
      return listCatalog().flatMap((mod) => {
        const shaderKey = mod.shaderKey ?? mod.id;
        return [
          { id: `module:${mod.id}`, kind: 'module', subjectId: mod.id, label: mod.name },
          {
            id: `shader:${shaderKey}`,
            kind: 'shader',
            subjectId: shaderKey,
            label: `${mod.name} WGSL effect`,
            effectMode: SHADER_EFFECT_MODE[shaderKey] ?? null
          },
          ...(MODULE_PRESETS[mod.id] ?? []).map((preset) => ({
            id: `preset:${mod.id}:${preset.n}`,
            kind: 'preset',
            subjectId: `${mod.id}:${preset.n}`,
            label: `${mod.name} — ${preset.title}`
          }))
        ];
      });
    },
    async prepareVisualProofBaseline(itemId: string) {
      const [kind, moduleId, presetNumber] = itemId.split(':');
      const mod = listCatalog().find((entry) => {
        return kind === 'shader' ? (entry.shaderKey ?? entry.id) === moduleId : entry.id === moduleId;
      });
      if (!mod || !['module', 'shader', 'preset'].includes(kind)) {
        throw new Error(`Unsupported visual-proof item: ${itemId}`);
      }
      const sourceId = ensureVisualProofModuleSlot(mod.id);
      updateParams(mod.id, mod.params);
      bypassed.update((state) => ({ ...state, [mod.id]: true }));
      cutImmediate(mod.id);
      webGpuEngine.setPgmLiveModule(mod.id, sourceId);
      await new Promise((resolve) => setTimeout(resolve, 120));
      return {
        snapshot: buildSnapshot(),
        moduleId: mod.id,
        sourceId,
        fixtureClipName: get(videoLayers)[sourceId]?.name ?? '',
        currentSrc: videoPool.get(sourceId)?.currentSrc ?? '',
        bypassed: true,
        params: { ...get(moduleParams)[mod.id] }
      };
    },
    async applyVisualProofItem(itemId: string) {
      const [kind, moduleId, presetNumber] = itemId.split(':');
      const mod = listCatalog().find((entry) => {
        return kind === 'shader' ? (entry.shaderKey ?? entry.id) === moduleId : entry.id === moduleId;
      });
      if (!mod || !['module', 'shader', 'preset'].includes(kind)) {
        throw new Error(`Unsupported visual-proof item: ${itemId}`);
      }
      const sourceId = ensureVisualProofModuleSlot(mod.id);
      if (kind === 'preset') {
        const preset = (MODULE_PRESETS[mod.id] ?? []).find((entry) => entry.n === presetNumber);
        if (!preset) throw new Error(`Preset not found: ${itemId}`);
        updateParams(mod.id, preset.set);
      } else {
        const [key, value] = Object.entries(mod.params)[0] ?? [];
        if (!key || value === undefined) throw new Error(`No proof parameter exists for ${mod.id}`);
        updateParam(mod.id, key, value >= 100 ? value - 1 : value + 1);
      }
      bypassed.update((state) => ({ ...state, [mod.id]: false }));
      cutImmediate(mod.id);
      webGpuEngine.setPgmLiveModule(mod.id, sourceId);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const after = buildSnapshot();
      const render = after.render.pgm as { effectMode?: number; effectModuleId?: string; sourceId?: string } | undefined;
      const expectedMode = SHADER_EFFECT_MODE[mod.shaderKey ?? mod.id];
      if (expectedMode === undefined || render?.effectMode !== expectedMode ||
          render.effectModuleId !== mod.id || render.sourceId !== sourceId) {
        throw new Error(
          `WGSL effect did not render for ${itemId}: expected mode ${String(expectedMode)}, got ${String(render?.effectMode)}`
        );
      }
      return {
        snapshot: after,
        expectedMode,
        moduleId: mod.id,
        sourceId,
        fixtureClipName: get(videoLayers)[sourceId]?.name ?? '',
        currentSrc: videoPool.get(sourceId)?.currentSrc ?? '',
        bypassed: false,
        params: { ...get(moduleParams)[mod.id] }
      };
    },
    async setVisualProofTimelinePosition(targetSeconds: number) {
      if (!audioEngine.getState().usingUploadedTrack) {
        throw new Error('Fixed visual proof requires the uploaded QA audio fixture');
      }
      audioTimeline.pause();
      audioTimeline.seek(targetSeconds);
      const moduleId = get(pgmSource);
      const sourceId = visualProofModuleSlots.get(moduleId) ?? ensureVisualProofModuleSlot(moduleId);
      webGpuEngine.setPgmLiveModule(moduleId, sourceId);
      const video = videoPool.get(sourceId);
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error(`Fixed fixture media is not ready for ${moduleId}`);
      }
      // TimeSampler owns source-time actuation. Prime its deterministic schedule
      // before seeking so the generic transport target cannot race AppLoop.
      let timeSamplerSourceSeconds: number | undefined;
      if (moduleId === 'timesampler') {
        audioTimeline.publishFrame();
        timeSamplerSourceSeconds = audioEngine.getLiveScheduleFrame()?.timeSampler.sourceTimestampSeconds;
      }
      const expectedMediaTimeSeconds = visualProofExpectedMediaTime(
        moduleId,
        targetSeconds,
        video.duration,
        timeSamplerSourceSeconds
      );
      const seekDeadline = performance.now() + 15_000;
      while (video.seeking && performance.now() < seekDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      videoPool.seekModule(sourceId, expectedMediaTimeSeconds);
      while (
        (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 1 || video.videoHeight < 1 ||
          Math.abs(video.currentTime - expectedMediaTimeSeconds) > 2 / 30) &&
        performance.now() < seekDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          Math.abs(video.currentTime - expectedMediaTimeSeconds) > 2 / 30) {
        throw new Error(`Post-seek decoded frame is not ready for ${moduleId}`);
      }
      if (moduleId !== 'timesampler' && moduleId !== 'speedramp') videoPool.markFreeRun(sourceId);
      type ProofRender = {
        bindingId?: string;
        timelineFrameId?: number;
        timelineGeneration?: number;
        fixedStepIndex?: number;
        uniformHash?: string;
        hasVideo?: number;
        externalTextureImported?: boolean;
        externalTextureBound?: boolean;
        samplePath?: string;
        source?: string | null;
        sourceId?: string;
        effectModuleId?: string;
        dimensions?: string | null;
        frameId?: number | null;
      };
      let frame = audioTimeline.getLastFrame()!;
      let proofSubscriberFrames: number[] = [];
      let render: ProofRender | undefined;
      const renderDeadline = performance.now() + 5_000;
      do {
        proofSubscriberFrames = [];
        const unsubscribe = audioTimeline.subscribe((published) => proofSubscriberFrames.push(published.frameId), 1000);
        frame = audioTimeline.publishFrame();
        unsubscribe();
        render = webGpuEngine.getRenderDiagnostics().pgm as ProofRender | undefined;
        if (render?.bindingId === 'pgm' && render.timelineFrameId === frame.frameId && render.hasVideo === 1 &&
            render.sourceId === sourceId && render.effectModuleId === moduleId && render.source === video.currentSrc && render.externalTextureImported === true &&
            render.externalTextureBound === true && render.samplePath === 'external-texture') break;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      } while (performance.now() < renderDeadline);
      if (!render || render.bindingId !== 'pgm' || render.timelineFrameId !== frame.frameId || render.hasVideo !== 1 ||
          render.sourceId !== sourceId || render.effectModuleId !== moduleId || render.source !== video.currentSrc || render.externalTextureImported !== true ||
          render.externalTextureBound !== true || render.samplePath !== 'external-texture') {
        throw new Error(`Renderer did not consume central frame ${frame.frameId} for ${moduleId}`);
      }
      return {
        requestedSeconds: targetSeconds,
        transportSeconds: frame.transportSeconds,
        audioContextCurrentTime: frame.contextTimeSeconds,
        source: 'AudioContext.currentTime' as const,
        centralFrameId: frame.frameId,
        subscriberFrameIds: [frame.frameId, ...proofSubscriberFrames, render.timelineFrameId],
        generation: frame.generation,
        deterministicSeed: frame.deterministicSeed,
        fixedStepSeconds: frame.fixedStepSeconds,
        fixedStepIndex: frame.fixedStepIndex,
        uniformHash: render.uniformHash,
        expectedMediaTimeSeconds,
        actualMediaTimeSeconds: video.currentTime,
        mediaTimeToleranceSeconds: 2 / 30,
        sourceId,
        fixtureClipName: get(videoLayers)[sourceId]?.name ?? '',
        currentSrc: video.currentSrc,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        durationSeconds: video.duration,
        rendererHasVideo: render.hasVideo === 1,
        bindingId: render.bindingId,
        externalTextureImported: render.externalTextureImported === true,
        externalTextureBound: render.externalTextureBound === true,
        samplePath: render.samplePath ?? '',
        rendererSource: render.source ?? null,
        rendererDimensions: render.dimensions ?? null,
        rendererFrameId: render.frameId ?? null,
        moduleId
      };
    },
    /** Cycle PGM through every catalog module; confirm ready frame + shader mode. */
    async exerciseAllShaderModes(delayMs = 400) {
      const results: Array<{
        id: string;
        effectMode: number | null;
        hasReadyFrame: boolean;
        videoWidth: number;
      }> = [];
      for (const mod of listCatalog()) {
        const sourceId = ensureVisualProofModuleSlot(mod.id);
        cutImmediate(mod.id);
        webGpuEngine.setPgmLiveModule(mod.id, sourceId);
        await new Promise((r) => setTimeout(r, delayMs));
        const video = videoPool.get(sourceId);
        const render = webGpuEngine.getRenderDiagnostics().pgm;
        results.push({
          id: mod.id,
          effectMode: render?.effectModuleId === mod.id && render?.sourceId === sourceId
            ? render.effectMode : null,
          hasReadyFrame: videoPool.hasReadyFrame(sourceId),
          videoWidth: video?.videoWidth ?? 0
        });
      }
      return {
        ok: results.every((r) => r.hasReadyFrame && r.videoWidth > 0 && r.effectMode !== null),
        results,
        rackReady: results.filter((r) => r.hasReadyFrame).length,
        rackTotal: results.length,
        shaderModesRegistered: results.filter((r) => r.effectMode !== null).length,
        catalogTotal: results.length
      };
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
