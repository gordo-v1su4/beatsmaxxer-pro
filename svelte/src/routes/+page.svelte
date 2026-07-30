<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
  import { probeWebGpu } from '$lib/rendering/webgpu/capability';
  import { capabilities } from '$lib/stores/capabilities';
  import {
    moduleParams,
    videoLayers,
    midiLayers,
    rackTop,
    rackBottom,
    randomize,
    clearParams
  } from '$lib/stores/rack';
  import { listCatalog, catalogIds } from '$lib/modules/catalog';
  import TopBar from '$lib/components/TopBar.svelte';
  import PgmRail from '$lib/components/PgmRail.svelte';
  import MainViewer from '$lib/components/MainViewer.svelte';
  import RackSlot from '$lib/components/RackSlot.svelte';
  import ScrewRail from '$lib/components/rack/ScrewRail.svelte';
  import DragGhost from '$lib/components/DragGhost.svelte';
  import ModulePalette from '$lib/components/ModulePalette.svelte';
  import BeatSequencer from '$lib/components/BeatSequencer.svelte';
  import CapabilityGate from '$lib/components/CapabilityGate.svelte';
  import { mediaRuntime } from '$lib/runtime/media/MediaRuntime';
  import { pgmDirector } from '$lib/runtime/pgm/PgmDirector';
  import { startAppLoop, stopAppLoop } from '$lib/runtime/AppLoop';
  import { startTransportPoll, stopTransportPoll } from '$lib/stores/transportDisplay';
  import { installBspQaHook } from '$lib/qa/bspQa';
  import { fxHold } from '$lib/stores/rack';
  import { topRowCompact, bottomRowCompact } from '$lib/stores/rackUi';
  import { videoPool } from '$lib/media/VideoPool';
  import { audioEngine } from '$lib/audio';
  import { parseMidi } from '$lib/audio/MidiParser';

  const ALL_MODULES = listCatalog();
  const CLIP_SLOT_COUNT = catalogIds().length;

  let unsubHold: (() => void) | undefined;

  const loadedClipCount = $derived(
    ALL_MODULES.reduce((total, mod) => total + ($videoLayers[mod.id] ? 1 : 0), 0)
  );

  onMount(async () => {
    const cap = await probeWebGpu();
    capabilities.set(cap);
    if (cap.webgpu) {
      await webGpuEngine.init();
      webGpuEngine.start();
    }

    startTransportPoll();
    pgmDirector.start();
    startAppLoop();
    installBspQaHook();

    unsubHold = fxHold.subscribe((hold) => webGpuEngine.setPaused(hold));

    const params = new URLSearchParams(window.location.search);
    if (params.has('qa')) {
      await loadQaMedia();
    }
    if (params.get('qaAutoplay') === '1') {
      await audioEngine.start();
    }
  });

  onDestroy(() => {
    unsubHold?.();
    stopAppLoop();
    pgmDirector.stop();
    stopTransportPoll();
    videoPool.dispose();
    webGpuEngine.dispose();
  });

  async function loadQaMedia() {
    try {
      const res = await fetch('/qa-media/manifest.json');
      const manifest = await res.json();
      const clips: string[] = manifest.clips ?? [];
      const slotIds = [...$rackTop, ...$rackBottom];
      for (let i = 0; i < slotIds.length; i++) {
        const clip = clips[i % clips.length];
        if (!clip) continue;
        const moduleId = slotIds[i];
        const url = `/qa-media/${clip}`;
        videoLayers.update((layers) => ({
          ...layers,
          [moduleId]: { name: clip, url }
        }));
        await mediaRuntime.registerModuleClip(moduleId, clip, url);
      }
      if (manifest.audio) {
        await audioEngine.loadAudioUrl(`/qa-media/${manifest.audio}`, manifest.audio);
      }
      const bpm = Number(manifest.bpm);
      if (Number.isFinite(bpm) && bpm > 0) {
        audioEngine.setBPM(bpm);
      }
    } catch {
      /* optional */
    }
  }

  async function setModuleVideo(id: string, file: File) {
    const url = URL.createObjectURL(file);
    videoLayers.update((layers) => ({
      ...layers,
      [id]: { name: file.name, url, file }
    }));
    try {
      await mediaRuntime.registerModuleClip(id, file.name, url, file);
    } catch (err) {
      console.error(`[clip] failed to load video for ${id}:`, err);
    }
  }

  function clearModuleVideo(id: string) {
    videoLayers.update((layers) => ({ ...layers, [id]: null }));
    mediaRuntime.removeModuleClip(id);
  }

  async function setModuleMidi(id: string, file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const data = parseMidi(buffer);
      midiLayers.update((layers) => ({
        ...layers,
        [id]: { name: file.name, notes: data.notes, duration: data.duration }
      }));
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
    }
  }

  function clearModuleMidi(id: string) {
    midiLayers.update((layers) => ({ ...layers, [id]: null }));
  }

  function loadClips(files: File[]) {
    const clips = files.filter((f) => f.type.startsWith('video/'));
    if (clips.length === 0) return;

    const slotIds = [...$rackTop, ...$rackBottom];
    const current = $videoLayers;
    const targets: string[] = [];

    for (const id of slotIds) {
      if (targets.length >= clips.length) break;
      if (current[id]) continue;
      targets.push(id);
    }
    if (targets.length === 0) return;

    targets.forEach((moduleId, index) => {
      const file = clips[index];
      if (file) setModuleVideo(moduleId, file);
    });
  }

  function loadClipsFromModule(startId: string, files: File[]) {
    const clips = files.filter((f) => f.type.startsWith('video/'));
    if (clips.length === 0) return;

    const slotIds = [...$rackTop, ...$rackBottom];
    const current = $videoLayers;
    const targets: string[] = [startId];

    for (const id of slotIds) {
      if (targets.length >= clips.length) break;
      if (id === startId) continue;
      if (current[id]) continue;
      targets.push(id);
    }

    targets.forEach((moduleId, index) => {
      const file = clips[index];
      if (file) void setModuleVideo(moduleId, file);
    });
  }
</script>

<div class="app-viewport">
<DragGhost />
<CapabilityGate state={$capabilities} />

<div class="app-shell">
  <TopBar
    onRandomize={randomize}
    onClear={clearParams}
    onLoadClips={loadClips}
    {loadedClipCount}
    clipSlotCount={CLIP_SLOT_COUNT}
  />

  <div class="rack-workspace">
    <div class="side-panels" style="display:flex;flex-shrink:0">
      <ModulePalette />
      <ScrewRail side="left" class="hide-on-mobile" />
      <PgmRail modules={ALL_MODULES} />
    </div>

    <div style="width:3px;background:#0d0e0f;flex-shrink:0" class="hide-on-mobile"></div>

    <div class="rack-main">
      <MainViewer modules={ALL_MODULES} />

      <div
        class="rack-row"
        style="height:{$topRowCompact
          ? 'auto'
          : 'clamp(420px, calc((100vw - 334px) * 9 / 64 + 244px), 544px)'};flex-shrink:{$topRowCompact ? '0' : '0.15'};min-height:{$topRowCompact ? 'unset' : '300px'};transition:height 0.2s ease"
      >
        {#each $rackTop as moduleId, i (`top-${i}`)}
          <RackSlot
            row="top"
            slotIndex={i}
            canvasId="top-{i}"
            {moduleId}
            params={$moduleParams[moduleId] ?? {}}
            onVideoUpload={(f) => setModuleVideo(moduleId, f)}
            onVideosUpload={(files) => loadClipsFromModule(moduleId, files)}
            onClearVideo={() => clearModuleVideo(moduleId)}
            onMidiUpload={(f) => setModuleMidi(moduleId, f)}
            onClearMidi={() => clearModuleMidi(moduleId)}
          />
        {/each}
      </div>

      <div
        class="rack-row"
        style="height:{$bottomRowCompact
          ? 'auto'
          : 'clamp(240px, calc((100vw - 334px) * 9 / 64 + 96px), 404px)'};flex-shrink:{$bottomRowCompact ? '0' : '0.15'};min-height:{$bottomRowCompact ? 'unset' : '176px'};border-top:2px solid #0d0e0f;transition:height 0.2s ease"
      >
        {#each $rackBottom as moduleId, i (`bottom-${i}`)}
          <RackSlot
            row="bottom"
            slotIndex={i}
            canvasId="bottom-{i}"
            {moduleId}
            params={$moduleParams[moduleId] ?? {}}
            onVideoUpload={(f) => setModuleVideo(moduleId, f)}
            onVideosUpload={(files) => loadClipsFromModule(moduleId, files)}
            onClearVideo={() => clearModuleVideo(moduleId)}
          />
        {/each}
      </div>

      <BeatSequencer />
    </div>

    <ScrewRail side="right" class="hide-on-mobile" />
  </div>
</div>
</div>
